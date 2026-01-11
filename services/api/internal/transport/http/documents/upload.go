package documents

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"docsense/api/internal/adapters/rag"
	"docsense/api/internal/app"
	"docsense/api/internal/ingest/chunk"
	"docsense/api/internal/ingest/extract"
	"docsense/api/internal/transport/http/middleware"

	"github.com/gin-gonic/gin"
	uuid "github.com/google/uuid"
)

// Upload handles multipart PDF uploads.
//
// Route: POST /api/documents/upload
// Form field: "file"
func (h *Handler) Upload(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		middleware.AbortUnauthorized(c)
		return
	}

	if middleware.IsDevAuth(c) {
		if err := h.ensureDevUserExists(c.Request.Context(), userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to provision user"})
			return
		}
	}

	// Enforce a hard limit on request body size.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.maxUploadBytes)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}

	if fileHeader.Size <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty file"})
		return
	}
	if fileHeader.Size > h.maxUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
		return
	}

	if err := validatePDF(fileHeader); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	docID, err := h.newDocumentID(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to allocate document id"})
		return
	}

	safeFilename := sanitizeFilename(fileHeader.Filename)
	storageRel := filepath.ToSlash(filepath.Join(userID, fmt.Sprintf("%s_%s", docID, safeFilename)))
	storageAbs := filepath.Join(h.storageDir, filepath.FromSlash(storageRel))

	if err := os.MkdirAll(filepath.Dir(storageAbs), 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare storage"})
		return
	}

	if err := saveMultipartFileAtomic(fileHeader, storageAbs); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, errRequestTooLarge) {
			status = http.StatusRequestEntityTooLarge
		}
		c.JSON(status, gin.H{"error": "failed to save file"})
		return
	}

	// Calculate SHA256 checksum for deduplication
	checksum, err := calculateSHA256(storageAbs)
	if err != nil {
		_ = os.Remove(storageAbs)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to calculate file checksum"})
		return
	}

	mimeType := fileHeader.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if err := h.insertDocumentMetadata(c.Request.Context(), docID, userID, safeFilename, storageRel, fileHeader.Size, mimeType, checksum); err != nil {
		_ = os.Remove(storageAbs)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist metadata"})
		return
	}

	// Synchronously extract text (simple, no chunking) and persist to document_contents.
	content, err := extract.ExtractText(storageAbs, mimeType)
	if err != nil {
		_ = os.Remove(storageAbs)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to extract document text"})
		return
	}

	if err := h.insertDocumentContent(c.Request.Context(), docID, content); err != nil {
		_ = os.Remove(storageAbs)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist document content"})
		return
	}

	// Deterministically chunk the extracted text and persist chunks.
	// Convert document id string to uuid.UUID
	docUUID, err := uuid.Parse(docID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid document id"})
		return
	}
	chunks, err := chunk.ChunkText(docUUID, content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to chunk document text"})
		return
	}
	if len(chunks) > 0 {
		if err := h.insertDocumentChunks(c.Request.Context(), chunks); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist document chunks"})
			return
		}

		// Send chunks to RAG service for embedding and indexing
		ragChunks := make([]rag.ChunkIn, len(chunks))
		for i, ch := range chunks {
			chunkID, err := h.getChunkIDByIndex(c.Request.Context(), docID, ch.Index)
			if err != nil {
				log.Printf("warning: failed to get chunk ID for index %d: %v", ch.Index, err)
				continue
			}
			ragChunks[i] = rag.ChunkIn{
				ChunkID:    chunkID,
				ChunkIndex: ch.Index,
				Text:       ch.Content,
			}
		}

		if len(ragChunks) > 0 {
			if _, err := h.ragClient.EmbedChunks(c.Request.Context(), docID, ragChunks); err != nil {
				log.Printf("warning: failed to embed chunks: %v", err)
				// Don't fail the upload, but log the error
			}
		}
	}

	if err := h.updateDocumentStatus(c.Request.Context(), docID, "ready"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update document status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"document_id": docID})
}

func (h *Handler) ensureDevUserExists(ctx context.Context, userID string) error {
	// In dev mode we allow automatic provisioning so uploads work without a
	// separate user creation flow.
	email := fmt.Sprintf("dev+%s@example.local", userID)
	_, err := h.db.ExecContext(
		ctx,
		`INSERT INTO users (id, email, display_name, status)
		 VALUES ($1, $2, 'Dev User', 'active')
		 ON CONFLICT (id) DO NOTHING`,
		userID,
		email,
	)
	return err
}

