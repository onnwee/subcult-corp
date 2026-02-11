-- 009: ops_roundtable_sessions
-- Conversation sessions — the queue for the roundtable worker

CREATE TABLE IF NOT EXISTS ops_roundtable_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format TEXT NOT NULL
    CHECK (format IN (
      'standup', 'debate', 'watercooler', 'checkin', 'triage', 'planning',
      'deep_dive', 'strategy', 'writing_room', 'brainstorm', 'cross_exam',
      'risk_review', 'content_review', 'reframe', 'retro', 'shipping'
    )),
  topic TEXT NOT NULL,
  participants TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  scheduled_for TIMESTAMPTZ,
  schedule_slot TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_roundtable_status ON ops_roundtable_sessions (status);
CREATE INDEX idx_roundtable_scheduled ON ops_roundtable_sessions (scheduled_for);
CREATE INDEX idx_roundtable_created ON ops_roundtable_sessions (created_at DESC);
