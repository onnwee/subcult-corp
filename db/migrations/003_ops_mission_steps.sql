-- 003: ops_mission_steps
-- Stores execution steps within a mission

CREATE TABLE IF NOT EXISTS ops_mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES ops_missions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN (
      'draft_tweet', 'post_tweet', 'crawl', 'analyze',
      'write_content', 'research', 'deploy', 'review',
      'summarize', 'scan_signals'
    )),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  reserved_by TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_steps_mission ON ops_mission_steps (mission_id);
CREATE INDEX idx_steps_status_kind ON ops_mission_steps (status, kind);
CREATE INDEX idx_steps_created ON ops_mission_steps (created_at DESC);
