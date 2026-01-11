package rag

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"docsense/api/internal/adapters/config"
)

// Client provides HTTP client for RAG service communication.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new RAG service client.
func NewClient(cfg config.RAGConfig) *Client {
	return &Client{
		baseURL: cfg.BaseURL,
		httpClient: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

// ChunkIn represents a chunk for embedding.
type ChunkIn struct {
	ChunkID    string `json:"chunk_id"`
	ChunkIndex int    `json:"chunk_index"`
	Text       string `json:"text"`
}

// EmbedRequest is the request payload for embedding chunks.
type EmbedRequest struct {
	DocumentID string    `json:"document_id"`
	Chunks     []ChunkIn `json:"chunks"`
}

// EmbedResponse is the response from embedding endpoint.
type EmbedResponse struct {
	Upserted int `json:"upserted"`
}

// QueryRequest is the request payload for query endpoint.
type QueryRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}

// Citation represents a source citation.
type Citation struct {
	ChunkID     string  `json:"chunk_id"`
	DocumentID  *string `json:"document_id"`
	ChunkIndex  *int    `json:"chunk_index"`
	TextSnippet *string `json:"text_snippet"`
}

// RetrievedChunkOut represents a retrieved chunk from query.
type RetrievedChunkOut struct {
	ID         string  `json:"id"`
	Score      float64 `json:"score"`
	DocumentID *string `json:"document_id"`
	Text       *string `json:"text"`
}

// QueryResponse is the response from query endpoint.
type QueryResponse struct {
	Answer    string             `json:"answer"`
	Citations []Citation         `json:"citations"`
	Matches   []RetrievedChunkOut `json:"matches"`
}

// EmbedChunks sends chunks to the RAG service for embedding and indexing.
func (c *Client) EmbedChunks(ctx context.Context, documentID string, chunks []ChunkIn) (int, error) {
	reqBody := EmbedRequest{
		DocumentID: documentID,
		Chunks:     chunks,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return 0, fmt.Errorf("marshal embed request: %w", err)
	}

	url := c.baseURL + "/embed"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return 0, fmt.Errorf("create embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("execute embed request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("embed request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var embedResp EmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&embedResp); err != nil {
		return 0, fmt.Errorf("decode embed response: %w", err)
	}

	return embedResp.Upserted, nil
}

// Query sends a query to the RAG service and returns the answer with citations.
func (c *Client) Query(ctx context.Context, query string, topK int) (*QueryResponse, error) {
	reqBody := QueryRequest{
		Query: query,
		TopK:  topK,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal query request: %w", err)
	}

	url := c.baseURL + "/query"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("create query request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute query request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("query request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var queryResp QueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&queryResp); err != nil {
		return nil, fmt.Errorf("decode query response: %w", err)
	}

	return &queryResp, nil
}
