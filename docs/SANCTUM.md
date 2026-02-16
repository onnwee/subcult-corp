# Sanctum — Multi-Agent Chat Interface

The Sanctum is SubCult's private council chamber — a real-time WebSocket-powered chat interface where you converse with six AI agents who already know each other, have opinions, and will discuss your questions among themselves.

## Architecture

```
User (browser/mobile)
  │
  └─ /sanctum (Next.js UI)
       └─ WebSocket (ws://localhost:3011)
            └─ Sanctum Server (scripts/sanctum-server/server.mjs)
                 ├─ Agent Router (direct/open/whisper/roundtable modes)
                 ├─ Conversation Manager (PostgreSQL persistence)
                 └─ Cross-Talk Engine (agent summoning & inter-agent responses)
```

The Sanctum integrates with SubCult's native tool system — agents can use `web_search`, `memory_search`, `file_read`, and other tools from `src/lib/tools/registry.ts` during their responses.

## Running the Server

### Docker Compose (Production)

The Sanctum server runs as a standalone service in the Docker Compose stack:

```bash
docker-compose up sanctum
```

### Local Development

```bash
npm run sanctum
```

The server runs on port 3011 by default. Configure via environment variable:

```bash
SANCTUM_WS_PORT=3011        # Server-side port
NEXT_PUBLIC_SANCTUM_WS_PORT=3011  # Client-side port
```

## WebSocket Protocol

### Client → Server Messages

All messages follow this structure:

```typescript
{
  type: 'chat.send' | 'chat.history' | 'typing.start' | 'typing.stop' | 'presence.query',
  id: string,
  payload: { ... }
}
```

#### `chat.send` — Send a message

```json
{
  "type": "chat.send",
  "id": "unique-msg-id",
  "payload": {
    "message": "What should we do about X?",
    "userId": "user-123",
    "conversationId": "optional-uuid"
  }
}
```

#### `chat.history` — Request conversation history

```json
{
  "type": "chat.history",
  "id": "unique-msg-id",
  "payload": {
    "userId": "user-123",
    "conversationId": "optional-uuid"
  }
}
```

#### `presence.query` — Get agent presence

```json
{
  "type": "presence.query",
  "id": "unique-msg-id",
  "payload": {}
}
```

### Server → Client Events

All events follow this structure:

```typescript
{
  type: 'chat.message' | 'chat.stream' | 'typing.indicator' | 'presence.update' | 'roundtable.start' | 'roundtable.turn' | 'roundtable.end' | 'error' | 'connected',
  id?: string,
  payload: { ... }
}
```

#### `connected` — Connection established

```json
{
  "type": "connected",
  "payload": {
    "clientId": "uuid"
  }
}
```

#### `chat.message` — Single message or history

```json
{
  "type": "chat.message",
  "id": "request-id",
  "payload": {
    "conversationId": "uuid",
    "role": "agent",
    "agentId": "chora",
    "displayName": "Chora",
    "color": "#b4befe",
    "content": "Let me analyze that pattern...",
    "metadata": {},
    "crossTalk": false,
    "replyTo": null
  }
}
```

Or for history responses:

```json
{
  "type": "chat.message",
  "payload": {
    "conversationId": "uuid",
    "history": [
      { "id": "msg1", "role": "user", "content": "Hello", ... },
      { "id": "msg2", "role": "agent", "agentId": "chora", ... }
    ]
  }
}
```

#### `typing.indicator` — Agent is typing

```json
{
  "type": "typing.indicator",
  "payload": {
    "agentId": "chora",
    "displayName": "Chora",
    "color": "#b4befe",
    "typing": true
  }
}
```

#### `roundtable.start` — Roundtable begins

```json
{
  "type": "roundtable.start",
  "payload": {
    "topic": "Our strategic priorities",
    "format": "deep_dive",
    "participants": ["chora", "praxis", "thaum"]
  }
}
```

#### `roundtable.turn` — Roundtable agent speaks

```json
{
  "type": "roundtable.turn",
  "payload": {
    "sessionId": "uuid",
    "turnNumber": 3,
    "agentId": "chora",
    "displayName": "Chora",
    "color": "#b4befe",
    "role": "Analyst",
    "dialogue": "Here's what I see..."
  }
}
```

#### `roundtable.end` — Roundtable complete

```json
{
  "type": "roundtable.end",
  "payload": {
    "sessionId": "uuid",
    "topic": "Our strategic priorities",
    "turnCount": 12,
    "participants": ["chora", "praxis", "thaum"]
  }
}
```

