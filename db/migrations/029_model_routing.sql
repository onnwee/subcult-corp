-- Dynamic model routing — per-context model preferences
-- Lookup cascades: exact context → prefix (before ':') → 'default' → hardcoded fallback

CREATE TABLE IF NOT EXISTS ops_model_routing (
    context     TEXT PRIMARY KEY,        -- e.g. 'default', 'roundtable', 'roundtable:deep_dive'
    models      TEXT[] NOT NULL,         -- ordered model IDs (full list, not capped at 3)
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ops_model_routing (context, models, description) VALUES
('default', ARRAY[
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.5-flash',
    'openai/gpt-4.1-mini',
    'deepseek/deepseek-v3.2',
    'qwen/qwen3-235b-a22b',
    'moonshotai/kimi-k2.5',
    'anthropic/claude-sonnet-4.5'
], 'Default model chain — cheap/fast first, heavy last'),
('roundtable', ARRAY[
    'moonshotai/kimi-k2.5',
    'deepseek/deepseek-v3.2',
    'anthropic/claude-sonnet-4.5'
], 'Roundtable conversations — prefer capable models'),
('roundtable:deep_dive', ARRAY[
    'moonshotai/kimi-k2.5',
    'anthropic/claude-sonnet-4.5',
    'deepseek/deepseek-v3.2'
], 'Deep dive roundtables — heavyweight'),
('roundtable:strategy', ARRAY[
    'moonshotai/kimi-k2.5',
    'anthropic/claude-sonnet-4.5',
    'deepseek/deepseek-v3.2'
], 'Strategy sessions'),
('distillation', ARRAY[
    'google/gemini-2.5-flash',
    'anthropic/claude-haiku-4.5',
    'openai/gpt-4.1-mini'
], 'Memory distillation — fast and cheap is fine'),
('initiative', ARRAY[
    'deepseek/deepseek-v3.2',
    'moonshotai/kimi-k2.5',
    'anthropic/claude-haiku-4.5'
], 'Initiative generation')
ON CONFLICT (context) DO NOTHING;
