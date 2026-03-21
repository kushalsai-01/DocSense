-- 003_workspaces.sql
-- Workspace multi-tenancy: workspaces, members, and document scoping

-- ═══════════════════════════════════════════════════════════════
-- WORKSPACES
-- ═══════════════════════════════════════════════════════════════
-- WHY a separate qdrant_namespace?
-- Each workspace gets its own Qdrant collection namespace so vectors
-- from different workspaces don't mix.  The slug is for URL-friendly
-- workspace identifiers, while qdrant_namespace is an opaque UUID-based
-- key used only by the RAG service.

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  qdrant_namespace VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- WORKSPACE MEMBERS
-- ═══════════════════════════════════════════════════════════════
-- WHY a composite primary key?
-- A user can be a member of many workspaces, and a workspace has many
-- members, but a user can only have ONE role per workspace.  The
-- (workspace_id, user_id) PK enforces this constraint at the DB level.

CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════
-- SCOPE DOCUMENTS TO WORKSPACES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id
  UUID REFERENCES workspaces(id);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);
