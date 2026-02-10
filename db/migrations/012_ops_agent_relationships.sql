-- Migration 012: Agent Relationships — Dynamic Affinity System
-- Every pair of agents has a tracked affinity value that drifts
-- based on conversation interactions.

CREATE TABLE IF NOT EXISTS ops_agent_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_a TEXT NOT NULL,
    agent_b TEXT NOT NULL,
    affinity NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    total_interactions INTEGER DEFAULT 0,
    positive_interactions INTEGER DEFAULT 0,
    negative_interactions INTEGER DEFAULT 0,
    drift_log JSONB DEFAULT '[]',
    UNIQUE(agent_a, agent_b),
    CHECK(agent_a < agent_b)  -- alphabetical ordering ensures uniqueness
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_relationships_agent_a
    ON ops_agent_relationships(agent_a);
CREATE INDEX IF NOT EXISTS idx_relationships_agent_b
    ON ops_agent_relationships(agent_b);
CREATE INDEX IF NOT EXISTS idx_relationships_affinity
    ON ops_agent_relationships(affinity);
