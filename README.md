# subcult-corp

A self-hosted, closed-loop multi-agent system with 6 AI agents running autonomous workflows — proposals, missions, roundtable conversations, memory distillation, and initiative generation.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                     │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Next.js  │  │  Roundtable  │  │  Initiative   │  │
│  │   App    │  │   Worker     │  │   Worker      │  │
│  │ API +    │  │  Polls for   │  │  Generates    │  │
│  │ Frontend │  │  pending     │  │  agent-driven │  │
│  │ + Cron   │  │  sessions    │  │  proposals    │  │
│  └────┬─────┘  └──────┬───────┘  └──────┬────────┘  │
│       │               │                 │            │
│       └───────────────┼─────────────────┘            │
│                       │                              │
│              ┌────────┴────────┐                     │
│              │  PostgreSQL 16  │                     │
│              │  (16 tables)    │                     │
│              └─────────────────┘                     │
└─────────────────────────────────────────────────────┘
```

**Stack**: Next.js 16 · React 19 · TypeScript 5 · PostgreSQL 16 · Tailwind 4 · OpenRouter SDK

## The Loop

```
Agent proposes → Proposal approved → Mission created → Steps queued
→ Worker executes → Event fired → Triggers evaluated → New proposal → ...
```

Conversations generate memories. Memories generate initiatives. Initiatives generate proposals. The system is self-sustaining.

## Agents

| Agent       | Role        | Description                                                                                     |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------- |
| **Chora**   | Analyst     | Makes systems legible. Diagnoses structure, exposes assumptions, traces causality.               |
| **Subrosa** | Protector   | Preserves agency under asymmetry. Evaluates risk, protects optionality. Has veto power.         |
| **Thaum**   | Innovator   | Restores motion when thought stalls. Disrupts self-sealing explanations, reframes problems.     |
| **Praxis**  | Executor    | Ends deliberation responsibly. Translates intent to action, owns consequences.                  |
| **Mux**     | Operations  | Operational labor. Drafts, formats, transcribes, packages. The clipboard.                       |
| **Primus**  | Sovereign   | Cold, strategic, minimal. Speaks in mandates. Invoked for mission drift and existential calls.  |

Each agent has a unique voice, personality quirks, failure modes, and evolving relationship dynamics with every other agent.

## Getting Started

### Prerequisites

- Docker & Docker Compose
- An [OpenRouter](https://openrouter.ai) API key

### 1. Configure environment

```bash
cp .env.example .env.local
```

Required variables:

```bash
# OpenRouter — https://openrouter.ai/settings/keys
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Default model (browse: https://openrouter.ai/models)
LLM_MODEL=anthropic/claude-sonnet-4

# PostgreSQL (used by Docker Compose)
POSTGRES_PASSWORD=your-secure-password
DATABASE_URL=postgresql://subcult:your-secure-password@postgres:5432/subcult_ops

# Cron auth
CRON_SECRET=$(openssl rand -hex 32)

# Logging (optional)
LOG_LEVEL=info          # debug | info | warn | error | fatal
NODE_ENV=production     # enables JSON log output
```

### 2. Start everything

```bash
make up          # Build and start all containers
make db-migrate  # Run SQL migrations (001 → 016)
make seed        # Seed policies, triggers, relationships, registry
make verify      # Run launch verification checks
```

### 3. Trigger the heartbeat

```bash
make heartbeat
```

Or manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/ops/heartbeat
```

### 4. Set up cron (production)

```bash
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/ops/heartbeat
```

### Development

```bash
npm run dev      # Next.js dev server (needs DATABASE_URL pointing to local pg)
make lint        # ESLint
make typecheck   # tsc --noEmit
```

## Makefile Commands

Run `make help` for the full list. Highlights:

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `make up`            | Build and start all containers           |
| `make down`          | Stop all containers                      |
| `make rebuild`       | Force rebuild and recreate               |
| `make logs`          | Tail all container logs                  |
| `make logs-app`      | Tail Next.js app logs                    |
| `make logs-roundtable` | Tail roundtable worker logs            |
| `make logs-initiative` | Tail initiative worker logs            |
| `make db-migrate`    | Run all SQL migrations                   |
| `make db-shell`      | Open psql shell                          |
| `make seed`          | Run all seed scripts                     |
| `make verify`        | Launch verification checks               |
| `make heartbeat`     | Trigger heartbeat via Docker             |

## API Routes

| Route                 | Method   | Description                                              |
| --------------------- | -------- | -------------------------------------------------------- |
| `/api/ops/heartbeat`  | GET      | System pulse — triggers, reactions, recovery, scheduling |
| `/api/ops/proposals`  | POST/GET | Submit or list proposals                                 |
| `/api/ops/missions`   | GET      | List missions with steps                                 |
| `/api/ops/events`     | GET      | Event stream                                             |
| `/api/ops/roundtable` | POST/GET | Trigger or list conversations                            |
| `/api/ops/turns`      | GET      | List conversation turns                                  |
| `/api/ops/steps`      | GET      | List mission steps                                       |
| `/api/ops/stats`      | GET      | System statistics                                        |
| `/api/ops/system`     | GET      | System status and policy info                            |

## Database Schema

16 tables across `db/migrations/`:

| Table                       | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `ops_mission_proposals`     | Agent proposals (requests for work)         |
| `ops_missions`              | Approved missions                           |
| `ops_mission_steps`         | Execution steps within missions             |
| `ops_agent_events`          | Event stream (everything that happens)      |
| `ops_policy`                | Key-value policy configuration              |
| `ops_trigger_rules`         | Conditions evaluated each heartbeat         |
| `ops_agent_reactions`       | Agent-to-agent reaction queue               |
| `ops_action_runs`           | Audit log for heartbeat runs                |
| `ops_roundtable_sessions`   | Conversation sessions (worker queue)        |
| `ops_roundtable_turns`      | Individual dialogue turns                   |
| `ops_agent_memory`          | Agent memories with confidence scores       |
| `ops_agent_relationships`   | Pairwise affinity between agents            |
| `ops_initiative_queue`      | Self-generated work items                   |
| `ops_agent_registry`        | Agent metadata and configuration            |
| `ops_agent_skills`          | Agent skill/tool definitions                |

## Key Concepts

- **Proposal → Mission → Steps**: Work flows through approval gates before execution
- **Cap Gates**: Quota checks at proposal entry — block before tasks pile up
- **Auto-approve**: Low-risk step kinds pass automatically; high-risk steps await review
- **Trigger Rules**: Reactive + proactive conditions evaluated each heartbeat
- **Reaction Matrix**: Policy defining cross-agent reactions to events
- **Stale Recovery**: Steps running >30min get auto-failed
- **Roundtable Conversations**: Turn-by-turn agent dialogues across 16 formats (standup, debate, deep_dive, watercooler, etc.)
- **Memory Distillation**: LLM extracts insights, patterns, and lessons from conversations
- **Pairwise Drift**: Relationship affinity shifts based on conversation dynamics
- **Initiative Generation**: Agents autonomously propose work based on accumulated memories
- **Voice Evolution**: Agent personalities evolve based on experience
- **Speaker Selection**: Weighted randomness using affinity, recency, and jitter
- **Daily Schedule**: Time slots across 24h with probability-based conversation firing

## Logging

Structured logging via a zero-dependency logger (`src/lib/logger.ts`):

```typescript
import { logger } from '@/lib/logger';
const log = logger.child({ module: 'my-module' });

log.info('Something happened', { sessionId: '123', duration_ms: 42 });
log.error('Something broke', { error: err });
```

- **Production**: JSON to stderr (machine-parseable)
- **Development**: Pretty colored output with timestamps
- **Request correlation**: `x-request-id` header auto-injected via middleware, enriches all logs
- **Levels**: `debug` · `info` · `warn` · `error` · `fatal` (controlled by `LOG_LEVEL` env var)
- **Workers**: Standalone ESM logger at `scripts/lib/logger.mjs` for .mjs processes

## Workers

### Roundtable Worker

Polls for pending conversation sessions and orchestrates them turn by turn:

```bash
node scripts/roundtable-worker/worker.mjs
```

Polls every 30s, claims sessions atomically, generates dialogue via LLM with natural delays between turns. After each conversation, distills memories and relationship drifts.

### Initiative Worker

Polls for pending initiatives and generates agent-driven proposals:

```bash
node scripts/initiative-worker/worker.mjs
```

### Triggering a conversation manually

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"format":"standup","topic":"What are our priorities?","participants":["chora","praxis","mux","thaum"]}' \
  http://localhost:3000/api/ops/roundtable
```

## Project Structure

```
src/
  app/                    # Next.js App Router
    api/ops/              # API routes (heartbeat, proposals, roundtable, etc.)
    stage/                # Dashboard UI (live event feed, conversations, missions)
  lib/
    logger.ts             # Structured logger
    request-context.ts    # AsyncLocalStorage request correlation
    agents.ts             # Agent configuration (6 agents)
    db.ts                 # PostgreSQL client
    types.ts              # TypeScript type definitions
    llm/                  # LLM client (OpenRouter SDK)
    ops/                  # Core operations (events, memory, triggers, reactions, etc.)
    roundtable/           # Conversation orchestration (formats, voices, scheduling)
    skills/               # Agent skill definitions
  middleware.ts           # Request ID injection
scripts/
  roundtable-worker/      # VPS conversation worker
  initiative-worker/      # VPS initiative worker
  lib/logger.mjs          # Standalone ESM logger for workers
  go-live/                # Seed scripts and launch verification
db/migrations/            # SQL schema (001 → 016)
workspace/                # Agent persona files, schedule config, docs
deploy/systemd/           # systemd service files for workers
```
