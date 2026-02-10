-- 013: Initiative Queue — agents can propose ideas autonomously
-- Each agent may be queued for initiative generation based on
-- cooldown timers, memory prerequisites, and system policy.

CREATE TABLE IF NOT EXISTS ops_initiative_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    context     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    result      JSONB
);

-- Fast lookup: pending items per agent
CREATE INDEX IF NOT EXISTS idx_initiative_queue_status_agent
    ON ops_initiative_queue (status, agent_id);

-- Chronological ordering for poll-and-claim
CREATE INDEX IF NOT EXISTS idx_initiative_queue_created
    ON ops_initiative_queue (created_at ASC)
    WHERE status = 'pending';
