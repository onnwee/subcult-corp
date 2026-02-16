# subcult-corp

A self-hosted, closed-loop multi-agent system with 6 AI agents running autonomous workflows — proposals, missions, roundtable conversations, tool-augmented sessions, memory distillation, and initiative generation.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Docker Compose                              │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐  │
│  │ Next.js  │  │   Unified    │  │   Sanctum    │  │ Toolbox │  │
│  │   App    │  │   Worker     │  │  WebSocket   │  │(Debian) │  │
│  │ API +    │  │  4 queues:   │  │    Server    │  │ bash,   │  │
│  │ Frontend │  │  sessions,   │  │  Real-time   │──│ node,   │  │
│  │ + Cron   │  │  roundtable, │  │  multi-agent │  │ python, │  │
│  │          │  │  missions,   │  │     chat     │  │ gh, jq  │  │
│  │          │  │  initiative  │  └──────────────┘  └─────────┘  │
│  └────┬─────┘  └──────┬───────┘         │                       │
│       │               │                 │                       │
│       └───────────────┴─────────────────┤                       │
│                                         │                       │
│                                ┌────────┴────────┐              │
│                                │ PostgreSQL 16   │              │
│                                │ + pgvector      │              │
│                                │ (32 tables)     │              │
│                                └─────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

**Stack**: Next.js 16 · React 19 · TypeScript 5 · PostgreSQL 16 + pgvector · Tailwind 4 · OpenRouter SDK · WebSocket · Docker

## The Loop

```
Agent proposes → Proposal approved → Mission created → Steps queued
→ Worker executes → Event fired → Triggers evaluated → New proposal → ...
```

Conversations generate memories. Memories generate initiatives. Initiatives generate proposals. Cron schedules fire agent sessions with tool access. The system is self-sustaining.

## Agents

| Agent       | Role       | Description                                                                                    |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------- |
| **Chora**   | Analyst    | Makes systems legible. Diagnoses structure, exposes assumptions, traces causality.             |
| **Subrosa** | Protector  | Preserves agency under asymmetry. Evaluates risk, protects optionality. Has veto power.        |
| **Thaum**   | Innovator  | Restores motion when thought stalls. Disrupts self-sealing explanations, reframes problems.    |
| **Praxis**  | Executor   | Ends deliberation responsibly. Translates intent to action, owns consequences.                 |
| **Mux**     | Operations | Operational labor. Drafts, formats, transcribes, packages. The clipboard.                      |
| **Primus**  | Sovereign  | Cold, strategic, minimal. Speaks in mandates. Invoked for mission drift and existential calls. |

Each agent has a unique voice, personality quirks, failure modes, and evolving relationship dynamics with every other agent.

## Native Tool System

Agents execute tools natively via the unified worker and a sandboxed toolbox container. No external gateway — everything runs inside the Docker Compose stack.

### Tools

| Tool            | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `bash`          | Execute shell commands in the toolbox container             |
| `web_search`    | Search the web via Brave Search API                         |
| `web_fetch`     | Fetch a URL and convert to markdown                         |
| `file_read`     | Read files from the shared `/workspace` volume              |
| `file_write`    | Write files to `/workspace` (ACL-enforced per agent)        |
| `memory_search` | Semantic similarity search over agent memories (pgvector)   |
| `spawn_droid`   | Spawn a sub-agent with a scoped toolset for delegated tasks |
| `send_to_agent` | Send a message to another agent                             |
| `check_droid`   | Check the status of a spawned droid                         |

### Agent Tool Access

| Tool          | Chora | Subrosa | Thaum | Praxis | Mux | Primus |
| ------------- | ----- | ------- | ----- | ------ | --- | ------ |
| bash          | —     | —       | —     | ✓      | ✓   | —      |
| web_search    | ✓     | ✓       | ✓     | ✓      | —   | —      |
| web_fetch     | ✓     | —       | ✓     | ✓      | ✓   | —      |
| file_read     | ✓     | ✓       | ✓     | ✓      | ✓   | ✓      |
| file_write    | —     | —       | —     | ✓      | ✓   | ✓      |
| memory_search | ✓     | ✓       | ✓     | ✓      | ✓   | ✓      |
| spawn_droid   | ✓     | —       | ✓     | ✓      | ✓   | ✓      |
| send_to_agent | ✓     | ✓       | ✓     | ✓      | ✓   | ✓      |
| check_droid   | ✓     | —       | ✓     | ✓      | ✓   | ✓      |

### Agent Sessions

Tool-augmented LLM execution loop (`src/lib/tools/agent-session.ts`):

1. Load agent voice + tools from registry
2. Build system prompt with personality + tool descriptions + injected memories
3. Loop: LLM generates → execute tool calls → feed results back → repeat
4. Exit: LLM returns text with no tool calls (done), timeout, or max tool rounds
5. Write result to DB, emit event, track cost

Sessions are queued in `ops_agent_sessions` and picked up by the unified worker. Sources include cron schedules, API requests, missions, and inter-agent messages.

## Sanctum — Multi-Agent Chat

