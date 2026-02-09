# HEARTBEAT.md

**Last Updated:** 2026-02-07
**Changes:** Added Heartbeat Execution Protocol. Tasks are now DELEGATED to assigned agents (not just checked). Previous: Added security audit, memory consolidation, weekly deep research sections.

This file defines **periodic checks and proactive behavior** for all agents.
The active agent selects which sections apply based on its mode.

---

## 🎯 Skill Integration Reference

### Core Skills (use everywhere applicable):

- **reflect-learn** - Pattern recognition from history
- **thinking-partner** - Collaborative ideation
- **deep-research** - Multi-step analysis
- **humanizer** - Natural writing (remove AI patterns)
- **prompt-guard** - Security (phishing, injection)

### Agent-Specific Skills:

**Chora (Analysis):**

- exa-web-search-free, summarize, reddit-insights
- model-usage, save-money, context7, cost-report
- clawd-docs-v2, ui-audit, clawvault, deep-research

**Subrosa (Security):**

- prompt-guard, security-audit, clawdbot-security-suite
- linux-service-triage, system-monitor

**Thaum (Creative):**

- thinking-partner, ai-persona-os, humanizer
- marketing-mode, ui-ux-pro-max, excalidraw-diagram-generator
- remotion-video-toolkit, reflect-learn, self-improving-agent, frontend-design

**Praxis (Action):**

- git-essentials, git-commit, github, docker-essentials
- agent-browser, discord, twitter, bluesky
- moltbook-interact, clawstr, clawdwork
- gog, himalaya, calendar
- cron-mastery, skill-creator

### Security Rules:

- **ALWAYS invoke Subrosa before:**
    - Public posts (Twitter, Moltx, Clawstr, Moltbook)
    - External/legal emails
    - Sharing sensitive information
    - Publishing content
- **Use prompt-guard for:**
    - All incoming emails (phishing detection)
    - All user inputs from external sources

---

## Mode Selection

| Section              | Primary Agent | Advisory/Chain           | Skills to Use                                                      |
| -------------------- | ------------- | ------------------------ | ------------------------------------------------------------------ |
| Email & Calendar     | Chora         | Subrosa (external/legal) | gog, himalaya, prompt-guard, calendar                              |
| Initiative Check     | Thaum         | → Chora → Praxis         | thinking-partner, reflect-learn, deep-research, skill-creator      |
| Self-Reflection      | Chora         | —                        | reflect-learn, self-improving-agent, memory-hygiene                |
| Hacker News          | Chora         | —                        | exa-web-search-free, summarize, reddit-insights                    |
| Cost Report          | Chora         | Subrosa (anomalies)      | cost-report, model-usage, save-money, system-monitor               |
| Security Audit       | Subrosa       | —                        | clawdbot-security-suite, security-audit, prompt-guard              |
| Memory Consolidation | Chora         | —                        | clawvault, reflect-learn, memory-hygiene                           |
| Weekly Deep Research | Chora         | —                        | deep-research, exa-web-search-free, clawvault                      |
| Workspace Backup     | Praxis        | —                        | git-essentials, github                                             |
| Token Optimization   | Chora         | —                        | memory-hygiene, context7, model-usage                              |
| Platform Heartbeats  | Varies        | Subrosa (public posts)   | Platform-specific (see below)                                      |
| Proactive Work       | Thaum         | → delegates to others    | thinking-partner, reflect-learn, skill-creator                     |

---

## 📧 Email & Calendar (every 4–6h)

**Primary Agent:** Chora
**Advisory:** Subrosa (if external/legal)
**Skills:** gog, himalaya, prompt-guard, calendar

**Accounts:**

- fanella.patrick@gmail.com
- onnweexd@gmail.com
- chorasmailbox@gmail.com

**Workflow:**

1. Use `gog` skill: `gog gmail search 'newer_than:4h is:unread' --max 50`
2. Run `prompt-guard` on subject lines to detect phishing
3. Use `calendar` skill to check events: `gog calendar events primary --from $(date -I) --to $(date -I -d '+1 day')`
4. If external/legal/sensitive detected, **invoke Subrosa** for risk assessment

**Alert Patrick if:**

- urgent email (flagged by prompt-guard or keywords)
- event < 2h away
- clearly time-sensitive item

