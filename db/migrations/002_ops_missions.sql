-- 002: ops_missions
-- Stores missions (approved proposals become missions)

CREATE TABLE IF NOT EXISTS ops_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES ops_mission_proposals(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'running', 'succeeded', 'failed', 'cancelled')),
  created_by TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_missions_status ON ops_missions (status);
CREATE INDEX idx_missions_created_by ON ops_missions (created_by);
CREATE INDEX idx_missions_created ON ops_missions (created_at DESC);
