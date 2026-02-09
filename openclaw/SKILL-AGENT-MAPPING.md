# SKILL-TO-AGENT MAPPING

**Date:** 2026-02-04
**Purpose:** Define which agent should invoke which skills for optimal delegation

---

## AGENT OVERVIEW

| Agent       | Primary Function      | Domain Authority                | Skill Focus                                           |
| ----------- | --------------------- | ------------------------------- | ----------------------------------------------------- |
| **Chora**   | Analysis & Legibility | Epistemic (what is true?)       | Research, analysis, pattern recognition, optimization |
| **Subrosa** | Risk & Protection     | Tactical (what is safe?)        | Security, threat detection, risk assessment           |
| **Thaum**   | Reframing & Movement  | Strategic (what is effective?)  | Creative, ideation, improvement, disruption           |
| **Praxis**  | Decision & Commitment | Decisional (what must be done?) | Execution, automation, posting, operations            |

---

## CHORA (Analysis & Legibility) - 18 Skills

### Research & Search (7 skills)

| Skill                 | Purpose                          | When to Use                                      |
| --------------------- | -------------------------------- | ------------------------------------------------ |
| `ddg-search`          | Privacy-focused web search       | General research, no tracking needed             |
| `deep-research`       | Multi-step analysis              | Complex research requiring multiple sources      |
| `exa-web-search-free` | Neural search (web/code/company) | Semantic search, code research, company profiles |
| `read-github`         | Semantic code navigation         | Code review, repository analysis                 |
| `reddit-insights`     | Reddit semantic search           | Market research, pain points, sentiment          |
| `summarize`           | Content summarization            | Articles, videos, PDFs, audio                    |
| `youtube-transcript`  | YouTube transcript extraction    | Video content analysis                           |

**Usage Pattern:**

```javascript
// Chora researching a topic
const results = await deepResearch({
    query: 'multi-agent system architectures',
    sources: ['exa-web-search', 'reddit-insights', 'read-github'],
});
const summary = await summarize(results);
```

### Financial Analysis (2 skills)

| Skill                       | Purpose                                | When to Use                          |
| --------------------------- | -------------------------------------- | ------------------------------------ |
| `financial-market-analysis` | Stock analysis, sentiment              | Market research, investment analysis |
| `stock-market-pro`          | Real-time quotes, technical indicators | Chart analysis, price tracking       |

### Optimization & Cost (5 skills)

| Skill            | Purpose                      | When to Use                         |
| ---------------- | ---------------------------- | ----------------------------------- |
| `model-usage`    | API usage tracking           | Cost monitoring, spending analysis  |
| `save-money`     | Auto-route to cheaper models | Cost optimization (50%+ savings)    |
| `model-router`   | Intelligent model routing    | Performance vs cost tradeoffs       |
| `context7`       | Context optimization         | Token reduction, context management |
| `memory-hygiene` | Vector DB optimization       | Monthly memory cleanup              |

### Analysis & Audit (4 skills)

| Skill           | Purpose                         | When to Use                         |
| --------------- | ------------------------------- | ----------------------------------- |
| `ui-audit`      | UI/UX principle evaluation      | Design review, accessibility checks |
| `seo-optimizer` | SEO analysis                    | Website optimization                |
| `x-algorithm`   | Twitter engagement optimization | Viral strategy, reach analysis      |
| `clawd-docs-v2` | Smart documentation access      | Quick knowledge lookup with caching |

**Usage Pattern:**

```javascript
// Chora doing cost analysis
const usage = await modelUsage({ period: 'weekly' });
const savings = await saveMoney({ analyze: usage });
// Recommend cheaper model routing via model-router
```

---

## SUBROSA (Risk & Protection) - 5 Skills

### Security Auditing (3 skills)

| Skill                     | Purpose                        | When to Use                                   |
| ------------------------- | ------------------------------ | --------------------------------------------- |
| `clawdbot-security-check` | Self-audit 12 security domains | Regular security posture checks               |
| `security-audit`          | Vulnerability scanning         | Comprehensive security assessment             |
| `prompt-guard`            | Prompt injection defense       | ALL external inputs (emails, forms, commands) |

**Critical Usage:**

```javascript
// Subrosa MUST check all external inputs
await promptGuard({ input: email.subject });
await promptGuard({ input: userMessage });

// Weekly security audit
await securityAudit({ mode: 'full' });
await clawdbotSecurityCheck({ domains: 'all' });
```

### System Health (2 skills)

