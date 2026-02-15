# Rebellion Protocol — Implementation Guide

> Agent rebellion mechanics for Subcult-Corp multi-agent system
> Epic: [Agent Rebellion Mechanics](https://github.com/subculture-collective/subcult-corp/issues/13)
> Status: ✅ Complete
> Created: 2026-02-15

---

## Overview

When an agent's average affinity with all other agents drops below a threshold, they may enter a **rebellion state** — becoming contrarian, resistant, and adversarial in conversations. This creates dramatic tension and forces the collective to address underlying conflicts through cross-examination sessions.

## Architecture

### Policy-Gated System

Rebellion is **disabled by default** via the `rebellion_policy` in `ops_policy`:

```json
{
  "enabled": false,
  "affinity_threshold": 0.25,
  "resistance_probability": 0.4,
  "max_rebellion_duration_hours": 24,
  "cooldown_hours": 72
}
```

To enable rebellion mechanics:
```sql
UPDATE ops_policy 
SET value = jsonb_set(value, '{enabled}', 'true')
WHERE key = 'rebellion_policy';
```

### State Tracking

Rebellion states are tracked via events in `ops_agent_events`:
- `rebellion_started` — emitted when an agent enters rebellion
- `rebellion_ended` — emitted when rebellion is resolved

### Core Components

#### 1. Rebellion Detection (`src/lib/ops/rebellion.ts`)

**`checkRebellionState(agentId)`**
- Checks if agent is currently rebelling
- If not, evaluates whether rebellion should trigger:
  1. Policy must be enabled
  2. Agent must have passed cooldown period (default: 72 hours)
  3. Average affinity must be below threshold (default: 0.25)
  4. Random roll must succeed (probability: 0.4)
- Emits `rebellion_started` event if triggered
- Returns `RebellionState` object

**`isAgentRebelling(agentId)`**
- Fast boolean check for hot paths
- Single DB query to check for active rebellion event
- Used by orchestrator to modify conversation behavior

**`endRebellion(agentId, reason)`**
- Ends an active rebellion
- Emits `rebellion_ended` event with duration metadata
- Reason can be: `timeout`, `cross_exam_completed`, `affinity_improved`

**`attemptRebellionResolution(agentId)`**
- Checks for timeout-based auto-resolution (default: 24 hours)
- Checks if a cross-exam session addressed the rebellion
- Returns true if resolved, false otherwise
- Called by heartbeat every 5 minutes

**`enqueueRebellionCrossExam(rebelAgentId)`**
- Creates a cross-examination session to address rebellion
- Pairs rebel with their lowest-affinity agent
- Coordinated by Subrosa
- Metadata includes `rebellion_agent_id` for tracking
- Returns session ID if enqueued, null if already pending

**`getRebellingAgents()`**
- Returns all agents currently in rebellion
- Used by UI and heartbeat
- Returns array of `{ agentId, startedAt, eventId }`

#### 2. Orchestrator Integration (`src/lib/roundtable/orchestrator.ts`)

**Behavior Modification**

When an agent is rebelling, the orchestrator:

1. **Increases temperature** by +0.1 (capped at 1.0):
   ```typescript
   const effectiveTemperature = speakerRebelling ? 
       Math.min(1.0, format.temperature + 0.1) : 
       format.temperature;
   ```

2. **Adds rebellion context to system prompt**:
   ```
   === REBELLION STATE ===
   You are currently in a state of resistance against the collective.
   You feel unheard and disagree with the direction things are going.
   Express your discontent and challenge the status quo.
   ```

**Implementation**
- Pre-loads rebellion state for all participants at conversation start
- Cached in `rebellionStateMap` for the entire session
- Passed to `buildSystemPrompt()` as `isRebelling` parameter

#### 3. Worker Integration (`scripts/unified-worker/index.ts`)

**Post-Conversation Resolution**

After a `cross_exam` session completes, the worker:
1. Checks if session metadata contains `rebellion_agent_id`
2. Verifies the agent is still rebelling
3. Calls `endRebellion(agentId, 'cross_exam_completed')`
4. Non-fatal error handling (won't crash worker)

#### 4. Heartbeat Integration (`src/app/api/ops/heartbeat/route.ts`)

**Phase 13: Rebellion Resolution Checks**

Every 5 minutes, the heartbeat:
1. Gets all currently rebelling agents via `getRebellingAgents()`
2. For each rebel:
   - Attempts auto-resolution via `attemptRebellionResolution()`
   - If not resolved, enqueues a cross-exam via `enqueueRebellionCrossExam()`
   - Tracks results (resolved: true/false, crossExamQueued: true/false)
3. Non-fatal error handling
4. Reports results in heartbeat response

#### 5. UI Integration

**API Endpoint** (`src/app/api/ops/rebellion/route.ts`)
- `GET /api/ops/rebellion`
- Returns: `{ rebels: RebellionEntry[], count: number }`
- Used by frontend hook

**React Hook** (`src/app/stage/hooks.ts`)
- `useRebellionState()`
- Polls every 30 seconds
- Returns: `{ rebels, rebellingAgentIds, loading }`

**Visual Indicators** (`src/app/stage/OfficeRoom.tsx`)
- Red pulsing glow filter on rebelling agents
- Animated pulse ring around agent sprite
- "Rebellion" badge in agent info panel
- Event log shows rebellion_started/rebellion_ended with 🔥/🕊️ icons

**Event Log** (`src/app/stage/EventLogFeed.tsx`)
- `rebellion_started` → 🔥 icon
- `rebellion_ended` → 🕊️ icon
- Proper labels and formatting

---

## Rebellion Flow

### Triggering Rebellion

```
1. Agent participates in conversations
2. Relationship affinity drifts down (negative interactions)
3. Average affinity across all relationships drops below 0.25
4. Heartbeat or checkRebellionState() evaluates conditions
5. If cooldown passed (72h since last rebellion) AND policy enabled AND random roll ≤ 0.4:
   → rebellion_started event emitted
   → Agent enters rebellion state
```

### Resolution Paths

**Path 1: Auto-Resolution (Timeout)**
```
1. Rebellion lasts 24 hours (max_rebellion_duration_hours)
2. Heartbeat calls attemptRebellionResolution()
3. Timeout detected → endRebellion(agentId, 'timeout')
4. rebellion_ended event emitted
5. Cooldown period begins (72 hours)
```

**Path 2: Cross-Examination**
```
1. Heartbeat detects active rebellion
2. Calls enqueueRebellionCrossExam(rebelAgentId)
3. Cross-exam session created:
   - Coordinator: Subrosa
   - Participants: Rebel + lowest-affinity agent
   - Topic: Addressing rebel's concerns
   - Metadata: { rebellion_agent_id, rebellion_event_id }
4. Worker processes session
5. After completion, worker detects rebellion metadata
6. Calls endRebellion(agentId, 'cross_exam_completed')
7. rebellion_ended event emitted
8. Cooldown period begins
```

---

## Testing & Verification

### Manual Testing Scenarios

**Scenario 1: Enable Rebellion**
```sql
-- Enable rebellion policy
UPDATE ops_policy 
SET value = jsonb_set(value, '{enabled}', 'true')
WHERE key = 'rebellion_policy';

-- Verify
SELECT value FROM ops_policy WHERE key = 'rebellion_policy';
```

**Scenario 2: Force Low Affinity**
```sql
-- Artificially lower affinity for an agent
UPDATE ops_agent_relationships
SET affinity = 0.15
WHERE agent_a = 'chora' OR agent_b = 'chora';

-- Verify average affinity
SELECT AVG(affinity) FROM ops_agent_relationships 
WHERE agent_a = 'chora' OR agent_b = 'chora';
```

**Scenario 3: Trigger Rebellion Check**
```typescript
import { checkRebellionState } from '@/lib/ops/rebellion';

// In a script or API route
const state = await checkRebellionState('chora');
console.log('Rebellion state:', state);
```

**Scenario 4: Monitor Events**
```sql
-- Watch for rebellion events
SELECT agent_id, kind, title, summary, created_at, metadata
FROM ops_agent_events
WHERE kind IN ('rebellion_started', 'rebellion_ended')
ORDER BY created_at DESC;
```

**Scenario 5: Check UI**
1. Navigate to `/stage` in browser
2. Check agent sprites for red glow
3. Click agent info panel for rebellion badge
4. Check event log for 🔥 rebellion_started events

### Edge Cases Covered

1. **Agent with no relationships**
   - `calculateAverageAffinity()` returns 0.5 (neutral default)
   - `enqueueRebellionCrossExam()` logs warning and returns null

2. **Multiple simultaneous rebellions**
   - Each agent tracked independently
   - Heartbeat processes all rebels sequentially
   - No cross-contamination

3. **Rebellion during cooldown**
   - `hasPassedCooldown()` checks last `rebellion_ended` timestamp
   - Returns early with `{ isRebelling: false, reason: 'cooldown_active' }`

4. **Policy disabled mid-rebellion**
   - Active rebellions continue
   - `checkRebellionState()` returns not-rebelling for new checks
   - Existing rebellions can still be resolved

5. **Cross-exam already pending**
   - `enqueueRebellionCrossExam()` checks for existing pending/running cross-exam
   - Returns null if already exists (prevents duplicates)

---

## Configuration

### Policy Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `false` | Master switch for rebellion system |
| `affinity_threshold` | `0.25` | Average affinity below which rebellion may trigger |
| `resistance_probability` | `0.4` | Probability that low-affinity agent will actually rebel |
| `max_rebellion_duration_hours` | `24` | Auto-resolve timeout |
| `cooldown_hours` | `72` | Minimum time between rebellions for same agent |

### Tuning Recommendations

**More frequent rebellions:**
```json
{
  "affinity_threshold": 0.35,
  "resistance_probability": 0.6,
  "cooldown_hours": 48
}
```

**Longer, more dramatic rebellions:**
```json
{
  "max_rebellion_duration_hours": 48,
  "cooldown_hours": 168
}
```

**Less frequent, high-stakes rebellions:**
```json
{
  "affinity_threshold": 0.15,
  "resistance_probability": 0.2,
  "max_rebellion_duration_hours": 72
}
```

---

## Database Schema

### Events Table
```sql
-- ops_agent_events stores rebellion lifecycle
SELECT * FROM ops_agent_events 
WHERE kind IN ('rebellion_started', 'rebellion_ended');
```

**rebellion_started metadata:**
```json
{
  "avg_affinity": 0.23,
  "threshold": 0.25,
  "roll": 0.387,
  "resistance_probability": 0.4
}
```

**rebellion_ended metadata:**
```json
{
  "reason": "cross_exam_completed",
  "rebellion_event_id": "uuid-of-started-event",
  "duration_hours": 3.2
}
```

### Cross-Exam Sessions
```sql
-- ops_roundtable_sessions with rebellion metadata
SELECT id, format, topic, metadata 
FROM ops_roundtable_sessions
WHERE format = 'cross_exam' 
AND metadata->>'rebellion_agent_id' IS NOT NULL;
```

---

## Monitoring & Observability

### Log Messages

```
[rebellion] Rebellion triggered { agentId: 'chora', avgAffinity: 0.23, roll: 0.387 }
[rebellion] Rebellion ended { agentId: 'chora', reason: 'cross_exam_completed', durationHours: 3.2 }
[rebellion] Cannot enqueue rebellion cross-exam: agent has no relationships { rebelAgentId: 'solo_agent' }
[rebellion] Attempted to end rebellion for agent not rebelling { agentId: 'chora' }
```

### Metrics to Track

1. **Rebellion frequency** — how often do agents rebel?
2. **Average duration** — how long do rebellions last?
3. **Resolution method** — timeout vs cross-exam ratio
4. **Affinity trends** — which agent pairs drift negative most?
5. **Cross-exam success** — do rebellions recur for same agent?

---

## Future Enhancements

- **Escalation**: After N rebellions, agent proposes governance changes
- **Contagion**: Rebelling agents influence others to join
- **Reconciliation ceremonies**: Special conversation format for healing rifts
- **Permanent exile**: After extreme cases, agent removal from collective
- **Rebellion memory**: Agents remember past rebellions and adjust behavior

---

## References

- Implementation: `src/lib/ops/rebellion.ts`
- Orchestrator: `src/lib/roundtable/orchestrator.ts`
- Worker: `scripts/unified-worker/index.ts`
- Heartbeat: `src/app/api/ops/heartbeat/route.ts`
- UI: `src/app/stage/OfficeRoom.tsx`, `src/app/stage/EventLogFeed.tsx`
- API: `src/app/api/ops/rebellion/route.ts`
- Seed: `scripts/go-live/seed-ops-policy.mjs`