## Usage Modes

### 1. Direct Address

Target a specific agent by mentioning them:

```
@chora what do you think about X?
chora, what's your take on Y?
```

The agent router detects the mention and routes to that agent only.

### 2. Open Mode (Multi-Agent)

Ask a question without targeting anyone:

```
What should we do about X?
How do we handle Y?
```

The router classifies the topic and selects 2-4 relevant agents based on keywords:
- **Chora** (analysis, data, patterns, diagnosis)
- **Subrosa** (risk, security, threats)
- **Thaum** (creative, innovation, alternatives)
- **Praxis** (action, execution, implementation)
- **Mux** (operations, formatting, organization)
- **Primus** (governance, values, mission)

All selected agents respond in parallel with distinct perspectives.

### 3. Whisper Mode

Private 1:1 conversation with a single agent:

```
/whisper @chora Can we talk privately?
```

Or click an agent in the sidebar to enter whisper mode. Other agents don't see these messages.

### 4. Roundtable Command

Trigger a live roundtable discussion:

```
/roundtable What are our strategic priorities?
```

The system:
1. Selects 3-5 relevant agents based on the topic
2. Queues a roundtable session
3. Orchestrates turn-by-turn dialogue
4. Streams each turn back to the client in real-time

## Agent Cross-Talk

### Summoning

Agents can bring others into the conversation:

```
Chora: "Let me bring in Subrosa for the risk angle."
→ Triggers a summon signal
→ Subrosa responds with context
```

Detected patterns:
- "bring in [agent]"
- "ask [agent]"
- "[agent], what do you think?"
- "need [agent]"

### Disagreement

When agents disagree, the mentioned agent gets pulled in:

```
Thaum: "I disagree with Praxis on this."
→ Praxis is summoned to respond
```

Detected patterns:
- "disagree with [agent]"
- "[agent] is wrong"
- "counter to what [agent]"

### Spontaneous Cross-Talk

After multiple agents respond to an open question, there's a probability-based chance they'll react to each other's responses. The probability is higher when:
- Affinity is low (tension → disagreement)
- Affinity is very high (synergy → building on ideas)

Capped at 1-2 follow-up exchanges to avoid runaway conversations.

## Database Schema

### `ops_sanctum_conversations`

Tracks user conversation sessions.

```sql
CREATE TABLE ops_sanctum_conversations (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    mode TEXT NOT NULL,           -- 'open' | 'direct' | 'whisper'
    target_agent TEXT,             -- agent ID for whisper mode
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `ops_sanctum_messages`

Individual messages within conversations.

```sql
CREATE TABLE ops_sanctum_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES ops_sanctum_conversations(id),
    role TEXT NOT NULL,            -- 'user' | 'agent'
    agent_id TEXT,                 -- null for user messages
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Metadata fields:
- `crossTalk: boolean` — agent responding to another agent
- `replyTo: string` — target agent ID for cross-talk
- `roundtable: boolean` — message is part of a roundtable
- `sessionId: string` — roundtable session ID
- `turnNumber: number` — roundtable turn number

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `@agent` | Direct address to specific agent | `@chora analyze this` |
| `/whisper @agent` | Private conversation | `/whisper @subrosa are we safe?` |
| `/roundtable` | Start live roundtable | `/roundtable What are our priorities?` |
| `/reset` | Clear conversation history | `/reset` |
| `/help` | Show command help | `/help` |

## UI Components

### Page (`src/app/sanctum/page.tsx`)

Main container orchestrating the layout and WebSocket connection via `useSanctumSocket` hook.

### Hook (`src/app/sanctum/hooks/useSanctumSocket.ts`)

Manages WebSocket connection, message state, typing indicators, and whisper mode. Auto-reconnects with exponential backoff.

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `SanctumHeader` | `SanctumHeader.tsx` | Top bar with connection status, whisper indicator |
| `AgentSidebar` | `AgentSidebar.tsx` | Agent list with presence dots, typing indicators |
| `MessageFeed` | `MessageFeed.tsx` | Scrollable message feed with grouping logic |
| `AgentMessage` | `AgentMessage.tsx` | Individual message bubble (user/agent/system) |
| `MultiAgentResponse` | `MultiAgentResponse.tsx` | Grouped consecutive agent responses |
| `RoundtableBlock` | `RoundtableBlock.tsx` | Roundtable session rendering |
| `MessageInput` | `MessageInput.tsx` | Input field with @mention and /command autocomplete |
| `TypingIndicator` | `TypingIndicator.tsx` | Animated dots for typing agents |

