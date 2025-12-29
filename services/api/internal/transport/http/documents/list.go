package documents

import (
	"database/sql"
	"net/http"
	"time"

	"docsense/api/internal/transport/http/middleware"

	"github.com/gin-gonic/gin"
)

// List returns documents visible to the authenticated user.
// Route: GET /api/documents
func (h *Handler) List(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		middleware.AbortUnauthorized(c)
		return
	}

	rows, err := h.db.QueryContext(
		c.Request.Context(),
		`SELECT id, title, filename, mime_type, size_bytes, created_at, status
     FROM documents
     WHERE user_id = $1
     ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query documents"})
		return
	}
	defer rows.Close()

	type docResp struct {
		ID        string    `json:"id"`
		Title     *string   `json:"title"`
		Filename  *string   `json:"filename"`
		MimeType  *string   `json:"mime_type"`
		SizeBytes *int64    `json:"size_bytes"`
		CreatedAt time.Time `json:"created_at"`
		Status    *string   `json:"status"`
	}

	var out []docResp

	for rows.Next() {
		var d docResp
		var title, filename, mimeType, status sql.NullString
		var size sql.NullInt64
		if err := rows.Scan(&d.ID, &title, &filename, &mimeType, &size, &d.CreatedAt, &status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan row"})
			return
		}
		if title.Valid {
			d.Title = &title.String
		}
		if filename.Valid {
			d.Filename = &filename.String
		}
		if mimeType.Valid {
			d.MimeType = &mimeType.String
		}
		if size.Valid {
			d.SizeBytes = &size.Int64
		}
		if status.Valid {
			d.Status = &status.String
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "row iteration error"})
		return
	}

	// Ensure empty array instead of null
	if out == nil {
		out = []docResp{}
	}

	c.JSON(http.StatusOK, out)
}
