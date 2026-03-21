-- 005_query_analytics_columns.sql
-- Add analytics fields used by advanced dashboard endpoints.

ALTER TABLE query_analytics
  ADD COLUMN IF NOT EXISTS document_ids UUID[],
  ADD COLUMN IF NOT EXISTS citations_count INT,
  ADD COLUMN IF NOT EXISTS mode_used VARCHAR(20),
  ADD COLUMN IF NOT EXISTS response_time_ms INT,
  ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]'::jsonb;

-- Ensure workspace_id exists and references workspaces.
ALTER TABLE query_analytics
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

-- Backfill mode_used and citations_count from legacy columns where possible.
UPDATE query_analytics
SET mode_used = COALESCE(mode_used, mode)
WHERE mode_used IS NULL;

UPDATE query_analytics
SET citations_count = COALESCE(citations_count, citation_count, 0)
WHERE citations_count IS NULL;

CREATE INDEX IF NOT EXISTS idx_query_analytics_workspace_created
  ON query_analytics(workspace_id, created_at DESC);
