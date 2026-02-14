# Replace OpenClaw with Native Agent Execution in subcult-corp

## Context

OpenClaw runs as a separate systemd service providing agent tool execution (bash, web search, file I/O) for cron-triggered LLM sessions. subcult-corp already has its own LLM client, 6 agents, roundtable orchestration, missions, events, and cost tracking — but relies on OpenClaw for tool execution via a socat bridge + event-bridge daemon (~1,700 lines of glue code).

This plan eliminates OpenClaw entirely by building native tool execution into subcult-corp, unifying the 3 worker containers into 1, and adding a "toolbox" Docker container that agents can exec into.

## Architecture Overview

```
Before:                              After:
┌─────────────┐                      ┌─────────────┐
│ subcult-app │                      │ subcult-app │
├─────────────┤                      ├─────────────┤
│ roundtable  │──┐                   │   unified   │───docker exec──→ ┌─────────┐
│   worker    │  │                   │   worker    │                  │ toolbox │
├─────────────┤  ├─socat─→ OpenClaw  ├─────────────┤                  │ (debian)│
│  mission    │  │         gateway   │  postgres   │                  └─────────┘
│   worker    │──┘                   │ (pgvector)  │
├─────────────┤                      └─────────────┘
│ initiative  │
│   worker    │
├─────────────┤
│  openclaw   │
│   bridge    │
├─────────────┤
│  postgres   │
└─────────────┘
```

6 containers → 4 containers. OpenClaw gateway + socat proxy + event bridge = gone.

## Phase 1: Toolbox Container + Native Tools

### 1a. Create toolbox Dockerfile

**Create** `docker/toolbox/Dockerfile`:

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget jq git python3 python3-pip python3-venv \
    ripgrep fd-find ca-certificates gnupg tmux \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*

# Python venv for agent scripts
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir requests feedparser beautifulsoup4 html2text

RUN useradd -m -s /bin/bash agent
USER agent
WORKDIR /workspace
CMD ["sleep", "infinity"]
```

### 1b. Create native tool implementations

**Create** `src/lib/tools/` directory:

```
src/lib/tools/
  index.ts          — barrel export
  types.ts          — NativeTool type (extends ToolDefinition)
  executor.ts       — docker exec wrapper with timeout + output cap
  registry.ts       — agent→tool mapping, getAgentTools()
  tools/
    bash.ts         — exec command in toolbox
    web-search.ts   — Brave Search API
    web-fetch.ts    — fetch URL → markdown via toolbox curl + html2text
    file-read.ts    — read from /workspace
    file-write.ts   — write to /workspace (base64-safe)
    memory-search.ts — pgvector similarity search
```

**`executor.ts`** — core docker exec wrapper:
- `execInToolbox(command, timeoutMs)` → `{ stdout, stderr, exitCode, timedOut }`
- Uses `child_process.execFile('docker', ['exec', 'subcult-toolbox', 'bash', '-c', command])`
- Output capped at 50KB (stdout) and 10KB (stderr) to avoid flooding LLM context
- Default timeout: 30s

**Tool access per agent:**

| Tool | chora | subrosa | thaum | praxis | mux | primus |
|------|-------|---------|-------|--------|-----|--------|
| bash | - | - | - | yes | yes | - |
| web_search | yes | yes | yes | yes | - | - |
| web_fetch | yes | - | yes | yes | yes | - |
| file_read | yes | yes | yes | yes | yes | yes |
| file_write | - | - | - | yes | yes | yes |
| memory_search | yes | yes | yes | yes | yes | yes |

Primus gets file_write for strategic directives. Subrosa gets web_search for security research.

### 1c. Key files to modify

- **`src/lib/types.ts`** — Add `AgentSession`, `CronSchedule` types. Remove `OpenClawConfig`, `SkillExecutionResult`, `requiresGateway` from `SkillDefinition`
- **`src/lib/skills/`** — Delete `openclaw-bridge.ts` and `registry.ts`. Replace with `src/lib/tools/` imports

## Phase 2: Agent Session Execution Engine

### 2a. New DB tables

**Create** `db/migrations/018_ops_cron_schedules.sql`:

```sql
CREATE TABLE IF NOT EXISTS ops_cron_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  prompt TEXT NOT NULL,
  timeout_seconds INTEGER DEFAULT 300,
  max_tool_rounds INTEGER DEFAULT 15,
  model TEXT,                          -- optional model override
  enabled BOOLEAN DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  next_fire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Create** `db/migrations/019_ops_agent_sessions.sql`:

