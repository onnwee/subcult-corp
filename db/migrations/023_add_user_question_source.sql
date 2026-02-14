-- Migration 023: Add user_question source type for Ask Room feature
-- Adds 'user_question' to the source CHECK on ops_mission_proposals
-- Adds a 'source' column to ops_roundtable_sessions for tracking session origin

-- 1. Expand ops_mission_proposals source CHECK to include 'user_question'
ALTER TABLE ops_mission_proposals
    DROP CONSTRAINT IF EXISTS ops_mission_proposals_source_check;

ALTER TABLE ops_mission_proposals
    ADD CONSTRAINT ops_mission_proposals_source_check
    CHECK (source IN ('agent', 'trigger', 'reaction', 'initiative', 'conversation', 'user_question'));

-- 2. Add source column to ops_roundtable_sessions (nullable TEXT, flexible for future sources)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ops_roundtable_sessions' AND column_name = 'source'
    ) THEN
        ALTER TABLE ops_roundtable_sessions ADD COLUMN source TEXT;
    END IF;
END $$;
