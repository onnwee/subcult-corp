-- 035: Extend ops_agent_registry role CHECK constraint
-- Allow additional roles for agent-designed agents beyond the original 8.
-- The spawner needs to insert agents with novel roles proposed by the collective.

-- Drop the existing constraint
ALTER TABLE ops_agent_registry DROP CONSTRAINT IF EXISTS ops_agent_registry_role_check;

-- Re-add with extended role list
ALTER TABLE ops_agent_registry ADD CONSTRAINT ops_agent_registry_role_check
    CHECK (role IN (
        'coordinator', 'analyst', 'protector', 'innovator', 'executor',
        'dispatcher', 'operations', 'sovereign',
        -- Phase 14: additional roles for agent-designed agents
        'researcher', 'strategist', 'architect', 'mediator', 'chronicler',
        'sentinel', 'synthesizer', 'provocateur', 'curator', 'custom'
    ));

COMMENT ON COLUMN ops_agent_registry.role IS 'Agent role — original 8 + extended roles for agent-designed agents. Use "custom" for uncategorized proposals.';
