-- 022: mission step dependencies + project linkage
-- Adds output_path, depends_on, assigned_agent, project_id to mission steps
-- for multi-agent workflows with dependency tracking

ALTER TABLE ops_mission_steps
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES ops_projects(id),
    ADD COLUMN IF NOT EXISTS output_path TEXT,
    ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS assigned_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_steps_project ON ops_mission_steps (project_id)
    WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_steps_assigned ON ops_mission_steps (assigned_agent)
    WHERE assigned_agent IS NOT NULL;
