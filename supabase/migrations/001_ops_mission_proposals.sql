-- 001: ops_mission_proposals
-- Stores agent proposals (requests for work)

CREATE TABLE IF NOT EXISTS ops_mission_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  rejection_reason TEXT,
  proposed_steps JSONB NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'agent'
    CHECK (source IN ('agent', 'trigger', 'reaction', 'initiative', 'conversation')),
  source_trace_id TEXT,
  auto_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_status ON ops_mission_proposals (status);
CREATE INDEX idx_proposals_agent ON ops_mission_proposals (agent_id);
CREATE INDEX idx_proposals_created ON ops_mission_proposals (created_at DESC);
CREATE INDEX idx_proposals_source_trace ON ops_mission_proposals (source_trace_id);
