-- Agent sessions — tool-augmented LLM execution records
-- Each row represents one agent session: cron-triggered, API-triggered, or roundtable-spawned.
CREATE TABLE IF NOT EXISTS ops_agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'cron',
    source_id UUID,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')),
    model TEXT,
    result JSONB,
    tool_calls JSONB DEFAULT '[]',
    llm_rounds INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_usd NUMERIC(10,6) DEFAULT 0,
    timeout_seconds INTEGER DEFAULT 300,
    max_tool_rounds INTEGER DEFAULT 15,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON ops_agent_sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON ops_agent_sessions (agent_id, created_at DESC);