func (h *Handler) newDocumentID(ctx context.Context) (string, error) {
	// Use Postgres to generate UUID so we don't introduce a UUID dependency.
	var id string
	if err := h.db.QueryRowContext(ctx, "SELECT gen_random_uuid()::text").Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

func (h *Handler) insertDocumentMetadata(ctx context.Context, documentID, userID, filename, storagePath string, sizeBytes int64, mimeType, checksumSHA256 string) error {
	// Minimal metadata; additional columns can be added as the product evolves.
	meta := map[string]any{
		"original_filename": filename,
		"storage":           "local",
	}
	metaJSON, _ := json.Marshal(meta)

	// Document lifecycle states (minimal):
	// - 'uploaded': file has been received and metadata persisted. Next step is ingestion.
	// - 'ingesting': background ingestion/processing is ongoing (e.g., text extraction, embeddings).
	// - 'ready': ingestion completed and document is available for search.
	// On upload we create or update the document row and set status = 'uploaded'.
	// Use an upsert so repeated uploads for the same id (shouldn't normally happen)
	// will result in updating the storage path / filename and resetting the status.
	_, err := h.db.ExecContext(
		ctx,
		`INSERT INTO documents (id, user_id, title, source_type, mime_type, size_bytes, filename, storage_path, status, metadata, checksum_sha256)
		 VALUES ($1, $2, $3, 'upload', $4, $5, $6, $7, 'uploaded', $8::jsonb, $9)
		 ON CONFLICT (id) DO UPDATE SET
		   user_id = EXCLUDED.user_id,
		   title = EXCLUDED.title,
		   source_type = EXCLUDED.source_type,
		   mime_type = EXCLUDED.mime_type,
		   size_bytes = EXCLUDED.size_bytes,
		   filename = EXCLUDED.filename,
		   storage_path = EXCLUDED.storage_path,
		   status = 'uploaded',
		   metadata = EXCLUDED.metadata,
		   checksum_sha256 = EXCLUDED.checksum_sha256`,
		documentID,
		userID,
		filename,
		mimeType,
		sizeBytes,
		filename,
		storagePath,
		string(metaJSON),
		checksumSHA256,
	)
	return err
}

func validatePDF(fh *multipart.FileHeader) error {
	name := strings.ToLower(fh.Filename)
	if strings.HasSuffix(name, ".pdf") {
		f, err := fh.Open()
		if err != nil {
			return fmt.Errorf("unable to read file")
		}
		defer func() { _ = f.Close() }()

		header := make([]byte, 5)
		_, err = io.ReadFull(f, header)
		if err != nil {
			return fmt.Errorf("unable to read file")
		}
		if string(header) != "%PDF-" {
			return fmt.Errorf("invalid PDF signature")
		}
		return nil
	}
	if strings.HasSuffix(name, ".txt") || strings.HasSuffix(name, ".md") {
		return nil
	}
	return fmt.Errorf("only PDF, TXT, and MD files are supported")
}

func sanitizeFilename(name string) string {
	base := filepath.Base(name)
	return app.ValidateDocumentFilename(base)
}

var errRequestTooLarge = errors.New("request too large")

func saveMultipartFileAtomic(fh *multipart.FileHeader, dst string) error {
	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer func() { _ = src.Close() }()

	dir := filepath.Dir(dst)
	tmp, err := os.CreateTemp(dir, ".upload-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()

	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}()

	if _, err := io.Copy(tmp, src); err != nil {
		// When MaxBytesReader trips, the copy may fail.
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return errRequestTooLarge
		}
		return err
	}

	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, dst); err != nil {
		return err
	}
	return nil
}

func (h *Handler) insertDocumentContent(ctx context.Context, documentID, content string) error {
	_, err := h.db.ExecContext(
		ctx,
		`INSERT INTO document_contents (document_id, content) VALUES ($1, $2)
		 ON CONFLICT (document_id) DO UPDATE SET content = EXCLUDED.content, created_at = now()`,
		documentID,
		content,
	)
	return err
}

func (h *Handler) updateDocumentStatus(ctx context.Context, documentID, status string) error {
	_, err := h.db.ExecContext(ctx, `UPDATE documents SET status = $1, updated_at = now() WHERE id = $2`, status, documentID)
	return err
}

func (h *Handler) insertDocumentChunks(ctx context.Context, chunks []chunk.Chunk) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	stmt := `INSERT INTO document_chunks (id, document_id, chunk_index, content_text, token_count, created_at, updated_at)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())`

	for _, ch := range chunks {
		_, err = tx.ExecContext(ctx, stmt, ch.DocumentID.String(), ch.Index, ch.Content, ch.TokenCount)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (h *Handler) getChunkIDByIndex(ctx context.Context, documentID string, chunkIndex int) (string, error) {
	var chunkID string
	err := h.db.QueryRowContext(
		ctx,
		`SELECT id::text FROM document_chunks WHERE document_id = $1 AND chunk_index = $2`,
		documentID,
		chunkIndex,
	).Scan(&chunkID)
	return chunkID, err
}

// calculateSHA256 computes the SHA256 hash of a file.
func calculateSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}
