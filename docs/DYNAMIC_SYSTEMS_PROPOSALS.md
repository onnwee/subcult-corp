# Dynamic Systems Proposals — Subcult-Corp

> Evaluation and improvement proposals for hardcoded configuration systems.
> Created: 2026-02-14

---

## Current State

### What's hardcoded

| System | File | What's static | What's dynamic |
|--------|------|---------------|----------------|
| **Step prompts** | `src/lib/ops/step-prompts.ts` | 11 of 23 step kinds have explicit prompts; 12 use a generic fallback. Tool names baked into text. | Agent assignment, output path |
| **Trigger conditions** | `src/lib/ops/triggers.ts` | 12 event types in a `switch` statement with hardcoded thresholds (e.g. 120min stall, 30% failure rate, 48h lookback) | Rules themselves are DB rows (`ops_trigger_rules`) with cooldowns |
| **Formats** | `src/lib/roundtable/formats.ts` | 16 formats with coordinator, purpose, turn range, temperature, artifact mapping — all in code | Format *selection* is schedule-driven with probability |
| **Write ACLs** | `src/lib/tools/tools/file-write.ts` | Per-agent path prefixes in a `Record<AgentId, string[]>` | Nothing — no runtime override |
| **Voices** | `src/lib/roundtable/voices.ts` | Full personality (tone, quirk, failureMode, 300-500 word systemDirective) per agent | Relationship drift (tiny, +/-0.03) |
| **Recovery** | `src/lib/ops/recovery.ts` | 30-min stale threshold | Nothing |
| **Initiatives** | `src/lib/ops/initiative.ts` | 120-min cooldown, 5 memory min, 0.55 confidence | Policy gate (enabled/disabled) |
| **Memory distillation** | `src/lib/ops/memory-distiller.ts` | Max 6 memories, 3 action items, 0.55 confidence floor, 200 char cap | Policy gate |
| **Outcome learner** | `src/lib/ops/outcome-learner.ts` | Step kind to memory type mapping (13 entries) | Confidence scoring varies by outcome |
| **Reaction matrix** | Policy table | Nothing — fully dynamic | Pattern matching, probability, cooldowns all in `ops_policy` |

### What works well as-is

- **Reaction matrix** — already policy-driven, good pattern to replicate
- **Trigger rules in DB** — the *existence* of triggers is dynamic; only the *evaluation logic* is hardcoded
- **Voice system** — stable identities are a feature, not a bug. Radical personality changes would break coherence
- **Format definitions** — 16 formats is plenty; the structure rarely needs to change

### What's actually painful

1. **Step prompts** — 12 of 23 step kinds fall through to a useless generic prompt. Adding a new kind requires a code deploy. No way to iterate on prompt quality without redeploying.
2. **Trigger thresholds** — "stalled > 120 min", "failure rate > 30%", "48h lookback" are all magic numbers buried in a switch statement. Tuning requires a deploy.
3. **Write ACLs** — can't grant temporary expanded access (e.g. let chora write to `projects/` during a specific mission)
4. **Initiative/recovery constants** — 30 min stale, 120 min cooldown, 5 memory minimum — all reasonable defaults but impossible to tune without code changes

---

## Proposal 1: Move Thresholds to `ops_policy`

**Effort**: ~2 hours | **Impact**: High | **Dynamic level**: Semi (SQL-editable)

Extract all magic numbers into the existing policy system. No new tables, no new patterns — just use what already works for `reaction_matrix`.

### New policy keys

```json
{
    "recovery_policy": {
        "stale_threshold_minutes": 30
    },
    "initiative_policy": {
        "enabled": true,
        "cooldown_minutes": 120,
        "min_memories": 5,
        "min_confidence": 0.55
    },
    "trigger_defaults": {
        "stall_minutes": 120,
        "failure_rate_threshold": 0.3,
        "lookback_hours": 48
    },
    "distillation_policy": {
        "enabled": true,
        "max_memories": 6,
        "max_action_items": 3,
        "min_confidence": 0.55,
        "max_content_length": 200
    }
}
```

