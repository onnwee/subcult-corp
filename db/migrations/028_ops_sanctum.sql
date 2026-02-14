-- Sanctum: Multi-agent chat interface tables
-- Phase 5: Conversations + Messages

CREATE TABLE IF NOT EXISTS ops_sanctum_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    title TEXT,
    mode TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'direct' | 'whisper'
    target_agent TEXT,                       -- for direct/whisper modes
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_sanctum_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ops_sanctum_conversations(id),
    role TEXT NOT NULL,                      -- 'user' | 'agent'
    agent_id TEXT,                           -- null for user messages
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sanctum_conv_user ON ops_sanctum_conversations(user_id, updated_at DESC);
CREATE INDEX idx_sanctum_msg_conv ON ops_sanctum_messages(conversation_id, created_at);
