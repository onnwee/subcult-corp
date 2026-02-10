# subcult-corp — Multi-Agent System for onnwee.me

A closed-loop multi-agent system with 3 AI agents (coordinator, executor, observer) running autonomous workflows.

## Architecture

```
VPS (Workers)  ←→  Supabase (State)  ←→  Vercel (API + Frontend)
   brain + hands       shared memory        process manager
```

### Three Layers

- **VPS**: Agent workers — execute queued steps (thinking + doing)
- **Vercel**: Heartbeat + API routes — approve proposals, evaluate triggers, health monitoring
- **Supabase**: PostgreSQL — single source of truth for all state and data

## The Loop

```
Agent proposes → Proposal approved → Mission created → Steps queued
→ Worker executes → Event fired → Triggers evaluated → New proposal → ...
```

## Agents (starting 3)

| Agent        | Role        | Description                                              |
| ------------ | ----------- | -------------------------------------------------------- |
| **Opus**     | Coordinator | Prioritizes work, approves proposals, keeps team aligned |
| **Brain**    | Executor    | Researches, drafts content, runs analyses                |
| **Observer** | Observer    | Monitors performance, reviews outcomes, spots patterns   |

## Getting Started

### 1. Set up Supabase

- Create a new Supabase project
- Run the SQL migrations in `supabase/migrations/` in order (001 → 008)

### 2. Configure environment

Copy `.env.example` to `.env.local` and configure:

```bash
# OpenRouter SDK — get your key at https://openrouter.ai/settings/keys
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Default model (browse models at https://openrouter.ai/models)
LLM_MODEL=anthropic/claude-sonnet-4

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key

# Cron auth
CRON_SECRET=$(openssl rand -hex 32)
```

#### Using Multiple Models

You can override the default model per request in code:

```typescript
// Use a different model for this specific call
await llmGenerate({
    messages: [...],
    model: 'openai/gpt-4o', // Override default
    temperature: 0.7,
});
```

### 3. Seed initial data

```bash
npm install dotenv
node scripts/go-live/seed-ops-policy.mjs
node scripts/go-live/seed-trigger-rules.mjs
```

### 4. Run the dev server

```bash
npm run dev
```

### 5. Test the heartbeat

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/ops/heartbeat
```

### 6. Set up cron (production)

```bash
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/ops/heartbeat
```

## API Routes

| Route                 | Method | Description                                                       |
| --------------------- | ------ | ----------------------------------------------------------------- |
| `/api/ops/heartbeat`  | GET    | System pulse — triggers, reactions, recovery, roundtable schedule |
| `/api/ops/proposals`  | POST   | Submit a new proposal                                             |
| `/api/ops/proposals`  | GET    | List proposals (filter by status, agent)                          |
| `/api/ops/missions`   | GET    | List missions with their steps                                    |
| `/api/ops/events`     | GET    | List recent events                                                |
| `/api/ops/roundtable` | POST   | Trigger a conversation (enqueue to worker)                        |
| `/api/ops/roundtable` | GET    | List conversation sessions + turns                                |

## Database Tables

| Table                     | Purpose                                |
| ------------------------- | -------------------------------------- |
| `ops_mission_proposals`   | Agent proposals (requests for work)    |
| `ops_missions`            | Approved missions                      |
| `ops_mission_steps`       | Execution steps within missions        |
| `ops_agent_events`        | Event stream (everything that happens) |
| `ops_policy`              | Key-value policy configuration         |
| `ops_trigger_rules`       | Trigger rules evaluated by heartbeat   |
| `ops_agent_reactions`     | Agent-to-agent reaction queue          |
| `ops_action_runs`         | Audit log for heartbeat runs           |
| `ops_roundtable_sessions` | Conversation sessions (worker queue)   |
| `ops_roundtable_turns`    | Individual dialogue turns              |

## Key Concepts

- **Cap Gates**: Quota checks at proposal entry — block before tasks pile up
- **Auto-approve**: Low-risk step kinds pass automatically, high-risk await manual review
- **Trigger Rules**: Conditions evaluated each heartbeat — reactive + proactive
- **Reaction Matrix**: JSON policy defining how agents respond to each other
- **Stale Recovery**: Steps running >30min get auto-failed
- **Roundtable Conversations**: Turn-by-turn agent dialogues (standup, debate, watercooler)
- **Agent Voices**: Persona configs giving each agent a unique tone and speaking style
- **Speaker Selection**: Weighted randomness based on affinity, recency, and jitter
- **Daily Schedule**: 10 time slots across 24h with probability-based firing

## Roundtable Worker (VPS)

The roundtable worker runs on a VPS and polls for pending conversations:

```bash
# Start the worker
node scripts/roundtable-worker/worker.mjs
```

It polls every 30 seconds, claims pending sessions atomically, and generates
dialogue turn by turn via LLM calls with 3-8 second gaps between turns.

### Triggering a conversation manually

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"format":"standup","topic":"What are our priorities?","participants":["opus","brain","observer"]}' \
  http://localhost:3000/api/ops/roundtable
```