### Implementation

Code reads the policy once per cycle (already cached via `getPolicy()`). If the key is missing, fall back to current hardcoded defaults. Zero risk — existing behavior preserved, but now tunable via a single SQL update.

### Files to modify

- `src/lib/ops/recovery.ts` — read `recovery_policy.stale_threshold_minutes`
- `src/lib/ops/initiative.ts` — read expanded `initiative_policy`
- `src/lib/ops/triggers.ts` — read `trigger_defaults` for thresholds in switch cases
- `src/lib/ops/memory-distiller.ts` — read `distillation_policy` for extraction limits

---

## Proposal 2: Step Prompt Templates in DB

**Effort**: ~4 hours | **Impact**: High | **Dynamic level**: Semi (SQL-editable)

Replace the hardcoded `STEP_INSTRUCTIONS` map with a `ops_step_templates` table.

### Schema

```sql
CREATE TABLE ops_step_templates (
    kind        TEXT PRIMARY KEY,
    template    TEXT NOT NULL,
    tools_hint  TEXT[] DEFAULT '{}',
    output_hint TEXT,
    version     INT DEFAULT 1,
    updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### Template language

Simple `{{variable}}` substitution:
- `{{date}}` — current date (YYYY-MM-DD)
- `{{agentId}}` — executing agent
- `{{missionTitle}}` — parent mission title
- `{{payload.topic}}` — step payload fields
- `{{outputPath}}` — resolved output path

### Example template

```
Research the topic described below using web_search and web_fetch.

Topic: {{payload.topic}}
Mission: {{missionTitle}}

Instructions:
1. Search for 3-5 high-quality sources
2. Read and extract key findings from each
3. Write a structured research note to:
   agents/{{agentId}}/notes/{{date}}__research__{{payload.slug}}__{{agentId}}__v01.md

Include sources, key findings, and open questions.
```

### Benefits

- All 23 step kinds get proper templates (seed from current hardcoded values + fill the 12 gaps)
- Prompts can be iterated via SQL without deploying
- Outcome learner can eventually propose template tweaks (Proposal 5)
- Version column enables A/B testing prompts

### Fallback

If no row exists for a kind, use the current generic prompt. Zero breakage.

### Files to create/modify

- **Create** `db/migrations/023_step_templates.sql` — table + seed data
- **Modify** `src/lib/ops/step-prompts.ts` — query DB with cache, fall back to hardcoded

---

## Proposal 3: Context-Scoped ACL Grants

**Effort**: ~3 hours | **Impact**: Medium | **Dynamic level**: Yes (auto-created/expired)

Keep the base ACLs hardcoded (they represent agent identity — chora is a researcher, not a coder). But add a mechanism for temporary grants tied to a mission or session.

### Schema

```sql
CREATE TABLE ops_acl_grants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    TEXT NOT NULL,
    path_prefix TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('mission', 'session', 'manual')),
    source_id   UUID,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_acl_grants_active
    ON ops_acl_grants (agent_id) WHERE expires_at > now();
```

### How it works

When a mission assigns chora to a `patch_code` step in a project, it auto-creates a grant:

```sql
INSERT INTO ops_acl_grants (agent_id, path_prefix, source, source_id, expires_at)
VALUES ('chora', 'projects/my-project/', 'mission', '<mission_id>', NOW() + INTERVAL '4 hours');
```

`isPathAllowed()` checks base ACLs first, then queries active (non-expired) grants. Simple, composable, reversible.

### Files to create/modify

- **Create** `db/migrations/024_acl_grants.sql`
- **Modify** `src/lib/tools/tools/file-write.ts` — extend `isPathAllowed()` to check grants
- **Modify** `scripts/unified-worker/index.ts` — create grants when routing mission steps

---

## Proposal 4: Outcome-Driven Prompt Scoring

**Effort**: ~6 hours | **Impact**: Long-term | **Dynamic level**: Yes (automated)

Connect the outcome learner to step templates. When a step succeeds or fails, record which template version was used and the result quality.

### What it tracks

- Success rate per step kind per template version
- Average session duration per step kind
- Tool usage patterns (which tools were actually called)

### What it enables

1. **Quality scoring**: When a step kind has <50% success rate over 20+ runs, flag it
2. **Prompt suggestions**: Surface underperforming templates in a periodic report
3. **A/B testing**: Create version 2 of a template, route 20% of steps to it, compare outcomes

This is **not** auto-editing prompts — it's observability that highlights which prompts need human attention. The data feeds a dashboard or a periodic report.

### Schema additions

```sql
ALTER TABLE ops_mission_steps ADD COLUMN IF NOT EXISTS
    template_version INT DEFAULT 1;

