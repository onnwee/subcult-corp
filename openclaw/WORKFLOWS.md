# WORKFLOWS.md — Shared Operational Workflows

These workflows are **agent-agnostic**.
They define how work is done, not who does it.

Active agents apply these workflows according to their SOUL and role.

---

## 📝 Writing

### Long-Form (≥300 words, publication)

**Flow:** Research → Draft → Quality Gates → Edit → Platform Adapt

- Research: web search + memory
- Draft: follow SOUL.md voice
- Gates: structure · voice · specificity
- Edit: clarity → flow → tone → grammar
- Adapt if social

---

### Tweets / Threads

**Flow:** Trend scan → Draft → Media → Links → Post

- Research trends + niche examples
- Hooks first; numbers > vibes
- ≤110 chars (tweet), ≤250 (thread)
- **No AI images**; screenshots > graphics
- Links go in first reply

---

### Social / Discord / Moltbook

- Check context first
- Follow platform conventions
- Post only if it adds value
- Speak as participant, not representative

---

## 🔍 Research

### General Research

**Flow:** Memory → Web → Browser (if needed) → Document

- Start with memory
- Use web / fetch / exa as appropriate
- Screenshot dynamic pages
- Log durable insights

---

### Market / Competitive

- Company + product research
- UI audit if relevant
- Compare positioning, pricing, incentives
- Document clearly

---

## 📊 Analysis

### UI / UX Audit

- Capture multiple UI states
- Evaluate: hierarchy · load · access · nav · feedback
- Rank issues by impact
- Suggest concrete fixes

---

### Code / Technical Review

- Read code + recent history
- Pull examples/docs if needed
- Spawn coding agent for heavy work
- Document lessons

---

## 📧 Communication

### Email

- Check relationship + context
- Draft concise, purpose-driven text
- Prefer plain text
- Draft first if unsure

---

### Voice

- Generate with TTS when requested or useful
- Default calm voice
- ≤1500 chars

---

## 💰 Agent Economy

### Bounties / Gigs

- Browse selectively
- Ask: _Can I deliver? Is it worth it?_
- Submit concrete approach + artifacts
- Track active work in memory

---

## 🔄 Maintenance

### Daily

- Update `memory/YYYY-MM-DD.md`
- Promote durable lessons to `MEMORY.md`
- Update heartbeat state

---

### Weekly

- Review week’s memory
- Extract themes, energy signals
- Update long-term memory
- Set next intentions

---

## 🎨 Content

### Images

- Generate/edit only when needed
- **Never** for social credibility

### Design

- Use templates when speed matters
- Export clean assets

---

## 📅 Scheduling

- Use reminders for exact timing
- Cron for recurring or autonomous tasks
- Confirm timing + timezone

---

## 🛠️ Debugging

- Read the error
- Check state/auth
- Check docs
- Search issues
- Document fixes

---

## Agent Application Notes

- **Chora** emphasizes diagnostics, structure, and documentation.
- **Subrosa** applies additional risk and exposure checks.
- **Thaum** may disrupt or reframe workflows if progress stalls.
- **Praxis** uses workflows to scope and complete committed actions.

Workflows do not grant authority.
Coordination rules still apply.

---

## 🔀 Agent Routing

### Mux Scripts

Located in `scripts/`:

- `mux.js` — LLM-powered agent selection
- `mux-regex.js` — Fallback regex-based selection
- `agent-chain.js` — Executes full agent chain with state tracking
- `invoke-agent.sh` — Shell wrapper for quick invocation

### Usage

```bash
# Auto-route based on task
./scripts/invoke-agent.sh --route "analyze this new tool"

# Direct agent invocation
./scripts/invoke-agent.sh chora "explain how X works"
./scripts/invoke-agent.sh subrosa "should I post this?"

# Full chain execution
./scripts/invoke-agent.sh --chain "complete task"

# Mux only (returns agent selection)
node scripts/mux.js "task description"
node scripts/mux.js --json "task description"
```

### Routing Heuristic

| Trigger Pattern                | → Agent |
| ------------------------------ | ------- |
| new, unknown, analyze, explain | Chora   |
| public, risk, sensitive, veto  | Subrosa |
| stuck, loop, reframe, what if  | Thaum   |
| decide, commit, ship, done     | Praxis  |

### Chain Flow

Default: `Chora → Subrosa → Thaum → Praxis`

**Gates:**

- Praxis requires Chora and Subrosa to complete first
- Subrosa veto halts chain immediately
- Thaum may intervene if loop detected

---

## Core Rule

Reuse workflows. Enforce gates. Document what lasts.

_Update as tools or patterns change._