## Deployment

### Environment Variables

```bash
# Server
SANCTUM_WS_PORT=3011                    # WebSocket server port
DATABASE_URL=postgresql://...           # PostgreSQL connection
OPENROUTER_API_KEY=sk-...              # LLM API key

# Client (Next.js)
NEXT_PUBLIC_SANCTUM_WS_PORT=3011       # WebSocket client port
```

### Docker Compose

The `sanctum` service is defined in `docker-compose.yml`:

```yaml
sanctum:
  build: .
  container_name: subcult-sanctum
  restart: unless-stopped
  command: ['node', '--import=tsx', 'scripts/sanctum-server/server.mjs']
  depends_on:
    postgres:
      condition: service_healthy
  env_file:
    - .env.local
  ports:
    - '127.0.0.1:3011:3011'
  networks:
    - internal
```

### Standalone Deployment

For systemd-based deployment:

```bash
# 1. Install dependencies
npm install

# 2. Build Next.js app (if running web UI too)
npm run build

# 3. Run Sanctum server
npm run sanctum
```

## Monitoring

### Logs

```bash
# Docker Compose
docker-compose logs -f sanctum

# Standalone
npm run sanctum 2>&1 | tee sanctum.log
```

Structured JSON logs include:
- `module: 'sanctum-ws'` for WebSocket server events
- `module: 'sanctum-router'` for routing decisions
- `module: 'sanctum-conversation'` for persistence operations

### Metrics

Key metrics tracked in logs:
- Client connections/disconnections
- Message routing decisions (direct/open/whisper/roundtable)
- Agent response times (`responseTimeMs`)
- LLM token usage (via `ops_llm_usage` table)
- Cross-talk trigger probability
- Typing indicator lifecycle

## Development

### Running Locally

```bash
# Terminal 1: Start Next.js app
npm run dev

# Terminal 2: Start Sanctum server
npm run sanctum

# Terminal 3: Start PostgreSQL (if not using Docker)
docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16
```

### Testing

```bash
# Test WebSocket connection
wscat -c ws://localhost:3011

# Send a message
{"type":"chat.send","id":"test1","payload":{"message":"Hello agents","userId":"test"}}

# Request history
{"type":"chat.history","id":"test2","payload":{"userId":"test"}}
```

### Debugging

Enable debug logs:

```bash
LOG_LEVEL=debug npm run sanctum
```

## Troubleshooting

### WebSocket connection fails

- Check `SANCTUM_WS_PORT` matches on both server and client
- Verify firewall rules allow port 3011
- Check server logs: `docker-compose logs sanctum`

### Agents not responding

- Verify `OPENROUTER_API_KEY` is set
- Check database connectivity
- Inspect agent router logs for classification decisions

### Messages not persisting

- Run database migrations: `make db-migrate`
- Verify `ops_sanctum_conversations` and `ops_sanctum_messages` tables exist
- Check conversation manager logs

### Roundtable fails to start

- Ensure roundtable system is set up (see `src/lib/roundtable/`)
- Verify agent personality files exist in `workspace/agents/*/`
- Check for roundtable session in `ops_roundtable_sessions` table

## Related Files

### Core Implementation

- `src/lib/sanctum/ws-server.ts` — WebSocket server
- `src/lib/sanctum/agent-router.ts` — Message routing & response generation
- `src/lib/sanctum/conversation-manager.ts` — PostgreSQL persistence
- `src/lib/sanctum/cross-talk.ts` — Summoning & inter-agent responses
- `scripts/sanctum-server/server.mjs` — Server entry point

### UI

- `src/app/sanctum/page.tsx` — Main page
- `src/app/sanctum/hooks/useSanctumSocket.ts` — WebSocket hook
- `src/app/sanctum/components/*.tsx` — UI components
- `src/app/sanctum/lib/agents-client.ts` — Client-safe agent data

### Database

- `db/migrations/028_ops_sanctum.sql` — Table definitions

## Future Enhancements

- [ ] Voice input/output (TTS integration)
- [ ] Message reactions (emoji, upvote/downvote)
- [ ] Conversation forking (branch discussions)
- [ ] Agent mood/energy levels (dynamic personality)
- [ ] Message search (full-text + semantic)
- [ ] Export conversations (markdown, JSON)
- [ ] Multi-user rooms (shared Sanctum sessions)
- [ ] Agent autonomy (agents can initiate conversations)