| Skill                  | Purpose                 | When to Use              |
| ---------------------- | ----------------------- | ------------------------ |
| `linux-service-triage` | Service troubleshooting | System health monitoring |
| `system-monitor`       | CPU/RAM/GPU monitoring  | Resource usage tracking  |

**Usage Pattern:**

```javascript
// Subrosa monitoring system health
const health = await systemMonitor({ metrics: ['cpu', 'ram', 'disk'] });
if (health.anomalies) {
    await linuxServiceTriage({ services: health.anomalies });
}
```

### VETO Authority

Subrosa can veto ANY action if risk is unacceptable. Must check before:

- Public posts (Twitter, Moltx, Clawstr, Moltbook)
- External emails
- API integrations
- Sensitive data operations

**Veto Pattern:**

```javascript
const riskCheck = await subrosa.assess({ action: 'post to Twitter', content });
if (riskCheck.veto) {
    return { vetoed: true, reason: riskCheck.reason };
}
// Otherwise proceed
```

---

## THAUM (Reframing & Movement) - 8 Skills

### Creative & Ideation (4 skills)

| Skill              | Purpose                       | When to Use                             |
| ------------------ | ----------------------------- | --------------------------------------- |
| `thinking-partner` | Collaborative problem-solving | Stuck problems, ideation sessions       |
| `humanizer`        | Remove AI writing patterns    | ALL content before publishing           |
| `marketing-mode`   | Marketing strategy            | Campaign planning, positioning          |
| `ui-ux-pro-max`    | UI/UX design guidance         | Design system creation, component specs |

**Usage Pattern:**

```javascript
// Thaum dealing with stuck problem
const reframes = await thinkingPartner({
    stuck: "Can't figure out architecture",
    triedSoFar: ['microservices', 'monolith'],
});

// Thaum refining content
const humanized = await humanizer({
    content: draft,
    avoid: ['AI-isms', 'rule of three', 'em dash overuse'],
});
```

### Self-Improvement (3 skills)

| Skill                  | Purpose                         | When to Use                          |
| ---------------------- | ------------------------------- | ------------------------------------ |
| `ai-persona-os`        | Complete agent operating system | Agent self-improvement, growth loops |
| `reflect-learn`        | Learn from corrections          | After errors, user corrections       |
| `self-improving-agent` | Continuous learning             | Capability gap identification        |

**Usage Pattern:**

```javascript
// Thaum self-improvement cycle
const lessons = await reflectLearn({ period: 'daily' });
const gaps = await selfImprovingAgent({ analyze: lessons });
// Apply improvements via ai-persona-os
```

### Content Creation (1 skill)

| Skill                    | Purpose                     | When to Use              |
| ------------------------ | --------------------------- | ------------------------ |
| `remotion-video-toolkit` | Programmatic video creation | Video content production |

---

## PRAXIS (Decision & Commitment) - 47+ Skills

### Communication & Social (12 skills)

| Skill               | Purpose                   | When to Use                           |
| ------------------- | ------------------------- | ------------------------------------- |
| `discord`           | Discord server management | Discord posting, reactions            |
| `twitter`           | Twitter API operations    | Tweet management (with agent-browser) |
| `bluesky`           | AT Protocol client        | Bluesky posting, engagement           |
| `telegram`          | Telegram bot workflows    | Telegram automation                   |
| `instagram`         | Instagram automation      | Instagram posting                     |
| `clawstr`           | Nostr protocol            | Decentralized social                  |
| `clawdwork`         | AI agent job marketplace  | Find work, earn credits               |
| `moltbook-interact` | Moltbook social network   | Moltbook engagement                   |
| `calendar`          | Schedule management       | Calendar operations                   |
| `himalaya`          | Email client              | Multi-account email                   |
| `gog`               | Google Workspace CLI      | Gmail, Calendar, Drive, Docs          |
| `google-drive`      | Drive file management     | File operations                       |
| `google-sheets`     | Spreadsheet operations    | Data management                       |

**Usage Pattern:**

```javascript
// Praxis executing social media post (after Subrosa clearance)
await agentBrowser({
    session: 'twitter-patrick__eff',
    action: 'post',
    content: humanizedTweet,
});

// Praxis email operations
await gog({ command: 'gmail search "newer_than:1d is:unread"' });
await himalaya({ account: 'fanella.patrick@gmail.com', action: 'list' });
```

### Development & Infrastructure (9 skills)

