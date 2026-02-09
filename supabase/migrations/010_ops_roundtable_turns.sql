-- 010: ops_roundtable_turns
-- Individual dialogue turns within a conversation session

CREATE TABLE IF NOT EXISTS ops_roundtable_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ops_roundtable_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  dialogue TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_turns_session ON ops_roundtable_turns (session_id);
CREATE INDEX idx_turns_speaker ON ops_roundtable_turns (speaker);
CREATE INDEX idx_turns_order ON ops_roundtable_turns (session_id, turn_number);
