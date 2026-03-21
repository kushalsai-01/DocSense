-- 006_document_metadata.sql
-- AI-enriched document metadata and RAGAS scores

CREATE TABLE IF NOT EXISTS document_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
  summary TEXT,
  topics JSONB DEFAULT '[]'::jsonb,
  entities JSONB DEFAULT '{}'::jsonb,
  key_insights JSONB DEFAULT '[]'::jsonb,
  document_type VARCHAR(100),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_metadata_document ON document_metadata(document_id);

-- Add RAGAS scores to query analytics
ALTER TABLE query_analytics
  ADD COLUMN IF NOT EXISTS ragas_scores JSONB;

CREATE INDEX IF NOT EXISTS idx_query_analytics_ragas
  ON query_analytics ((ragas_scores->>'overall'))
  WHERE ragas_scores IS NOT NULL;
