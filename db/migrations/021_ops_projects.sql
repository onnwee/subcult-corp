-- 021: ops_projects
-- Collaborative workspaces for multi-agent product building

CREATE TABLE IF NOT EXISTS ops_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('proposed', 'active', 'paused', 'completed', 'abandoned')),
    lead_agent TEXT NOT NULL,
    participants TEXT[] DEFAULT '{}',
    prime_directive TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_status ON ops_projects (status);
CREATE INDEX idx_projects_lead ON ops_projects (lead_agent);
CREATE INDEX idx_projects_slug ON ops_projects (slug);
