package documents

import (
	"database/sql"

	"docsense/api/internal/adapters/rag"
)

// Handler hosts HTTP handlers for document routes.
//
// Responsibilities:
// - Transport-level validation (file presence, size/type checks)
// - Orchestration of infrastructure calls (storage + DB + RAG service)
//
// Business rules and domain logic can be introduced later.
type Handler struct {
	db             *sql.DB
	storageDir     string
	maxUploadBytes int64
	ragClient      *rag.Client
}

func NewHandler(db *sql.DB, storageDir string, maxUploadBytes int64, ragClient *rag.Client) *Handler {
	return &Handler{db: db, storageDir: storageDir, maxUploadBytes: maxUploadBytes, ragClient: ragClient}
}