```sql
CREATE TABLE IF NOT EXISTS ops_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'cron',
  source_id UUID,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','failed','timed_out')),
  model TEXT,
  result JSONB,
  tool_calls JSONB DEFAULT '[]',
  llm_rounds INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  timeout_seconds INTEGER DEFAULT 300,
  max_tool_rounds INTEGER DEFAULT 15,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_status ON ops_agent_sessions (status);
CREATE INDEX idx_sessions_agent ON ops_agent_sessions (agent_id, created_at DESC);
```

### 2b. Agent session executor

**Create** `src/lib/tools/agent-session.ts` — the core tool-augmented LLM loop:

1. Load agent voice + tools from registry
2. Build system prompt with agent personality + available tools description
3. Loop: call `llmGenerateWithTools()` → execute tool calls → feed results back → repeat
4. Exit conditions: LLM returns text with no tool calls (done), timeout, max rounds
5. Write result to DB, emit `agent_session_completed` event
6. Track all tool calls in `tool_calls` JSONB column

The existing `llmGenerateWithTools()` in `src/lib/llm/client.ts` already handles OpenRouter SDK tool calling with auto-execution. The agent session executor wraps this in a timeout-aware outer loop.

**Model selection for sessions**: Use the cron schedule's `model` override if set, otherwise fall back to `DEFAULT_MODELS`. Research-heavy jobs can specify `deepseek/deepseek-chat` for cheap deep reasoning; synthesis jobs can specify `anthropic/claude-sonnet-4.5`.

### 2c. Cron evaluation in heartbeat

**Modify** `src/app/api/ops/heartbeat/route.ts` — add Phase 8:

```typescript
// Phase 8: Evaluate cron schedules
const cronResult = await evaluateCronSchedules();
```

`evaluateCronSchedules()`:
1. Query `ops_cron_schedules WHERE enabled AND next_fire_at <= NOW()`
2. For each: INSERT into `ops_agent_sessions` with status `pending`
3. Update `last_fired_at`, compute `next_fire_at` via `cron-parser` npm package

## Phase 3: Unified Worker

### 3a. Merge 3 workers into 1

**Create** `scripts/unified-worker/`:

```
scripts/unified-worker/
  index.ts            — entry point, poll loop, graceful shutdown
  queues/
    roundtable.ts     — imports src/lib/roundtable/orchestrator
    mission.ts        — imports src/lib/ops/ step execution
    initiative.ts     — imports src/lib/ops/initiative
    agent-session.ts  — NEW: tool-augmented sessions
  tsconfig.json       — extends base, targets Node.js
```

**Poll loop** (single process, staggered checks):

```
Every 15s: check agent_sessions (highest priority — cron-triggered work)
Every 30s: check roundtable_sessions
Every 60s: check mission_steps
Every 60s: check initiative_queue
```

All queues use `FOR UPDATE SKIP LOCKED` for atomic claiming (existing pattern in all 3 workers).

**Build**: Use `tsx` for dev, `esbuild` for production bundle. Workers import from `src/lib/` directly — eliminates the 4,000+ lines of duplicated JS in the `.mjs` files.

### 3b. Docker Compose changes

