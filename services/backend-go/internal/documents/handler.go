package documents

import "database/sql"

// Handler hosts HTTP handlers for document routes.
//
// Responsibilities:
// - Transport-level validation (file presence, size/type checks)
// - Orchestration of infrastructure calls (storage + DB)
//
// Business rules and domain logic can be introduced later.
type Handler struct {
	db             *sql.DB
	storageDir     string
	maxUploadBytes int64
}

func NewHandler(db *sql.DB, storageDir string, maxUploadBytes int64) *Handler {
	return &Handler{db: db, storageDir: storageDir, maxUploadBytes: maxUploadBytes}
}