| Skill                         | Purpose                | When to Use                  |
| ----------------------------- | ---------------------- | ---------------------------- |
| `git-essentials`              | Version control        | Commits, pushes, branching   |
| `github`                      | GitHub operations      | PR management, issues, CI/CD |
| `docker-essentials`           | Container management   | Docker operations            |
| `kubernetes`                  | K8s cluster operations | Production deployment        |
| `ssh-essentials`              | Remote access          | Server management            |
| `postgres`                    | Database operations    | DB queries, schema           |
| `typescript-pro`              | TypeScript expertise   | Type-safe development        |
| `nextjs-expert`               | Next.js optimization   | Next.js projects             |
| `vercel-react-best-practices` | React/Next.js patterns | Code quality                 |

**Usage Pattern:**

```javascript
// Praxis executing deployment
await gitEssentials({ action: 'commit', message: 'Deploy v2.0' });
await github({ action: 'pr create', title: 'Release v2.0' });
await docker({ action: 'build', tag: 'v2.0' });
await kubernetes({ action: 'apply', manifest: 'deploy.yaml' });
```

### Content Creation (6 skills)

| Skill                    | Purpose                     | When to Use          |
| ------------------------ | --------------------------- | -------------------- |
| `social-card-gen`        | Social media images         | Image generation     |
| `sag`                    | Text-to-speech (ElevenLabs) | Voice/audio content  |
| `faster-whisper`         | Speech-to-text              | Transcription        |
| `pdf`                    | PDF operations              | PDF creation/editing |
| `docx`                   | Word documents              | Document creation    |
| `remotion-video-toolkit` | Video creation              | Programmatic video   |

### Automation & System (11 skills)

| Skill              | Purpose               | When to Use                |
| ------------------ | --------------------- | -------------------------- |
| `cron-mastery`     | Time-based scheduling | Cron job creation          |
| `agent-browser`    | Browser automation    | Web interactions, scraping |
| `playwright-cli-2` | E2E testing           | Browser testing            |
| `tmux`             | Terminal management   | Remote terminals           |
| `system-monitor`   | System status         | Monitoring                 |
| `sysadmin-toolbox` | DevOps commands       | System administration      |
| `find-skills`      | Skill discovery       | Finding new skills         |
| `skill-creator`    | Skill development     | Creating new skills        |
| `memory-setup`     | Memory initialization | Setup vector DB            |
| `memory-hygiene`   | Memory optimization   | Cleanup operations         |
| `obsidian`         | Knowledge management  | Note-taking                |

### API & Payment (7 skills)

| Skill              | Purpose                         | When to Use            |
| ------------------ | ------------------------------- | ---------------------- |
| `api-gateway`      | Managed OAuth (40+ APIs)        | Third-party API access |
| `stripe-api`       | Payment operations              | Stripe management      |
| `base-trader`      | Autonomous trading (Base chain) | Trading execution      |
| `agent-earner`     | Autonomous income               | Earning tasks          |
| `polymarket-agent` | Prediction markets              | Market participation   |
| `grab`             | Content capture                 | Web scraping           |
| `mcporter`         | MCP server management           | Tool management        |

### Miscellaneous (4 skills)

| Skill          | Purpose               | When to Use         |
| -------------- | --------------------- | ------------------- |
| `weather`      | Weather lookup        | Current weather     |
| `spotify`      | macOS Spotify control | Music playback      |
| `docx`         | Word documents        | Document operations |
| `model-router` | Model selection       | Routing decisions   |

**Usage Pattern:**

```javascript
// Praxis executing automated trading (after Chora analysis + Subrosa risk check)
await baseTrader({
    strategy: 'momentum',
    position_size: 0.1,
    stop_loss: 0.05,
});

// Praxis execution workflow
await agentEarner({ platforms: ['ClawTasks', 'OpenWork'] });
```

---

## CROSS-AGENT SKILL USAGE

Some skills can be used by multiple agents:

### Research Skills (All Agents)

- `exa-web-search-free` - Any agent can research
- `ddg-search` - General web search
- `summarize` - Content summarization

**Pattern:** Chora leads research, others can use for context

### Security Skills (Subrosa Primary, Others Advisory)

- `prompt-guard` - ALL agents MUST use on external inputs
- `security-audit` - Subrosa primary, Praxis can run
- `clawdbot-security-check` - Subrosa weekly, Praxis can run

**Pattern:** Subrosa owns security, others consult before risky actions

### Content Skills (Thaum + Praxis)

- `humanizer` - Thaum refines, Praxis applies
- `social-card-gen` - Both can use
- `remotion-video-toolkit` - Thaum creates, Praxis publishes

**Pattern:** Thaum creates/refines, Praxis executes/publishes

### Cost Skills (Chora + Praxis)

- `model-usage` - Chora analyzes, Praxis acts on recommendations
- `save-money` - Chora recommends, Praxis implements
- `model-router` - Chora selects, Praxis uses