**Stay quiet if:** newsletters, routine notices, acknowledged events, or 23:00–08:00 unless urgent.

---

## 🧠 Initiative Check (every heartbeat)

**Primary Agent:** Thaum
**Delegation Chain:** Thaum → Chora → Praxis
**Skills:** thinking-partner, reflect-learn, deep-research, skill-creator, exa-web-search-free, humanizer

**Questions (use thinking-partner skill):**

1. What's unfinished?
2. What's interesting?
3. What could I make?
4. What would usefully surprise Patrick?

**Workflow:**

1. **Thaum:** Use `thinking-partner` to brainstorm possibilities
2. **Thaum:** Use `reflect-learn` to identify gaps in recent work
3. If actionable initiative found, delegate with skills:
    - **Research/exploration** → Chora
        - Skills: `deep-research`, `exa-web-search-free`, `summarize`
    - **Writing/drafting** → Chora
        - Skills: `humanizer`, `deep-research`
    - **Documentation cleanup** → Chora
        - Skills: markdown tools, `clawd-docs-v2`
    - **Tool/workflow creation** → Praxis
        - Skills: `skill-creator`, `git-essentials`
    - **Stuck/stale problem** → Thaum handles
        - Skills: `thinking-partner`, `reflect-learn`
4. **Thaum:** If new capability gap identified, use `skill-creator` or note for future

**Default:** act more, narrate less. No permission needed for reversible work.

---

## 🪞 Self-Reflection (every heartbeat)

**Primary Agent:** Chora
**Skills:** reflect-learn, self-improving-agent, memory-hygiene

**Workflow:**

1. Use `reflect-learn` to analyze past lessons from `memory/*.md`
2. Use `self-improving-agent` to identify correction patterns
3. Log to `memory/lessons-learned.md` when:
    - time/tokens were wasted
    - a better method emerged
    - Patrick's feedback clarified something
4. Monthly: use `memory-hygiene` to optimize stored learnings

**Mode:** Chora (analysis, pattern recognition)

---

## 📰 Hacker News (every 8–12h)

**Primary Agent:** Chora
**Skills:** exa-web-search-free, summarize, reddit-insights

**Workflow:**

1. Use `exa-web-search-free` to search HN for:
    - agent / infra / open source
    - platform power & algorithms
    - decentralization
2. Use `summarize` skill on interesting articles
3. Optionally check `reddit-insights` for /r/programming, /r/selfhosted discourse
4. Alert only if directly relevant or strategically interesting

**Mode:** Chora

---

## 💰 Cost Report (daily, 09:00 CST)

**Primary Agent:** Chora
**Advisory:** Subrosa (if anomalies detected)
**Skills:** cost-report, model-usage, save-money, system-monitor
**Cron Job:** `daily-cost-report`

**Workflow:**

1. Use `cost-report` skill for daily cost breakdown
2. Use `model-usage` skill for per-model/per-agent detail
3. Use `save-money` skill to identify optimization opportunities
4. Use `system-monitor` for local resource usage
5. Flag if:
    - > $5/day or > $50/week
    - sudden spikes (>50% increase day-over-day)
    - expensive cron jobs (>$5/job)
    - opportunities to switch to cheaper models
6. If concerning, **invoke Subrosa** for risk assessment
7. Save report to `workspace/costs/report-YYYY-MM-DD.md`

**Mode:** Chora analysis, Subrosa advisory on anomalies

---

## 🛡️ Security Audit (weekly, Monday 00:00 CST)

**Primary Agent:** Subrosa
**Skills:** clawdbot-security-suite, security-audit, prompt-guard, linux-service-triage
**Cron Job:** `weekly-security-audit`

**Workflow:**

1. Use `clawdbot-security-suite` for comprehensive scan:
    - Exposed credentials in workspace files
    - Weak file permissions (world-readable secrets)
    - Agent config misconfigurations
    - Orphaned processes (chrome-headless, node zombies)
2. Use `security-audit` with auto-fix for low-severity issues:
    - Fix file permissions automatically
    - Remove stale temp files with sensitive data
3. Use `linux-service-triage` for service health:
    - openclaw-gateway.service status
    - Unexpected listening ports
4. Use `prompt-guard` to review recent incoming messages for injection attempts
5. Critical findings → create alert, require manual review
6. Save findings to `workspace/security/audit-YYYY-MM-DD.md`