**Modify** `docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16    # was postgres:16-alpine
    # ... rest unchanged

  app:
    # ... unchanged

  worker:                             # replaces 3 separate workers
    build: .
    container_name: subcult-worker
    restart: unless-stopped
    command: ['node', 'scripts/unified-worker/dist/index.js']
    depends_on:
      postgres: { condition: service_healthy }
    env_file: [.env.local]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - workspace:/workspace
    networks: [internal]

  toolbox:                            # NEW: agent execution environment
    build:
      context: docker/toolbox
    container_name: subcult-toolbox
    restart: unless-stopped
    volumes:
      - workspace:/workspace
    networks: [internal]

volumes:
  pgdata:
  workspace:                          # NEW: shared between worker + toolbox

networks:
  web: { external: true }
  internal: { driver: bridge }
```

**Remove**: `roundtable-worker`, `mission-worker`, `initiative-worker`, `openclaw-bridge`

### 3c. Dockerfile changes

**Modify** `Dockerfile` — add unified worker build step:

```dockerfile
# After Next.js build, build the unified worker
RUN npx esbuild scripts/unified-worker/index.ts \
    --bundle --platform=node --target=node22 \
    --outfile=scripts/unified-worker/dist/index.js \
    --external:postgres --external:@openrouter/sdk
```

## Phase 4: pgvector Memory Search

### 4a. Enable pgvector

**Create** `db/migrations/020_pgvector_memory.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE ops_agent_memory ADD COLUMN IF NOT EXISTS embedding vector(1024);
CREATE INDEX IF NOT EXISTS idx_memory_embedding
  ON ops_agent_memory USING hnsw (embedding vector_cosine_ops);
```

Switch Postgres image from `postgres:16-alpine` to `pgvector/pgvector:pg16` (drop-in replacement).

### 4b. Embedding pipeline

- Use existing Ollama bge-m3 at `100.85.46.7:11434/v1/embeddings`
- Compute embeddings on memory creation (in `src/lib/ops/memory.ts`)
- Fallback to ILIKE text search if Ollama unreachable
- `memory_search` tool queries `ORDER BY embedding <=> query_vector LIMIT N`

### 4c. Backfill script

**Create** `scripts/backfill-embeddings.ts` — one-time script to embed existing memories.

## Phase 5: Migrate OpenClaw Cron Jobs

### 5a. Seed cron schedules

**Create** `scripts/migrate-cron-jobs.ts`:
- Read current enabled jobs from OpenClaw (`openclaw cron list --json`)
- INSERT into `ops_cron_schedules` with adapted prompts
- Rewrite vague prompts to explicit tool instructions per MEMORY.md best practice

### 5b. Jobs to migrate (13 enabled)

| Job | Agent | Schedule | Notes |
|-----|-------|----------|-------|
| Morning Research Scan | chora | 0 12 * * * (7am CT) | web_search heavy |
| Social & Market Scanner | chora | 0 13,23 * * * | web_search + synthesis |
| Daily Briefing | chora | 0 2 * * * (9pm CT) | needs prior session outputs as context |
| AI & Tech Radar | chora | 0 17 * * * | web_search + tech focus |
| Subcult Watch | chora | 0 19 * * * | brand monitoring |
| Weekly Deep Digest | chora | 0 23 * * 0 | heavy model, weekly |
| Agent Dream | thaum | 0 8 * * * (3am CT) | creative cross-pollination |
| Nightly Synthesis | chora | 0 11 * * * (6am CT) | memory consolidation |
| Federation Roundtable | primus | 0 21 * * 5 | triggers roundtable |
| CVE Security Check | subrosa | 30 12 * * * | security relevance filtering |
| Calendar Briefing | mux | 0 12 * * * | gog integration |
| Email Triage | mux | 0 14 * * * | gog integration |

**Skip**: All trading/market jobs (Polymarket, Trade Journal, trading bots, snipers), Proactive Initiative (zombie), disabled Twitter jobs.

### 5c. Context injection pattern

Replace `job-chain.sh` (fetches prior job outputs) with a DB query: the agent session executor can query recent `ops_agent_sessions WHERE source = 'cron' AND status = 'succeeded' ORDER BY created_at DESC LIMIT 5` and inject summaries into the prompt. No external scripts needed.

## Phase 6: Cleanup

### Delete from subcult-corp:

