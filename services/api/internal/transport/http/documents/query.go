package documents

import (
	"net/http"

	"docsense/api/internal/adapters/rag"
	"docsense/api/internal/app"
	"docsense/api/internal/transport/http/middleware"

	"github.com/gin-gonic/gin"
)

// QueryRequest represents the query request body.
type QueryRequest struct {
	Query string `json:"query" binding:"required,min=1"`
	TopK  int    `json:"top_k,omitempty"`
}

// Query handles document queries via RAG.
//
// Route: POST /api/documents/query
func (h *Handler) Query(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		middleware.AbortUnauthorized(c)
		return
	}

	var req QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	// Sanitize and validate query input
	sanitizedQuery, isValid := app.SanitizeQuery(req.Query)
	if !isValid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid query: contains suspicious content or invalid characters"})
		return
	}
	req.Query = sanitizedQuery

	if req.TopK <= 0 {
		req.TopK = 5 // Default
	}
	if req.TopK > 50 {
		req.TopK = 50 // Max
	}

	// Call RAG service
	resp, err := h.ragClient.Query(c.Request.Context(), req.Query, req.TopK)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed: " + err.Error()})
		return
	}

	// Convert citations to include document metadata if available
	citations := make([]map[string]interface{}, len(resp.Citations))
	for i, cit := range resp.Citations {
		citMap := map[string]interface{}{
			"chunk_id":     cit.ChunkID,
			"chunk_index":  cit.ChunkIndex,
			"text_snippet": cit.TextSnippet,
		}
		if cit.DocumentID != nil {
			citMap["document_id"] = *cit.DocumentID
			// Note: Document metadata could be fetched here if needed
			// For now, we return the document_id for the frontend to resolve
		}
		citations[i] = citMap
	}

	matches := make([]map[string]interface{}, len(resp.Matches))
	for i, m := range resp.Matches {
		matchMap := map[string]interface{}{
			"id":    m.ID,
			"score": m.Score,
		}
		if m.DocumentID != nil {
			matchMap["document_id"] = *m.DocumentID
		}
		if m.Text != nil {
			matchMap["text"] = *m.Text
		}
		matches[i] = matchMap
	}

	c.JSON(http.StatusOK, gin.H{
		"answer":    resp.Answer,
		"citations": citations,
		"matches":   matches,
	})
}
