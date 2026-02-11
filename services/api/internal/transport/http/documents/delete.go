package documents

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"docsense/api/internal/transport/http/middleware"

	"github.com/gin-gonic/gin"
)

// Delete removes a document and its associated data.
//
// Route: DELETE /api/documents/:id
//
// The PostgreSQL schema uses ON DELETE CASCADE, so deleting from `documents`
// automatically removes related rows in `document_contents` and `document_chunks`.
// The local file is also removed from disk.
func (h *Handler) Delete(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		middleware.AbortUnauthorized(c)
		return
	}

	docID := c.Param("id")
	if docID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing document id"})
		return
	}

	// Look up the storage path so we can remove the file after the DB delete.
	var storagePath sql.NullString
	err := h.db.QueryRowContext(
		c.Request.Context(),
		`SELECT storage_path FROM documents WHERE id = $1 AND user_id = $2`,
		docID,
		userID,
	).Scan(&storagePath)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to look up document"})
		return
	}

	// Delete the document row. CASCADE handles chunks and contents.
	_, err = h.db.ExecContext(
		c.Request.Context(),
		`DELETE FROM documents WHERE id = $1 AND user_id = $2`,
		docID,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete document"})
		return
	}

	// Best-effort file removal (don't fail the request if the file is already gone).
	if storagePath.Valid && storagePath.String != "" {
		abs := filepath.Join(h.storageDir, filepath.FromSlash(storagePath.String))
		_ = os.Remove(abs)
	}

	// Best-effort: remove vectors from Qdrant for this document.
	// Chunk rows are already cascade-deleted from Postgres above.
	if err := h.ragClient.DeleteDocumentVectors(c.Request.Context(), docID); err != nil {
		log.Printf("warning: failed to delete qdrant vectors for document %s: %v", docID, err)
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}