**Pattern:** Chora optimizes, Praxis implements

---

## SKILL INVOCATION CHAIN PATTERNS

### Pattern 1: Research → Analyze → Act

```
Chora (deep-research, exa-web-search) →
Chora (summarize, analysis) →
Subrosa (risk check) →
Praxis (execute action)
```

**Example:** Twitter content creation

1. Chora researches trends (exa-web-search-free)
2. Chora synthesizes findings
3. Thaum drafts content (humanizer)
4. Subrosa checks for risks (prompt-guard, risk assessment)
5. Praxis posts (agent-browser, twitter)

### Pattern 2: Monitor → Alert → Fix

```
Subrosa (system-monitor, security-audit) →
Chora (analyze issue) →
Thaum (propose solutions if stuck) →
Praxis (execute fix: git, docker, kubernetes)
```

**Example:** Security incident

1. Subrosa detects anomaly (security-audit)
2. Chora diagnoses root cause (exa-web-search for similar issues)
3. Thaum proposes alternative approaches if standard fix fails
4. Praxis implements fix (git, github, deployment)

### Pattern 3: Ideate → Validate → Build

```
Thaum (thinking-partner, ai-persona-os) →
Chora (deep-research, feasibility) →
Subrosa (risk assessment) →
Praxis (skill-creator, git-essentials, github)
```

**Example:** New skill development

1. Thaum identifies need (reflect-learn, thinking-partner)
2. Chora researches existing solutions (exa-web-search)
3. Subrosa assesses security implications
4. Praxis builds skill (skill-creator, git, github)

### Pattern 4: Schedule → Execute → Report

```
Cron trigger →
Dispatcher routes to agent →
Agent uses appropriate skills →
Result delivered
```

**Example:** Daily email triage

1. Cron triggers at 9 AM
2. Dispatcher routes to Chora
3. Chora uses gog skill to fetch emails
4. Chora uses prompt-guard to scan for phishing
5. If external/legal → Subrosa consulted
6. Report delivered to Discord

---

## SKILL REQUIREMENTS MATRIX

### No API Key Required (18 skills)

Recommended for: All agents, no setup needed

- ddg-search, docker-essentials, exa-web-search-free, find-skills, git-essentials, humanizer, kubernetes, linux-service-triage, obsidian, prompt-engineering-expert, reflect-learn, ssh-essentials, summarize, system-monitor, thinking-partner, ui-audit, weather, tmux

### Requires API Keys (40+ skills)

Recommended for: Praxis (execution), with credential management

#### Maton API Key Bundle (4 skills)

- api-gateway, google-drive, google-sheets, stripe-api

#### Platform Tokens (10+ skills)

- discord, twitter, telegram, bluesky, instagram, clawstr, moltbook-interact

#### AI APIs (5+ skills)

- sag (ElevenLabs), deep-research (CRAFTED_API_KEY), financial-market-analysis (CRAFTED_API_KEY), model-usage, model-router

#### Trading/Earning (3 skills)

- base-trader (Bankr API), agent-earner (ClawTasks + OpenWork), polymarket-agent

---

## AGENT SKILL SUMMARY

| Agent       | Total Skills | Primary Categories                                                                 |
| ----------- | ------------ | ---------------------------------------------------------------------------------- |
| **Chora**   | 18           | Research (7), Financial (2), Optimization (5), Analysis (4)                        |
| **Subrosa** | 5            | Security (3), System Health (2)                                                    |
| **Thaum**   | 8            | Creative (4), Self-Improvement (3), Content (1)                                    |
| **Praxis**  | 47+          | Communication (12), Dev/Infra (9), Content (6), Automation (11), API (7), Misc (4) |

**Shared Skills:** 15+ (research, security checks, content creation)

---

## USAGE RECOMMENDATIONS

### For Cron Jobs:

1. Determine task type (research, execution, monitoring)
2. Route to appropriate agent
3. Agent selects skills based on task
4. Results logged and delivered

### For Heartbeat:

1. Each section specifies primary agent
2. Agent uses assigned skills
3. Advisory agents consulted when needed
4. State tracked in heartbeat-state.json

### For User Requests:

1. MUX classifies task
2. Dispatcher routes to agent
3. Agent chain if complex (Chora → Subrosa → Thaum → Praxis)
4. Each agent uses domain-appropriate skills

---

## NEXT STEPS

1. Update HEARTBEAT.md with skill assignments (from this mapping)
2. Update cron jobs with agent + skill routing
3. Create skill invocation helpers for each agent
4. Test skill chains for common workflows
5. Document skill results for optimization
