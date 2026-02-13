package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client provides HTTP client for Agent service communication.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// AgentConfig holds agent service connection settings.
type AgentConfig struct {
	BaseURL string
	Timeout time.Duration
}

// NewClient creates a new Agent service client.
func NewClient(cfg AgentConfig) *Client {
	return &Client{
		baseURL: cfg.BaseURL,
		httpClient: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

// QueryRequest is the request payload for agent query endpoint.
type QueryRequest struct {
	Query              string  `json:"query"`
	SessionID          *string `json:"session_id,omitempty"`
	UserID             *string `json:"user_id,omitempty"`
	TopK               int     `json:"top_k"`
	EnablePlanning     bool    `json:"enable_planning"`
	EnableEvaluation   bool    `json:"enable_evaluation"`
	IncludeTrace       bool    `json:"include_trace"`
	IncludeSuggestions bool    `json:"include_suggestions"`
}

// Citation represents a source citation from the agent.
type Citation struct {
	ChunkID     string  `json:"chunk_id"`
	DocumentID  *string `json:"document_id,omitempty"`
	ChunkIndex  *int    `json:"chunk_index,omitempty"`
	TextSnippet *string `json:"text_snippet,omitempty"`
}

// AgentStep represents a single reasoning step.
type AgentStep struct {
	Step       int    `json:"step"`
	Phase      string `json:"phase"`
	Content    string `json:"content"`
	Tool       string `json:"tool,omitempty"`
	DurationMs int    `json:"duration_ms"`
}

// QueryResponse is the response from the agent query endpoint.
type QueryResponse struct {
	Answer              string            `json:"answer"`
	Citations           []Citation        `json:"citations"`
	Suggestions         []string          `json:"suggestions"`
	Strategy            *string           `json:"strategy,omitempty"`
	AgentTrace          []AgentStep       `json:"agent_trace"`
	ConversationSummary map[string]any    `json:"conversation_summary,omitempty"`
	TotalDurationMs     int               `json:"total_duration_ms"`
	Status              string            `json:"status"`
	Matches             []json.RawMessage `json:"matches"`
}

// Query sends a query through the agent orchestration layer.
func (c *Client) Query(ctx context.Context, req QueryRequest) (*QueryResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal agent query request: %w", err)
	}

	url := c.baseURL + "/agent/query"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("create agent query request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute agent query request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("agent query failed with status %d: %s", resp.StatusCode, string(body))
	}

	var queryResp QueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&queryResp); err != nil {
		return nil, fmt.Errorf("decode agent query response: %w", err)
	}

	return &queryResp, nil
}

// Health checks if the agent service is reachable.
func (c *Client) Health(ctx context.Context) error {
	url := c.baseURL + "/agent/health"
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("create health request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("agent health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("agent health check returned status %d", resp.StatusCode)
	}
	return nil
}
