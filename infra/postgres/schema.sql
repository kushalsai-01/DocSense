-- DocSense production schema
-- Idempotent: safe to run multiple times

-- ── Extensions ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email        VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name         VARCHAR(255),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sessions (JWT refresh tokens) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(512) UNIQUE NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Workspaces ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID        REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(50) DEFAULT 'member',
    joined_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- ── Documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        REFERENCES users(id) ON DELETE CASCADE,
    workspace_id      UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
    name              VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500),
    file_type         VARCHAR(50),
    file_size_bytes   INTEGER,
    status            VARCHAR(50)  DEFAULT 'processing',  -- processing|ready|error
    page_count        INTEGER,
    chunk_count       INTEGER,
    storage_path      VARCHAR(1000),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_contents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
    full_text   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID    REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT    NOT NULL,
    token_count     INTEGER,
    qdrant_point_id UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- AI-enriched metadata (written by agent intelligence pipeline)
CREATE TABLE IF NOT EXISTS document_metadata (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
    summary       TEXT,
    topics        JSONB       DEFAULT '[]',
    entities      JSONB       DEFAULT '{}',
    key_insights  JSONB       DEFAULT '[]',
    document_type VARCHAR(100),
    processed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Conversations & messages ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    session_id   VARCHAR(255) PRIMARY KEY,
    user_id      UUID        REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
    title        VARCHAR(500),
    status       VARCHAR(50)  DEFAULT 'active',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    VARCHAR(255) REFERENCES conversations(session_id) ON DELETE CASCADE,
    role          VARCHAR(50)  NOT NULL,  -- user|assistant
    content       TEXT         NOT NULL,
    citations     JSONB        DEFAULT '[]',
    quality_score FLOAT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Agent traces ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_actions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  VARCHAR(255),
    message_id  UUID        REFERENCES messages(id) ON DELETE CASCADE,
    action_type VARCHAR(100),  -- plan|tool_selection|tool_execution|observation|synthesis|evaluation
    action_data JSONB,
    duration_ms INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Analytics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS query_analytics (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    VARCHAR(255),
    user_id       UUID        REFERENCES users(id),
    workspace_id  UUID        REFERENCES workspaces(id),
    query         TEXT,
    strategy      VARCHAR(100),
    quality_score FLOAT,
    ragas_scores  JSONB,
    duration_ms   INTEGER,
    num_steps     INTEGER,
    degraded      BOOLEAN     DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_user_id       ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id  ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_status        ON documents(status);

CREATE INDEX IF NOT EXISTS idx_document_chunks_doc     ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id   ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_messages_session_id     ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at     ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_agent_actions_session   ON agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_msg_id    ON agent_actions(message_id);

CREATE INDEX IF NOT EXISTS idx_query_analytics_user    ON query_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_ws      ON query_analytics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_date    ON query_analytics(created_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id        ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at     ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user  ON workspace_members(user_id);
