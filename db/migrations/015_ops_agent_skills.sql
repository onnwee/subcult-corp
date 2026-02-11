-- 015: Agent Skills Registry
-- Tracks which skills are assigned to which agents,
-- their configuration, and usage metrics.
-- Supports the OpenClaw integration layer.

CREATE TABLE IF NOT EXISTS ops_agent_skills (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    TEXT NOT NULL CHECK (agent_id IN ('chora','subrosa','thaum','praxis','mux','primus')),
    skill_id    TEXT NOT NULL,
    skill_name  TEXT NOT NULL,
    description TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Usage tracking
    total_invocations   INTEGER NOT NULL DEFAULT 0,
    successful_invocations INTEGER NOT NULL DEFAULT 0,
    failed_invocations  INTEGER NOT NULL DEFAULT 0,
    last_invoked_at     TIMESTAMPTZ,
    avg_duration_ms     DOUBLE PRECISION,
    -- Metadata
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, skill_id)
);

-- Skill execution log for auditing and analytics
CREATE TABLE IF NOT EXISTS ops_skill_executions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    TEXT NOT NULL,
    skill_id    TEXT NOT NULL,
    session_id  UUID,  -- optional: roundtable session that triggered this
    params      JSONB NOT NULL DEFAULT '{}'::jsonb,
    result      JSONB,
    success     BOOLEAN NOT NULL,
    error       TEXT,
    duration_ms INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON ops_agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON ops_agent_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_enabled ON ops_agent_skills(agent_id, enabled);
CREATE INDEX IF NOT EXISTS idx_skill_executions_agent ON ops_skill_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill ON ops_skill_executions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_created ON ops_skill_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_executions_session ON ops_skill_executions(session_id) WHERE session_id IS NOT NULL;

-- Seed core skills for all agents
INSERT INTO ops_agent_skills (agent_id, skill_id, skill_name, description, enabled)
VALUES
    -- Core skills (all agents)
    ('chora', 'reflect-learn', 'Reflect & Learn', 'Pattern recognition from history', true),
    ('chora', 'thinking-partner', 'Thinking Partner', 'Collaborative ideation', true),
    ('chora', 'deep-research', 'Deep Research', 'Multi-step analysis', true),
    ('chora', 'humanizer', 'Humanizer', 'Natural writing', true),
    ('chora', 'prompt-guard', 'Prompt Guard', 'Security screening', true),

    ('subrosa', 'reflect-learn', 'Reflect & Learn', 'Pattern recognition from history', true),
    ('subrosa', 'thinking-partner', 'Thinking Partner', 'Collaborative ideation', true),
    ('subrosa', 'deep-research', 'Deep Research', 'Multi-step analysis', true),
    ('subrosa', 'humanizer', 'Humanizer', 'Natural writing', true),
    ('subrosa', 'prompt-guard', 'Prompt Guard', 'Security screening', true),

    ('thaum', 'reflect-learn', 'Reflect & Learn', 'Pattern recognition from history', true),
    ('thaum', 'thinking-partner', 'Thinking Partner', 'Collaborative ideation', true),
    ('thaum', 'deep-research', 'Deep Research', 'Multi-step analysis', true),
    ('thaum', 'humanizer', 'Humanizer', 'Natural writing', true),
    ('thaum', 'prompt-guard', 'Prompt Guard', 'Security screening', true),

    ('praxis', 'reflect-learn', 'Reflect & Learn', 'Pattern recognition from history', true),
    ('praxis', 'thinking-partner', 'Thinking Partner', 'Collaborative ideation', true),
    ('praxis', 'deep-research', 'Deep Research', 'Multi-step analysis', true),
    ('praxis', 'humanizer', 'Humanizer', 'Natural writing', true),
    ('praxis', 'prompt-guard', 'Prompt Guard', 'Security screening', true),

    ('mux', 'reflect-learn', 'Reflect & Learn', 'Pattern recognition from history', true),
    ('mux', 'thinking-partner', 'Thinking Partner', 'Collaborative ideation', true),
    ('mux', 'deep-research', 'Deep Research', 'Multi-step analysis', true),
    ('mux', 'humanizer', 'Humanizer', 'Natural writing', true),
    ('mux', 'prompt-guard', 'Prompt Guard', 'Security screening', true),

    ('primus', 'reflect-learn', 'Reflect & Learn', 'Pattern recognition from history', true),
    ('primus', 'thinking-partner', 'Thinking Partner', 'Collaborative ideation', true),
    ('primus', 'deep-research', 'Deep Research', 'Multi-step analysis', true),
    ('primus', 'humanizer', 'Humanizer', 'Natural writing', true),
    ('primus', 'prompt-guard', 'Prompt Guard', 'Security screening', true),

    -- Agent-specific skills
    ('chora', 'exa-web-search-free', 'Web Search', 'Search the web via Exa API', true),
    ('chora', 'summarize', 'Summarize', 'Summarize long content', true),
    ('chora', 'cost-report', 'Cost Report', 'Generate LLM/infrastructure cost reports', true),

    ('subrosa', 'security-audit', 'Security Audit', 'Comprehensive security scan', true),
    ('subrosa', 'clawdbot-security-suite', 'Security Suite', 'Full ClawdBot security suite', true),

    ('thaum', 'ai-persona-os', 'AI Persona OS', 'Create and manage AI personas', true),
    ('thaum', 'skill-creator', 'Skill Creator', 'Create new OpenClaw skills', true),

    ('praxis', 'git-essentials', 'Git Essentials', 'Git operations', true),
    ('praxis', 'twitter', 'Twitter / X', 'Twitter/X interactions', true),
    ('praxis', 'discord', 'Discord', 'Discord channel interactions', true),
    ('praxis', 'docker-essentials', 'Docker Essentials', 'Docker operations', true)
ON CONFLICT (agent_id, skill_id) DO NOTHING;
