-- ops_model_routing — dynamic LLM model selection keyed by tracking context
--
-- Supports cascading lookup: exact context → prefix (before ':') → 'default' → hardcoded fallback.
-- Example contexts: 'roundtable:deep_dive', 'mission_step:research', 'default'
--
-- The `models` array follows OpenRouter SDK routing: ordered by preference,
-- SDK tries each in sequence on provider errors / unavailability.

CREATE TABLE IF NOT EXISTS ops_model_routing (
    context TEXT PRIMARY KEY,
    models TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for prefix lookups (e.g., 'roundtable:*' → 'roundtable')
CREATE INDEX IF NOT EXISTS idx_ops_model_routing_context_prefix 
    ON ops_model_routing (context text_pattern_ops);

-- Default row: fallback when no specific context matches
-- Uses fast/cheap models as baseline, matching DEFAULT_MODELS in code
INSERT INTO ops_model_routing (context, models) VALUES 
    ('default', ARRAY[
        'anthropic/claude-haiku-4.5',
        'google/gemini-2.5-flash',
        'openai/gpt-4.1-mini',
        'deepseek/deepseek-v3.2',
        'qwen/qwen3-235b-a22b',
        'moonshotai/kimi-k2.5',
        'anthropic/claude-sonnet-4.5'
    ])
ON CONFLICT (context) DO NOTHING;
