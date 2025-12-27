-- DocSense PostgreSQL schema (metadata + relationships only)
-- Notes:
-- - No file binaries stored in Postgres.
-- - UUID primary keys using pgcrypto's gen_random_uuid().
-- - Timestamps use timestamptz.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users: application identities (authentication data can be modeled separately later).
CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    display_name  text,
    status        text NOT NULL DEFAULT 'active',

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness is typically preferred for email.
-- We keep it simple with lower(email) unique index (no citext dependency).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);


-- Documents: metadata about uploaded/ingested content; not the file bytes.
CREATE TABLE IF NOT EXISTS documents (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Upload/storage metadata (no file binaries stored here).
    filename       text,
    storage_path   text,

    title          text,
    source_type    text NOT NULL DEFAULT 'upload',
    source_uri     text,

    mime_type      text,
    size_bytes     bigint,
    checksum_sha256 text,

    status         text NOT NULL DEFAULT 'ready',
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents (user_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents (created_at);
-- Helpful for deduplicating uploads per-user when checksum is available.
CREATE INDEX IF NOT EXISTS documents_user_checksum_idx ON documents (user_id, checksum_sha256);
CREATE INDEX IF NOT EXISTS documents_user_storage_path_idx ON documents (user_id, storage_path);


-- Document chunks: text segments derived from documents.
-- Embeddings live in Qdrant; we store only the relationship to the vector record.
CREATE TABLE IF NOT EXISTS document_chunks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    chunk_index     integer NOT NULL,
    content_text    text NOT NULL,
    token_count     integer,

    -- Link to vector DB record (Qdrant point ID). Store as UUID; can be text if you prefer.
    qdrant_point_id uuid,

    -- Optional offsets if chunks are derived from a single normalized text stream.
    start_offset    integer,
    end_offset      integer,

    content_sha256  text,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT document_chunks_document_chunk_index_uq UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS document_chunks_qdrant_point_id_idx ON document_chunks (qdrant_point_id);
CREATE INDEX IF NOT EXISTS document_chunks_created_at_idx ON document_chunks (created_at);
