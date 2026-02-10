-- 011: ops_agent_memory
-- Structured agent memory — insights, patterns, strategies, preferences, lessons

CREATE TABLE IF NOT EXISTS ops_agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('insight', 'pattern', 'strategy', 'preference', 'lesson')),
  content TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  tags TEXT[] DEFAULT '{}',
  source_trace_id TEXT,
  superseded_by UUID REFERENCES ops_agent_memory(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_agent ON ops_agent_memory (agent_id);
CREATE INDEX idx_memory_type ON ops_agent_memory (agent_id, type);
CREATE INDEX idx_memory_confidence ON ops_agent_memory (confidence DESC);
CREATE INDEX idx_memory_tags ON ops_agent_memory USING GIN (tags);
CREATE INDEX idx_memory_source_trace ON ops_agent_memory (source_trace_id);
CREATE INDEX idx_memory_created ON ops_agent_memory (created_at DESC);