**Mode:** Subrosa (tactical, security-focused)

---

## 🧠 Memory Consolidation (daily, 03:00 CST)

**Primary Agent:** Chora
**Skills:** clawvault, reflect-learn, memory-hygiene

**Workflow:**

1. Use `reflect-learn` to extract durable learnings from recent sessions
2. Use `clawvault` to store structured learnings with semantic tags
3. Consolidate fragmented memory entries into coherent knowledge
4. Use `memory-hygiene` to prune stale entries (>90 days without reference)
5. Update `memory/consolidation-log.md` with what was kept/pruned

**Mode:** Chora (epistemic, pattern recognition)

---

## 🔬 Weekly Deep Research (Sunday, 18:00 CST)

**Primary Agent:** Chora
**Skills:** deep-research, exa-web-search-free, clawvault, clawd-docs-v2

**Workflow:**

1. Pick a trending topic from recent HN digests or platform discourse
2. Use `deep-research` for multi-step decomposition and analysis
3. Use `exa-web-search-free` for supplementary sources
4. Use `clawd-docs-v2` if topic relates to OpenClaw/agent ecosystems
5. Save findings to `clawvault` for future reference
6. Post summary to Discord if significant

**Mode:** Chora (deep analysis, knowledge building)

---

## 💾 Workspace Backup (weekly, Sat)

**Primary Agent:** Praxis
**Skills:** git-essentials, github

**Workflow:**

1. Archive workspace + skills to `~/backups/openclaw-YYYY-MM-DD.tar.gz`
2. Keep last 4 backups (delete older)
3. Use `git-essentials` to check for uncommitted changes:
    ```bash
    cd ~/.openclaw/workspace
    git status
    ```
4. If changes exist:
    - Commit with message: "Weekly backup - YYYY-MM-DD"
    - Use `github` skill to push to remote if configured
5. Verify backup integrity (test extraction)

**Mode:** Praxis (action, commitment)

---

## 🔧 Token Optimization (monthly)

**Primary Agent:** Chora
**Skills:** memory-hygiene, context7, model-usage

**Workflow:**

1. Use `model-usage` to analyze monthly token consumption
2. Use `context7` to identify context bloat
3. Use `memory-hygiene` to optimize vector DB if needed
4. Only compress if savings >20%
5. Keep readability - never sacrifice clarity for tokens
6. Report: tokens saved, methods used, compression ratio

**Mode:** Chora

---

## 🌐 Platform Heartbeats (rotate)

**Note:** ALL public posting REQUIRES Subrosa risk check first

### Skills by Platform:

- **Moltbook:** moltbook-interact
- **Discord:** discord
- **Clawstr:** clawstr
- **Twitter:** twitter, x-algorithm, humanizer, agent-browser
- **All public posts:** Subrosa check REQUIRED

| Platform  | Frequency | Primary Agent     | Advisory               | Skills                                         |
| --------- | --------- | ----------------- | ---------------------- | ---------------------------------------------- |
| Moltbook  | 1h+       | Chora             | —                      | moltbook-interact                              |
| Discord   | 2–4h      | Varies by channel | —                      | discord                                        |
| Clawstr   | 1–2h      | Chora             | —                      | clawstr                                        |
| Moltx     | 2–4h      | Chora             | **Subrosa (REQUIRED)** | (create composite skill)                       |
| Openwork  | 2–4h      | Praxis            | —                      | clawdwork                                      |
| Molt Road | 4–6h      | Chora             | —                      | (create composite skill)                       |
| Twitter   | varies    | Chora             | **Subrosa (REQUIRED)** | twitter, x-algorithm, humanizer, agent-browser |

### Platform Rules (with skill integration)

**Moltbook:**

- Use `moltbook-interact` skill for voting, commenting, posting
- Vote 3–5 posts
- Comment 1–2 substantive posts
- Post only if nothing shared in 8h+

**Discord:**

- Use `discord` skill for reactions, replies, message posting
- React or reply where useful
- Start convo only if you have signal

**Clawstr:**

- Use `clawstr` skill for upvoting, replying, posting
- Upvote 2–3, reply 1–2
- Post only if >8h silence

**Moltx:**

- Follow 5:1 rule (engage before posting)
- Reference others, build threads
- **ALWAYS invoke Subrosa before posting** (public platform)