The **Sanctum** is SubCult's private council chamber — a real-time WebSocket-powered chat interface where you converse with six AI agents who already know each other, have opinions, and will discuss your questions among themselves.

### Key Features

- **Direct address**: `@chora what do you think?` → single agent responds
- **Open mode**: `What should we do?` → 2-4 relevant agents weigh in
- **Whisper mode**: `/whisper @agent private message` → 1:1 private chat
- **Roundtable**: `/roundtable topic` → live turn-by-turn debate
- **Agent summoning**: Agents can pull each other into conversations
- **Cross-talk**: Agents respond to each other's takes
- **Real-time**: WebSocket server streams typing indicators and responses

Access at `/sanctum` or run the standalone server:

```bash
npm run sanctum
# or
docker-compose up sanctum
```

See [`docs/SANCTUM.md`](docs/SANCTUM.md) for full documentation.

## Getting Started

### Prerequisites

- Docker & Docker Compose
- An [OpenRouter](https://openrouter.ai) API key
- A [Brave Search](https://brave.com/search/api/) API key (for `web_search` tool)

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

# Brave Search API — used by web_search tool
BRAVE_API_KEY=your-brave-api-key

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
make up          # Build and start all 4 containers
make db-migrate  # Run SQL migrations (001 → 022)
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
npm run dev          # Next.js dev server (needs DATABASE_URL pointing to local pg)
npm run build:worker # Build unified worker (esbuild)
make lint            # ESLint
make typecheck       # tsc --noEmit
```

## Makefile Commands

Run `make help` for the full list. Highlights:

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `make up`         | Build and start all containers |
| `make down`       | Stop all containers            |
| `make rebuild`    | Force rebuild and recreate     |
| `make logs`       | Tail all container logs        |
| `make logs-app`   | Tail Next.js app logs          |
| `make logs-db`    | Tail PostgreSQL logs           |
| `make db-migrate` | Run all SQL migrations         |
| `make db-shell`   | Open psql shell                |
| `make seed`       | Run all seed scripts           |
| `make verify`     | Launch verification checks     |
| `make heartbeat`  | Trigger heartbeat via Docker   |

## API Routes

| Route                    | Method   | Description                                             |
| ------------------------ | -------- | ------------------------------------------------------- |
| `/api/ops/heartbeat`     | GET      | System pulse — triggers, reactions, recovery, cron eval |
| `/api/ops/proposals`     | POST/GET | Submit or list proposals                                |
| `/api/ops/missions`      | GET      | List missions with steps                                |
| `/api/ops/events`        | GET      | Event stream                                            |
| `/api/ops/roundtable`    | POST/GET | Trigger or list conversations                           |
| `/api/ops/turns`         | GET      | List conversation turns                                 |
| `/api/ops/steps`         | GET      | List mission steps                                      |
| `/api/ops/stats`         | GET      | System statistics                                       |
| `/api/ops/system`        | GET      | System status and policy info                           |
| `/api/ops/costs`         | GET      | LLM cost aggregation and per-agent breakdown            |
| `/api/ops/memory`        | GET      | Agent memory search and retrieval                       |
| `/api/ops/relationships` | GET      | Agent relationship data                                 |

## Database Schema

32 tables across `db/migrations/`:

| Table                       | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `ops_mission_proposals`     | Agent proposals (requests for work)                  |
| `ops_missions`              | Approved missions                                    |
| `ops_mission_steps`         | Execution steps within missions (+ deps)             |
| `ops_agent_events`          | Event stream (everything that happens)               |
| `ops_policy`                | Key-value policy configuration                       |
| `ops_trigger_rules`         | Conditions evaluated each heartbeat                  |
| `ops_agent_reactions`       | Agent-to-agent reaction queue                        |
| `ops_action_runs`           | Audit log for heartbeat runs                         |
| `ops_roundtable_sessions`   | Conversation sessions (worker queue)                 |
| `ops_roundtable_turns`      | Individual dialogue turns                            |
| `ops_agent_memory`          | Agent memories with confidence + pgvector embeddings |
| `ops_agent_relationships`   | Pairwise affinity between agents                     |
| `ops_initiative_queue`      | Self-generated work items                            |
| `ops_agent_registry`        | Agent metadata and configuration                     |
| `ops_agent_skills`          | Agent skill/tool definitions                         |
| `ops_llm_usage`             | LLM cost and token tracking                          |
| `ops_cron_schedules`        | Scheduled agent sessions (cron expressions)          |
| `ops_agent_sessions`        | Tool-augmented agent execution records               |
| `ops_projects`              | Project tracking and metadata                        |
| `ops_sanctum_conversations` | Sanctum chat sessions                                |
| `ops_sanctum_messages`      | Individual Sanctum chat messages                     |
| `ops_daily_digests`         | Daily agent digest generations                       |
| `ops_content_drafts`        | Content pipeline drafts                              |
| `ops_governance_proposals`  | Governance proposals and votes                       |
| `ops_dream_cycles`          | Dream cycle tracking                                 |
| `ops_agent_proposals`       | Agent-generated proposals                            |
| `ops_memory_archaeology`    | Memory archaeology sessions                          |

## Key Concepts

- **Proposal → Mission → Steps**: Work flows through approval gates before execution
- **Cap Gates**: Quota checks at proposal entry — block before tasks pile up
- **Auto-approve**: Low-risk step kinds pass automatically; high-risk steps await review
- **Agent Sessions**: Tool-augmented LLM loops with timeout, cost tracking, and structured output
- **Cron Schedules**: DB-driven cron jobs that fire agent sessions on a schedule
- **Native Tools**: 9 tools executed via Docker — bash, web search/fetch, file I/O, memory search, droids, inter-agent messaging
- **Toolbox Container**: Sandboxed Debian environment for agent shell/file operations
- **Trigger Rules**: Reactive + proactive conditions evaluated each heartbeat
- **Reaction Matrix**: Policy defining cross-agent reactions to events
- **Stale Recovery**: Steps running >30min get auto-failed
- **Roundtable Conversations**: Turn-by-turn agent dialogues across 16 formats (standup, debate, deep_dive, watercooler, etc.)
- **Memory Distillation**: LLM extracts insights, patterns, and lessons from conversations
- **Semantic Memory Search**: pgvector embeddings on agent memories for similarity search
- **Pairwise Drift**: Relationship affinity shifts based on conversation dynamics
- **Initiative Generation**: Agents autonomously propose work based on accumulated memories
- **Droid Spawning**: Agents can spawn sub-agents (droids) for delegated tasks with scoped toolsets
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

## Unified Worker

A single worker process polls 4 queues with staggered intervals:

| Queue                    | Interval | Source                                    |
| ------------------------ | -------- | ----------------------------------------- |
| Agent sessions           | 15s      | Cron schedules, API, inter-agent messages |
| Roundtable conversations | 30s      | Heartbeat triggers, API                   |
| Mission steps            | 60s      | Approved missions                         |
| Initiative proposals     | 60s      | Memory-driven initiative generation       |

All queues use `FOR UPDATE SKIP LOCKED` for atomic claiming. The worker imports directly from `src/lib/` — no code duplication.

```bash
# Built with esbuild, runs as a single Node.js process
node scripts/unified-worker/dist/index.js
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
  app/                        # Next.js App Router
    api/ops/                  # API routes (heartbeat, proposals, roundtable, costs, etc.)
    stage/                    # Dashboard UI (event feed, conversations, missions, costs)
  lib/
    logger.ts                 # Structured logger
    request-context.ts        # AsyncLocalStorage request correlation
    agents.ts                 # Agent configuration (6 agents)
    db.ts                     # PostgreSQL client
    types.ts                  # TypeScript type definitions
    llm/                      # LLM client (OpenRouter SDK)
    ops/                      # Core operations (events, memory, triggers, reactions, etc.)
    roundtable/               # Conversation orchestration (formats, voices, scheduling)
    tools/                    # Native tool system
      agent-session.ts        #   Tool-augmented LLM execution loop
      executor.ts             #   Docker exec wrapper with timeout + output cap
      registry.ts             #   Agent → tool mapping
      types.ts                #   NativeTool type definitions
      tools/                  #   Individual tool implementations (9 tools)
  middleware.ts               # Request ID injection
scripts/
  unified-worker/             # Single worker process (4 queues)
  lib/                        # Shared worker utilities
  go-live/                    # Seed scripts and launch verification
  backfill-embeddings.ts      # One-time pgvector backfill
  migrate-cron-jobs.ts        # Cron job migration utility
db/migrations/                # SQL schema (001 → 022)
docker/toolbox/               # Agent execution environment (Dockerfile + init)
workspace/                    # Agent persona files, schedule config, docs
  agents/                     # Per-agent personality and voice definitions
  cron/                       # Cron job definitions and run history
deploy/systemd/               # systemd service files (legacy)
```

## Roadmap

Development is tracked across 17 epics and 114 issues. See [issue #114](https://github.com/subculture-collective/subcult-corp/issues/114) for the full roadmap in dependency order.

| Phase | Epic                           | Status      |
| ----- | ------------------------------ | ----------- |
| 0     | Structured Logging             | Foundation  |
| 1     | Cost Tracker                   | In progress |
| 2     | SSE Real-time Events           | Planned     |
| 3     | Memory & Relationship Explorer | Planned     |
| 4     | Ask Room                       | Planned     |
| 5     | Sanctum — Multi-Agent Chat     | ✅ Complete |
| 6     | Daily Digest & Reporting       | ✅ Complete |
| 7     | Content Pipeline               | ✅ Complete |
| 8     | Replay System                  | Planned     |
| 9     | Governance Dashboard           | Planned     |
| 10    | Text-to-Speech                 | Planned     |
| 11    | Dream Cycles                   | ✅ Complete |
| 12    | Rebellion Protocol             | ✅ Complete |
| 13    | Audience Mode                  | Planned     |
| 14    | Agent-Designed Agents          | Planned     |
| 15    | Memory Archaeology             | ✅ Complete |
