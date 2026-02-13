-- DocSense Agent Layer — Database Migration
-- Adds: conversations, messages, agent_actions, document_metadata tables
-- Safe to run multiple times (IF NOT EXISTS / idempotent).

-- ═══════════════════════════════════════════════════════════
-- Conversations — persistent sessions across queries
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversations (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     text NOT NULL,
    user_id        uuid REFERENCES users(id) ON DELETE SET NULL,

    title          text,               -- auto-generated from first query
    status         text NOT NULL DEFAULT 'active',  -- active, archived, deleted

    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_session_id_uq ON conversations (session_id);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations (user_id);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations (status);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations (created_at);


-- ═══════════════════════════════════════════════════════════
-- Messages — individual turns in a conversation
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS messages (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

    role              text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content           text NOT NULL,
    citations         jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Token usage tracking
    prompt_tokens     integer,
    completion_tokens integer,

    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at);
CREATE INDEX IF NOT EXISTS messages_role_idx ON messages (role);


-- ═══════════════════════════════════════════════════════════
-- Agent Actions — trace log for every agent step
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_actions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   uuid REFERENCES conversations(id) ON DELETE CASCADE,

    action_type       text NOT NULL,           -- plan, think, act, observe, evaluate, synthesize
    tool_name         text,                    -- search, compare, summarize, extract
    input_data        jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_data       jsonb NOT NULL DEFAULT '{}'::jsonb,

    duration_ms       integer NOT NULL DEFAULT 0,
    success           boolean NOT NULL DEFAULT true,
    error             text,

    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_actions_conversation_id_idx ON agent_actions (conversation_id);
CREATE INDEX IF NOT EXISTS agent_actions_action_type_idx ON agent_actions (action_type);
CREATE INDEX IF NOT EXISTS agent_actions_tool_name_idx ON agent_actions (tool_name);
CREATE INDEX IF NOT EXISTS agent_actions_created_at_idx ON agent_actions (created_at);


-- ═══════════════════════════════════════════════════════════
-- Document Metadata — enriched document intelligence
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS document_metadata (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Auto-extracted metadata
    summary          text,                    -- AI-generated document summary
    key_topics       jsonb DEFAULT '[]'::jsonb,  -- extracted topics/themes
    entity_names     jsonb DEFAULT '[]'::jsonb,  -- named entities found
    language         text DEFAULT 'en',
    page_count       integer,
    word_count       integer,

    -- Classification
    doc_type         text,                    -- report, memo, contract, etc.
    confidence       float,                   -- classification confidence

    -- Embedding stats
    chunk_count      integer,
    avg_chunk_tokens integer,
    embedding_model  text,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT document_metadata_document_uq UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS document_metadata_doc_type_idx ON document_metadata (doc_type);
CREATE INDEX IF NOT EXISTS document_metadata_language_idx ON document_metadata (language);


-- ═══════════════════════════════════════════════════════════
-- Query Analytics — track query patterns for improvement
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS query_analytics (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,

    query_text        text NOT NULL,
    strategy_used     text,                -- direct, decompose, compare, summarize, extract
    tool_count        integer DEFAULT 0,
    total_duration_ms integer DEFAULT 0,

    -- Quality metrics
    citation_count    integer DEFAULT 0,
    evaluation_quality text,               -- good, acceptable, poor
    user_feedback     text,                -- thumbs_up, thumbs_down (future)

    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS query_analytics_strategy_idx ON query_analytics (strategy_used);
CREATE INDEX IF NOT EXISTS query_analytics_created_at_idx ON query_analytics (created_at);
