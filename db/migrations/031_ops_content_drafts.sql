-- Content Pipeline: ops_content_drafts table
-- Stores creative content drafts produced by agents in writing_room sessions

CREATE TABLE IF NOT EXISTS ops_content_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_agent    TEXT NOT NULL,
    content_type    TEXT NOT NULL CHECK (content_type IN ('essay', 'thread', 'statement', 'poem', 'manifesto')),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published')),
    review_session_id UUID REFERENCES ops_roundtable_sessions(id),
    reviewer_notes  JSONB NOT NULL DEFAULT '[]',
    source_session_id UUID REFERENCES ops_roundtable_sessions(id),
    published_at    TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_drafts_author    ON ops_content_drafts (author_agent);
CREATE INDEX IF NOT EXISTS idx_content_drafts_status    ON ops_content_drafts (status);
CREATE INDEX IF NOT EXISTS idx_content_drafts_created   ON ops_content_drafts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_drafts_source    ON ops_content_drafts (source_session_id);
