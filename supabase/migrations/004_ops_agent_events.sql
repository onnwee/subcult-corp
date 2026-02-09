-- 004: ops_agent_events
-- Stores the event stream (everything that happens in the system)

CREATE TABLE IF NOT EXISTS ops_agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_agent ON ops_agent_events (agent_id);
CREATE INDEX idx_events_kind ON ops_agent_events (kind);
CREATE INDEX idx_events_tags ON ops_agent_events USING GIN (tags);
CREATE INDEX idx_events_created ON ops_agent_events (created_at DESC);
