-- Cron schedules — agent session triggers
-- Replaces OpenClaw cron jobs with native in-DB scheduling.
CREATE TABLE IF NOT EXISTS ops_cron_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Chicago',
    prompt TEXT NOT NULL,
    timeout_seconds INTEGER DEFAULT 300,
    max_tool_rounds INTEGER DEFAULT 15,
    model TEXT,
    enabled BOOLEAN DEFAULT true,
    last_fired_at TIMESTAMPTZ,
    next_fire_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
