package documents

import (
	"log"
	"net/http"

	"docsense/api/internal/adapters/agent"
	"docsense/api/internal/app"
	"docsense/api/internal/transport/http/middleware"

	"github.com/gin-gonic/gin"
)

// QueryRequest represents the query request body.
type QueryRequest struct {
	Query              string  `json:"query" binding:"required,min=1"`
	TopK               int     `json:"top_k,omitempty"`
	SessionID          *string `json:"session_id,omitempty"`
	IncludeTrace       bool    `json:"include_trace,omitempty"`
	IncludeSuggestions *bool   `json:"include_suggestions,omitempty"`
	PipelineMode       string  `json:"pipeline_mode,omitempty"` // "rag" or "agent"
}

// Query handles document queries via Agent → RAG pipeline.
//
// When Agent service is enabled (default), queries flow through the
// agentic orchestration layer for planning, multi-step reasoning,
// and self-evaluation. When disabled, falls back to direct RAG.
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
		req.TopK = 5
	}
	if req.TopK > 50 {
		req.TopK = 50
	}

	// Route based on pipeline_mode parameter
	// If "rag" is explicitly requested, bypass agent
	if req.PipelineMode == "rag" {
		h.queryViaRAG(c, req)
		return
	}

	// Route through Agent service when enabled (default or when pipeline_mode="agent")
	if h.agentEnabled && h.agentClient != nil {
		h.queryViaAgent(c, req, userID)
		return
	}

	// Fallback: direct RAG query (backward-compatible)
	h.queryViaRAG(c, req)
}

// queryViaAgent routes through the Agent orchestration layer.
func (h *Handler) queryViaAgent(c *gin.Context, req QueryRequest, userID string) {
	includeSuggestions := true
	if req.IncludeSuggestions != nil {
		includeSuggestions = *req.IncludeSuggestions
	}

	uid := userID
	agentReq := agent.QueryRequest{
		Query:              req.Query,
		SessionID:          req.SessionID,
		UserID:             &uid,
		TopK:               req.TopK,
		EnablePlanning:     true,
		EnableEvaluation:   true,
		IncludeTrace:       req.IncludeTrace,
		IncludeSuggestions: includeSuggestions,
	}

	resp, err := h.agentClient.Query(c.Request.Context(), agentReq)
	if err != nil {
		log.Printf("agent query failed, falling back to RAG: %v", err)
		// Graceful degradation: fall back to direct RAG
		h.queryViaRAG(c, req)
		return
	}

	// Build response (agent-enriched)
	citations := make([]map[string]interface{}, len(resp.Citations))
	for i, cit := range resp.Citations {
		citMap := map[string]interface{}{
			"chunk_id":     cit.ChunkID,
			"text_snippet": cit.TextSnippet,
		}
		if cit.DocumentID != nil {
			citMap["document_id"] = *cit.DocumentID
		}
		if cit.ChunkIndex != nil {
			citMap["chunk_index"] = *cit.ChunkIndex
		}
		citations[i] = citMap
	}

	result := gin.H{
		"answer":            resp.Answer,
		"citations":         citations,
		"suggestions":       resp.Suggestions,
		"strategy":          resp.Strategy,
		"status":            resp.Status,
		"total_duration_ms": resp.TotalDurationMs,
	}

	if req.IncludeTrace {
		result["agent_trace"] = resp.AgentTrace
	}
	if resp.ConversationSummary != nil {
		result["conversation_summary"] = resp.ConversationSummary
	}

	c.JSON(http.StatusOK, result)
}

// queryViaRAG falls back to direct RAG service query.
func (h *Handler) queryViaRAG(c *gin.Context, req QueryRequest) {
	resp, err := h.ragClient.Query(c.Request.Context(), req.Query, req.TopK)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed: " + err.Error()})
		return
	}

	citations := make([]map[string]interface{}, len(resp.Citations))
	for i, cit := range resp.Citations {
		citMap := map[string]interface{}{
			"chunk_id":     cit.ChunkID,
			"chunk_index":  cit.ChunkIndex,
			"text_snippet": cit.TextSnippet,
		}
		if cit.DocumentID != nil {
			citMap["document_id"] = *cit.DocumentID
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
