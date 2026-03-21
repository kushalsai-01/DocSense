-- 002_agent_tables.sql
-- Tables used by the Agent service for action logging

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  tool_name VARCHAR(100),
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  duration_ms INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_conversation
  ON agent_actions(conversation_id);
