-- Governance proposals: agent-driven policy change suggestions + voting
-- Agents propose changes to policy values, which get debated in roundtable sessions
-- Votes are cast after debate, and accepted proposals auto-apply via setPolicy()

CREATE TABLE IF NOT EXISTS ops_governance_proposals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposer        TEXT NOT NULL,                          -- agent_id who proposed
    policy_key      TEXT NOT NULL,                          -- policy key to change
    current_value   JSONB,                                 -- snapshot of current policy value
    proposed_value  JSONB NOT NULL,                         -- proposed new value
    rationale       TEXT NOT NULL,                          -- why the agent wants this change
    status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'voting', 'accepted', 'rejected')),
    votes           JSONB NOT NULL DEFAULT '{}',            -- { agent_id: { vote: 'approve'|'reject', reason: string } }
    required_votes  INT NOT NULL DEFAULT 4,                 -- minimum approvals needed
    debate_session_id UUID REFERENCES ops_roundtable_sessions(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ                            -- when status changed to accepted/rejected
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_governance_proposals_status     ON ops_governance_proposals (status);
CREATE INDEX IF NOT EXISTS idx_governance_proposals_proposer   ON ops_governance_proposals (proposer);
CREATE INDEX IF NOT EXISTS idx_governance_proposals_policy_key ON ops_governance_proposals (policy_key);
CREATE INDEX IF NOT EXISTS idx_governance_proposals_created_at ON ops_governance_proposals (created_at DESC);
