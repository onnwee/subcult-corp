-- 016: Expand ops_mission_steps kind CHECK constraint
-- Original migration 003 only allowed 10 kinds; types.ts defines 24.
-- This migration expands to match the full set + keeps legacy kinds.

ALTER TABLE ops_mission_steps DROP CONSTRAINT IF EXISTS ops_mission_steps_kind_check;
ALTER TABLE ops_mission_steps ADD CONSTRAINT ops_mission_steps_kind_check
  CHECK (kind IN (
    -- Research / analysis
    'analyze_discourse', 'scan_signals', 'research_topic', 'distill_insight',
    'classify_pattern', 'trace_incentive', 'identify_assumption',
    -- Content creation
    'draft_thread', 'draft_essay', 'critique_content', 'refine_narrative',
    'prepare_statement', 'write_issue',
    -- System / ops
    'audit_system', 'review_policy', 'consolidate_memory', 'map_dependency',
    'patch_code', 'document_lesson', 'log_event', 'tag_memory',
    'escalate_risk', 'convene_roundtable', 'propose_workflow',
    -- Legacy kinds (from migration 003, kept for existing data)
    'draft_tweet', 'post_tweet', 'crawl', 'analyze',
    'write_content', 'research', 'deploy', 'review', 'summarize'
  ));
