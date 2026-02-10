-- 007: ops_agent_reactions
-- Queue for agent-to-agent reactions

CREATE TABLE IF NOT EXISTS ops_agent_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  source_event_id UUID REFERENCES ops_agent_events(id),
  reaction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_reactions_status ON ops_agent_reactions (status);
CREATE INDEX idx_reactions_target ON ops_agent_reactions (target_agent);
CREATE INDEX idx_reactions_created ON ops_agent_reactions (created_at DESC);