| File | Lines | Reason |
|------|-------|--------|
| `src/lib/skills/openclaw-bridge.ts` | 215 | Gateway HTTP client |
| `src/lib/skills/registry.ts` | 584 | 19 OpenClaw skill mappings |
| `scripts/roundtable-worker/worker.mjs` | ~2,000 | Replaced by unified worker |
| `scripts/mission-worker/worker.mjs` | ~1,200 | Replaced by unified worker |
| `scripts/initiative-worker/worker.mjs` | ~700 | Replaced by unified worker |

### Delete from host:

| Path | What |
|------|------|
| `~/.openclaw/bridge/` | Event bridge daemon + state |
| `~/.openclaw/scripts/event-bridge.py` | JSONL→Postgres bridge |
| `~/.openclaw/scripts/federation-bridge.sh` | Cross-instance bridge |
| `~/projects/openclaw-proxy/` | socat bridge to Docker |

### Remove env vars from `.env.local`:
- `OPENCLAW_GATEWAY_URL`, `OPENCLAW_AUTH_TOKEN`, `OPENCLAW_TIMEOUT_MS`

### Add env vars to `.env.local`:
- `BRAVE_API_KEY` (already have key: `BSA4Jq0Qu8rjSp3ySJyK_-Yo8XyCUBI`)

### Stop OpenClaw:
```bash
systemctl --user stop openclaw-gateway
systemctl --user disable openclaw-gateway
```

## Phase 7: tmuxai for Agent Terminals (Optional/Future)

tmuxai (github.com/alvinunreal/tmuxai) could provide a richer agent experience inside the toolbox — persistent tmux sessions with observe/exec panes, terminal context awareness. But for v1, plain `docker exec` is simpler and sufficient. If agents need persistent terminal sessions later (e.g., for interactive debugging, long-running processes), install tmuxai inside the toolbox and have the session executor communicate via tmux send-keys / capture-pane instead of docker exec.

## Execution Order

1. Create `docker/toolbox/Dockerfile` + test standalone
2. Add DB migrations (018, 019, 020) — run against existing DB
3. Create `src/lib/tools/` — all 6 native tools + executor + registry
4. Create `src/lib/tools/agent-session.ts` — the LLM+tools loop
5. Add cron evaluation to heartbeat
6. Create `scripts/unified-worker/` — merged poll loop importing from `src/lib/`
7. Update `Dockerfile` for worker build step
8. Update `docker-compose.yml` — new topology
9. Migrate cron jobs from OpenClaw → DB
10. `docker compose down && docker compose up -d --build`
11. Verify: trigger a cron job manually, check events in dashboard
12. Run backfill-embeddings script
13. Cleanup: delete old files, stop OpenClaw

## Verification

1. `docker compose up -d --build` — all 4 containers healthy
2. Manual agent session: `INSERT INTO ops_agent_sessions (agent_id, prompt, source) VALUES ('chora', 'Search the web for latest AI news and summarize top 3 stories', 'api');` → worker picks up, executes web_search tool, writes result
3. Check event stream: `/api/ops/events/stream` shows `agent_session_completed`
4. Check cost tracking: `/api/ops/costs?period=today` shows session cost
5. Wait for heartbeat → cron schedule fires → session created → executed
6. Check roundtables still work (unchanged polling, now in unified worker)
7. Check missions still work (unchanged polling, now in unified worker)
8. Memory search: agent uses `memory_search` tool, gets pgvector results
9. Toolbox resilience: `docker restart subcult-toolbox` → next tool call works

## Risks

- **Docker socket in worker**: Required for `docker exec`. Accepted tradeoff per user ("kill and restart if it breaks")
- **pgvector image swap**: Drop-in replacement for postgres:16-alpine. Data volume persists.
- **Ollama dependency for embeddings**: Graceful degradation to ILIKE text search
- **Unified worker SPOF**: `restart: unless-stopped` handles crashes. Same risk as before but consolidated.
- **Worker model list divergence**: Roundtable uses cheap dialogue models, missions use heavier models. Preserve this via context-specific model selection in the unified worker.
