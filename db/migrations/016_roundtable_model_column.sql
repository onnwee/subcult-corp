-- 016: Add model column to roundtable sessions
-- Allows per-conversation model override (e.g. opus-4.6 for deep dives)

ALTER TABLE ops_roundtable_sessions
  ADD COLUMN IF NOT EXISTS model TEXT;
