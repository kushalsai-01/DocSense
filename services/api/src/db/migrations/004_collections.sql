-- 004_collections.sql
-- Workspace-scoped document collections.

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS collection_documents (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_workspace ON collections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_collection_docs_collection ON collection_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_docs_document ON collection_documents(document_id);