-- Aggregation view
CREATE VIEW step_template_performance AS
SELECT
    kind,
    template_version,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
    ROUND(COUNT(*) FILTER (WHERE status = 'succeeded')::numeric / NULLIF(COUNT(*), 0) * 100) as success_rate,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::int as avg_duration_secs
FROM ops_mission_steps
WHERE status IN ('succeeded', 'failed')
GROUP BY kind, template_version;
```

### Files to create/modify

- **Create** `db/migrations/025_step_template_tracking.sql` — column + view
- **Modify** `scripts/unified-worker/index.ts` — record `template_version` when routing steps
- **Modify** `src/lib/ops/outcome-learner.ts` — aggregate by template version
- **Create** `src/lib/ops/template-health.ts` — health check for underperforming templates (called from heartbeat)

---

## Proposal 5: Declarative Trigger Conditions

**Effort**: ~8 hours | **Impact**: Medium | **Dynamic level**: Yes (fully data-driven)

The trigger rules are already in the DB (`ops_trigger_rules`), but the evaluation logic is a 400-line switch statement. Make conditions declarative by adding a `condition` JSONB column to the rules.

### Condition schema

```json
{
    "type": "query_count",
    "table": "ops_mission_steps",
    "where": { "status": "running", "updated_at_older_than_minutes": 120 },
    "operator": ">=",
    "threshold": 1
}
```

Compound conditions:

```json
{
    "type": "all",
    "conditions": [
        {
            "type": "query_count",
            "table": "ops_roundtable_sessions",
            "where": { "created_today": true },
            "operator": "==",
            "threshold": 0
        },
        {
            "type": "time_window",
            "after": "08:00",
            "before": "22:00",
            "timezone": "America/Chicago"
        }
    ]
}
```

### Supported condition types (start small)

| Type | Description |
|------|-------------|
| `query_count` | Count rows matching filters, compare against threshold |
| `event_exists` / `event_absent` | Check for recent events by kind/tags within a lookback window |
| `time_window` | Only fire during certain hours |
| `probability` | Random gate (already exists for some triggers) |
| `all` / `any` | Combinators for compound conditions |

### Migration strategy

- Add `condition` JSONB column to `ops_trigger_rules`
- Build a condition evaluator that handles the types above
- Migrate simple triggers first: `daily_roundtable`, `proposal_ready`, `work_stalled`, `memory_consolidation_due`
- Keep complex triggers (`strategic_drift_check`, `proactive_ops_report`) in the switch as-is
- When a rule has a `condition` column, use the declarative evaluator; when null, fall through to the switch

### Files to create/modify

- **Create** `db/migrations/026_trigger_conditions.sql` — add column + seed conditions
- **Create** `src/lib/ops/condition-evaluator.ts` — declarative condition engine
- **Modify** `src/lib/ops/triggers.ts` — check for declarative condition before switch statement

---

## Execution Order

| Priority | Proposal | Effort | Depends on |
|----------|----------|--------|------------|
| 1 | Thresholds to policy | ~2h | Nothing |
| 2 | Step prompt templates | ~4h | Nothing |
| 3 | Context-scoped ACL grants | ~3h | Nothing |
| 4 | Outcome-driven scoring | ~6h | Proposal 2 (templates with versions) |
| 5 | Declarative triggers | ~8h | Proposal 1 (policy pattern established) |
