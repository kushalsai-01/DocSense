package documents

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"docsense/backend-go/internal/middleware"

	"github.com/gin-gonic/gin"
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

	if err := h.insertDocumentMetadata(c.Request.Context(), docID, userID, safeFilename, storageRel, fileHeader.Size); err != nil {
		_ = os.Remove(storageAbs)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist metadata"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"document_id": docID})
}

func (h *Handler) newDocumentID(ctx context.Context) (string, error) {
	// Use Postgres to generate UUID so we don't introduce a UUID dependency.
	var id string
	if err := h.db.QueryRowContext(ctx, "SELECT gen_random_uuid()::text").Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

func (h *Handler) insertDocumentMetadata(ctx context.Context, documentID, userID, filename, storagePath string, sizeBytes int64) error {
	// Minimal metadata; additional columns can be added as the product evolves.
	meta := map[string]any{
		"original_filename": filename,
		"storage":          "local",
	}
	metaJSON, _ := json.Marshal(meta)

	_, err := h.db.ExecContext(
		ctx,
		`INSERT INTO documents (id, user_id, title, source_type, mime_type, size_bytes, filename, storage_path, status, metadata)
		 VALUES ($1, $2, $3, 'upload', 'application/pdf', $4, $5, $6, 'ready', $7::jsonb)`,
		documentID,
		userID,
		filename,
		sizeBytes,
		filename,
		storagePath,
		string(metaJSON),
	)
	return err
}

func validatePDF(fh *multipart.FileHeader) error {
	name := strings.ToLower(fh.Filename)
	if !strings.HasSuffix(name, ".pdf") {
		return fmt.Errorf("only PDF files are supported")
	}

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

func sanitizeFilename(name string) string {
	base := filepath.Base(name)
	base = strings.TrimSpace(base)
	if base == "" {
		return "document.pdf"
	}
	// Avoid path separators on any OS.
	base = strings.ReplaceAll(base, "\\", "_")
	base = strings.ReplaceAll(base, "/", "_")
	return base
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