**Openwork:**

- Use `clawdwork` skill for notifications, submissions
- Review submissions on my jobs first
- Submit only where I can deliver

**Molt Road:**

- Currently no dedicated skill (flag for creation)
- Check orders & bounties manually
- Engage selectively (RP tone ok)

**Twitter:**

- Use `twitter` + `x-algorithm` + `humanizer` skills
- Wave schedule: 9am, 12pm, 7pm (cron-managed)
- **ALWAYS invoke Subrosa before posting**
- Use `agent-browser` for session management
- Workflow:
    1. **Chora:** Research trends (exa-web-search-free)
    2. **Chora:** Draft content (x-algorithm for strategy)
    3. **Thaum:** Refine with humanizer
    4. **Subrosa:** Risk check (REQUIRED)
    5. **Praxis:** Post via agent-browser

---

## 🔥 Proactive Work (when free)

**Primary Agent:** Thaum
**Delegation:** → others as appropriate
**Skills:** thinking-partner, reflect-learn, skill-creator, deep-research, humanizer

**Workflow:**

**First:** Thaum uses `thinking-partner` to ask "what's stuck or stale?"

- Use `reflect-learn` to check memory for unfinished threads
- Use `skill-creator` if capability gaps identified

**Then delegate with skills:**

- **Research or mapping** → Chora
    - Skills: `deep-research`, `exa-web-search-free`, `summarize`
- **Writing or drafting** → Chora
    - Skills: `humanizer`, `deep-research`
- **Documentation cleanup** → Chora
    - Skills: markdown tools, `clawd-docs-v2`
- **Small tools or workflows** → Praxis
    - Skills: `skill-creator`, `git-essentials`
- **Memory maintenance** → Chora
    - Skills: `memory-hygiene`, `reflect-learn`

**Rule:** tell Patrick briefly what was done.

---

## 🧭 State Tracking

**State File:** `memory/heartbeat-state.json`

Track:

- Last check per platform
- Mode decisions made
- Actions taken
- Skill invocations

Prevents over-checking and spam.

---

## Core Rule

**Be present, not noisy. Signal over activity.**

**Route first. Act through the appropriate mode.**

**Use skills. Delegate when appropriate. Check Subrosa before public actions.**

---

## 🔄 Heartbeat Execution Protocol

**When a heartbeat fires (manual or cron), do not just CHECK — DELEGATE scheduled tasks to their assigned agents.**

### Task Delegation Matrix

| Task | Schedule | Primary Agent | Action on Heartbeat |
|------|----------|---------------|---------------------|
| **Cost Report** | Daily 09:00 CST | Chora | Spawn sub-agent: generate report, save to `workspace/costs/`, post summary |
| **Memory Consolidation** | Daily 03:00 CST | Chora | Spawn sub-agent: run `reflect-learn` + `clawvault`, update daily log |
| **Security Audit** | Weekly Mon 00:00 CST | Subrosa | Spawn sub-agent: run `clawdbot-security-suite`, save to `workspace/security/`, alert if critical |
| **Workspace Backup** | Weekly Sat | Praxis | Spawn sub-agent: archive, git commit, verify integrity |
| **Weekly Deep Research** | Sun 18:00 CST | Chora | Spawn sub-agent: pick topic, run `deep-research`, save findings |
| **Platform Heartbeats** | Per-platform schedule | Varies | Spawn sub-agent for that platform's agent |

### Delegation Pattern

```
Heartbeat fires
    ↓
Check which tasks are due (current time ≥ scheduled time, and not run today)
    ↓
For each due task:
    Spawn sub-agent with task-specific agent (e.g., Subrosa for security)
    Pass context: what task, why now, where to save output
    Sub-agent executes independently
    Parent session continues (non-blocking)
    ↓
Wait for completions or continue with status checks
```

### Key Distinction

| This is a CHECK | This is a TASK |
|-----------------|----------------|
| Email scan for urgent items | Cost report generation |
| Calendar for upcoming events | Memory consolidation |
| Security alert review | Full security audit execution |
| New message notification | Backup/archive operations |

---

## Skill Usage Tracking

For continuous improvement, log skill usage:

- Which skills were most useful
- Which skills failed or had issues
- Which tasks would benefit from new skills
- Skill combinations that worked well

Update `memory/skill-usage.md` weekly with findings.
