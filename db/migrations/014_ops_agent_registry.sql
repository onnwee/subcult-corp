-- 014: ops_agent_registry
-- Canonical agent registry - source of truth for agent personalities, roles, and system directives
-- Integrates OpenClaw personality framework into subcult-corp

CREATE TABLE IF NOT EXISTS ops_agent_registry (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL
    CHECK (role IN ('coordinator', 'analyst', 'protector', 'innovator', 'executor', 'dispatcher', 'operations', 'sovereign')),
  system_directive TEXT NOT NULL,
  soul_summary TEXT,
  tone TEXT,
  signature_phrase TEXT,
  color TEXT DEFAULT '#808080',
  avatar_key TEXT,
  pixel_sprite_key TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_registry_active ON ops_agent_registry (active);
CREATE INDEX idx_agent_registry_role ON ops_agent_registry (role);

-- Optional: Track agent configuration variants
CREATE TABLE IF NOT EXISTS ops_agent_config_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES ops_agent_registry(agent_id),
  variant_name TEXT NOT NULL,
  config JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_config_variants_agent ON ops_agent_config_variants (agent_id);
