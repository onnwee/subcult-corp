-- 034: Agent proposals — agents design and propose new agents for the collective
-- Phase 14: Agent-Designed Agents
-- Existing agents (primarily Thaum) can propose new agent designs,
-- the collective votes via roundtable, and approved proposals are spawned
-- after human confirmation.

CREATE TABLE IF NOT EXISTS ops_agent_proposals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposed_by     TEXT NOT NULL,                          -- agent_id of proposer (e.g., 'thaum')
    agent_name      TEXT NOT NULL,                          -- proposed name for new agent
    agent_role      TEXT NOT NULL,                          -- proposed role
    personality     JSONB NOT NULL DEFAULT '{}',            -- { tone, traits[], speaking_style, emoji? }
    skills          JSONB NOT NULL DEFAULT '[]',            -- proposed skill set
    rationale       TEXT NOT NULL,                          -- why this agent is needed
    status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'voting', 'approved', 'rejected', 'spawned')),
    votes           JSONB NOT NULL DEFAULT '{}',            -- { agent_id: { vote: 'approve'|'reject', reasoning: string } }
    human_approved  BOOLEAN DEFAULT NULL,                   -- null = pending, true = approved, false = rejected
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at      TIMESTAMPTZ,                            -- when voting concluded (approved/rejected)
    spawned_at      TIMESTAMPTZ                             -- when the agent was actually materialized
);

-- Query by status (most common filter)
CREATE INDEX IF NOT EXISTS idx_agent_proposals_status ON ops_agent_proposals(status);

-- Query by proposer
CREATE INDEX IF NOT EXISTS idx_agent_proposals_proposed_by ON ops_agent_proposals(proposed_by);

-- Recent proposals first
CREATE INDEX IF NOT EXISTS idx_agent_proposals_created_at ON ops_agent_proposals(created_at DESC);

COMMENT ON TABLE ops_agent_proposals IS 'Agent design proposals — agents propose new agents for the collective';
COMMENT ON COLUMN ops_agent_proposals.proposed_by IS 'agent_id of the proposing agent (e.g. thaum)';
COMMENT ON COLUMN ops_agent_proposals.personality IS 'JSON: { tone, traits[], speaking_style, emoji? }';
COMMENT ON COLUMN ops_agent_proposals.skills IS 'JSON array of proposed skill strings';
COMMENT ON COLUMN ops_agent_proposals.status IS 'Lifecycle: proposed → voting → approved/rejected → spawned';
COMMENT ON COLUMN ops_agent_proposals.votes IS 'JSON: { agent_id: { vote, reasoning } } — one entry per voter';
COMMENT ON COLUMN ops_agent_proposals.human_approved IS 'null = pending human review, true = approved, false = rejected';
