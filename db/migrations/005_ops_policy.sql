-- 005: ops_policy
-- Key-value policy store for system configuration

CREATE TABLE IF NOT EXISTS ops_policy (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert core policies
INSERT INTO ops_policy (key, value, description) VALUES
  ('auto_approve', '{"enabled": true, "allowed_step_kinds": ["draft_tweet","crawl","analyze","write_content","research","scan_signals","summarize","review"]}', 'Which step kinds can be auto-approved'),
  ('x_daily_quota', '{"limit": 5}', 'Daily tweet posting limit'),
  ('content_policy', '{"enabled": true, "max_drafts_per_day": 8}', 'Content creation controls'),
  ('initiative_policy', '{"enabled": false}', 'Agent initiative system (keep off until stable)'),
  ('memory_influence_policy', '{"enabled": true, "probability": 0.3}', 'Memory influence probability'),
  ('relationship_drift_policy', '{"enabled": true, "max_drift": 0.03}', 'Max relationship drift per conversation'),
  ('roundtable_policy', '{"enabled": false, "max_daily_conversations": 5}', 'Conversation system controls'),
  ('system_enabled', '{"enabled": true}', 'Global system kill switch')
ON CONFLICT (key) DO NOTHING;
