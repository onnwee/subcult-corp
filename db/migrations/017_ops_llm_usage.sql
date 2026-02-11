-- 017: ops_llm_usage
-- Tracks LLM API usage and costs for all operations

CREATE TABLE IF NOT EXISTS ops_llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd NUMERIC(10,6),
  agent_id TEXT,
  context TEXT NOT NULL,
  session_id UUID REFERENCES ops_roundtable_sessions(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_agent ON ops_llm_usage (agent_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON ops_llm_usage (model);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON ops_llm_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_context ON ops_llm_usage (context);
