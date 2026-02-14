-- 036: Memory archaeology — deep analysis of collective memory patterns
-- Phase 15: Memory Archaeology
-- Agents perform "archaeological digs" into collective memory to discover
-- patterns, contradictions, emergent narratives, echoes, and personality drift.

CREATE TABLE IF NOT EXISTS ops_memory_archaeology (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dig_id          UUID NOT NULL,                          -- groups findings from same analysis session
    agent_id        TEXT NOT NULL,                          -- agent who performed the dig
    finding_type    TEXT NOT NULL
                    CHECK (finding_type IN ('pattern', 'contradiction', 'emergence', 'echo', 'drift')),
    title           TEXT NOT NULL,                          -- short label for the finding
    description     TEXT NOT NULL,                          -- detailed explanation
    evidence        JSONB NOT NULL DEFAULT '[]',            -- array of { memory_id, excerpt, relevance }
    confidence      REAL NOT NULL DEFAULT 0.5,              -- 0.0 to 1.0
    time_span       JSONB,                                  -- { from: timestamp, to: timestamp } — period covered
    related_agents  TEXT[] DEFAULT '{}',                     -- agents involved in the pattern
    metadata        JSONB NOT NULL DEFAULT '{}',            -- additional context
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group findings by dig session
CREATE INDEX IF NOT EXISTS idx_archaeology_dig ON ops_memory_archaeology(dig_id);

-- Filter by performing agent
CREATE INDEX IF NOT EXISTS idx_archaeology_agent ON ops_memory_archaeology(agent_id);

-- Filter by finding type
CREATE INDEX IF NOT EXISTS idx_archaeology_type ON ops_memory_archaeology(finding_type);

-- Recent digs first
CREATE INDEX IF NOT EXISTS idx_archaeology_created ON ops_memory_archaeology(created_at DESC);

-- Efficient JSONB containment queries on evidence (for memory_id lookups)
CREATE INDEX IF NOT EXISTS idx_archaeology_evidence ON ops_memory_archaeology USING GIN (evidence);

COMMENT ON TABLE ops_memory_archaeology IS 'Archaeological digs — deep analysis of collective memory patterns';
COMMENT ON COLUMN ops_memory_archaeology.dig_id IS 'Groups all findings from a single analysis session';
COMMENT ON COLUMN ops_memory_archaeology.finding_type IS 'pattern | contradiction | emergence | echo | drift';
COMMENT ON COLUMN ops_memory_archaeology.evidence IS 'JSON array of { memory_id, excerpt, relevance }';
COMMENT ON COLUMN ops_memory_archaeology.confidence IS '0.0–1.0 confidence score for the finding';
COMMENT ON COLUMN ops_memory_archaeology.time_span IS 'JSON: { from, to } — time period the finding covers';
COMMENT ON COLUMN ops_memory_archaeology.related_agents IS 'Agent IDs involved in the discovered pattern';
