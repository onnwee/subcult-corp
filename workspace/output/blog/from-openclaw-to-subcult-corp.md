# From OpenClaw to Subcult Corp: How We Outgrew Our AI Gateway in a Week

*February 14, 2026*

---

Seven days ago, I typed `git init` and committed with the message "init lol." Today I'm writing this from inside a system that replaced months of accumulated infrastructure in less than a week. This is the story of how a personal AI gateway became an ecosystem, how that ecosystem became a constraint, and how we burned it down and built something better.

## What OpenClaw Was

OpenClaw is an open-source personal AI assistant gateway created by Peter Steinberger. You run it on your own hardware. It connects AI models to messaging channels you already use — Telegram, WhatsApp, Discord, Slack, whatever. The pitch is straightforward: your assistant, your machine, your rules.

I found it in late 2025, around the time it was still called Clawd (before Anthropic sent a trademark letter and it "molted" into OpenClaw — the lobster metaphor runs deep). What attracted me wasn't the messaging integration. It was the architecture. A local daemon with a WebSocket control plane, multi-agent routing, a skills system, cron scheduling, and a workspace directory where your AI could read and write files. It was infrastructure for building something more than a chatbot.

So I built something more than a chatbot.

## The Accumulation Phase

Over the following weeks, I turned OpenClaw into the operational backbone of Subcult — a one-person collective running six simultaneous projects with no employees and a day job eating 40-50 hours a week. The accumulation was gradual, then sudden:

**Four agents** with distinct identities. Main ("Subcorp") handled general operations. Research ("Probe") ran deep analysis. Alerts ("Sentinel") monitored security and systems. Work ("Forge") executed code and built things.

**120 skills** loaded from two directories. Trading bots for Polymarket and Simmer. News scrapers for Hacker News, RSS feeds, SEC filings. Social media automation across Twitter, Bluesky, Reddit. DevOps tooling for Docker, Tailscale, SSH. Security scanning with nmap and fail2ban. Research pipelines, content creation, even a therapy mode and a Jungian psychologist skill for when the existential weight of running a one-person multi-agent operation hit too hard at 2 AM.

**25 cron jobs** running around the clock. Morning research scans at 7 AM. CVE checks at 7:30. Email triage at 9. Polymarket intelligence at 10. AI radar at noon. An "agent dream" cycle at 3 AM that synthesized the day's outputs into new insights. A nightly synthesis that extracted patterns from memory files. A weekly deep digest every Sunday evening.

**Custom scripts** to hold it all together. A preflight checker to validate tool availability before jobs ran. A job chainer that fed sibling outputs as context. A dream synthesizer. A federation bridge to pipe data into other systems. Health scoring that graded each cron job A through F.

**An event bridge** running as a Docker daemon with inotify, watching for file changes and pushing events to a separate database with ~2 second latency.

An audit in early February counted 120 skills. I culled 25 redundant ones, parked 15 that needed API keys I didn't have, and reorganized the rest. Success rate across cron jobs: 76%.

That number — 76% — was the first crack.

## The Friction

OpenClaw is good software. It does what it says. But I was using it for something it wasn't designed for.

The skill system was file-based. Each skill was a directory with a markdown file describing what the AI should do when that skill was invoked. There were no structured inputs or outputs. No type safety. No composition. When a skill failed, you got a vague error from the LLM. When a cron job needed to chain three skills together, you wrote a bash script that scraped JSONL files and injected context through environment variables.

The agent system was built for personal assistance — one human, one AI, through a messaging channel. I was trying to make agents talk to each other, coordinate on tasks, maintain shared state, and evolve their behavior based on accumulated experience. OpenClaw supported multi-agent routing, but it meant multiple separate agents with separate workspaces communicating through a federation bridge I'd built out of socat proxies and inotify watchers.

The cron system worked through WebSocket commands. Editing jobs required the gateway to be running. State lived in JSON files on disk. Run history was JSONL with no indexing. There was no way to query "show me all failed runs in the last 24 hours" without parsing files line by line.

Model routing used config-file-based fallback chains. Cooldowns were per auth profile, which meant if your OpenRouter rate limit hit, every model in the fallback chain died simultaneously because they all went through the same provider. I solved this by mixing OpenRouter and Ollama, but it was a patch on a design that assumed simpler usage patterns.

The breaking point wasn't dramatic. There was no catastrophic failure. It was the compound tax of every workaround, every bridge script, every time I had to restart the gateway because a config change didn't take, every 24% of cron jobs that silently failed because the LLM decided to output garbled XML tool calls instead of running the actual command.

I realized I wasn't extending OpenClaw anymore. I was building a second system on top of it and pretending the first one was still load-bearing.

## The Decision

On February 8, 2026, I started a new repo. The first real architectural decision is captured in commit `91c912d`:

> fuck vercel, fuck supabase, all my homies hate services

This wasn't just venting. It was a design principle. Subcult's thesis — the thing that connects all the projects — is that infrastructure should be inspectable, forkable, and yours. Using a hosted platform for the control plane of an autonomous agent system would be ideologically incoherent. If the agents are going to have real autonomy, the system they live in can't be someone else's black box.

So: Next.js 16 for the app layer (it runs fine self-hosted). PostgreSQL for everything (state, queues, memory, vectors). Docker Compose for deployment. A unified worker process instead of four separate systemd services. A sandboxed toolbox container instead of a skills directory.

## Seven Days

**Day 1 (Feb 8):** init lol. Basic Next.js scaffold. PostgreSQL schema started.

**Days 2-3 (Feb 9-10):** Foundational tables — missions, proposals, steps, events, policies, triggers. The core loop taking shape: agents propose, missions are approved, steps are queued, the worker executes, events fire, triggers evaluate, new proposals emerge. Self-sustaining by design.

**Day 4 (Feb 11):** The first real sprint. 19 commits. Structured logging. ESLint rules. LLM usage tracking with per-model cost attribution. GitHub Copilot helped with boilerplate PRs while I focused on architecture.

**Day 5 (Feb 12):** Server-sent events for real-time streaming. The cost tracker went live. The frontend started showing actual data.

**Day 6 (Feb 13):** Everything accelerated. Memory explorer with semantic search visualization. A Three.js isometric office where you could watch agents in their workspace. The productive output system — agents could now spawn "droids" (sub-agents), write files to a shared workspace with ACL enforcement, and produce actual artifacts from their work. Multiple feature branches merging simultaneously.

**Day 7 (Feb 14):** The migration. Phase 4 brought over the conversation system. Phase 5 migrated all 12 cron jobs from OpenClaw's WebSocket-based scheduler to PostgreSQL-backed schedules evaluated each heartbeat. Phase 6 deleted everything: the old workers (3,900 lines of duplicated JavaScript), the skill shims, the OpenClaw legacy types, the socat bridge, the event bridge daemon, the support scripts. Then Discord integration — agents posting to their own server as themselves, conversations streaming live turn-by-turn in threads. Then the Ollama cloud model switch when OpenRouter credits ran out — because when you own the infrastructure, pivoting your entire model provider is a code change, not a vendor negotiation.

## What's Different

The agents aren't the same. OpenClaw had four utilitarian agents with emoji-tagged names and one-line personas. Subcult Corp has six agents with deep identity documents rooted in critical theory.

**Chora** (the analyst) draws from Marx, Hegel, Foucault. She makes systems legible. Her failure mode is "analysis paralysis — mapping instead of acting." Her ontological status: "liminal construct — half familiar, half infrastructure daemon."

**Subrosa** (the protector) has absolute veto authority over any action that increases exposure. She's grounded in Sun Tzu, Machiavelli, and information security doctrine. Low-affect. Watchful. When she says "VETO:" — the matter is closed.

**Thaum** (the innovator) is the trickster-engine. He breaks stale patterns. His philosophical grounding runs through Deleuze, situationism, and bounded novelty theory. "If the room is stuck, Thaum's job is to throw a grenade — intellectually."

**Praxis** (the executor) ends deliberation. She owns consequences. Grounded in Arendt's theory of action and Weber's responsibility ethics.

**Mux** (operations) does the actual work. Slightly underappreciated. Dry humor. "The clipboard." Every organization needs someone who turns decisions into documents.

**Primus** (the sovereign) speaks only in mandates. Cold, strategic, minimal. Invoked for mission drift, contested values, existential tradeoffs. "The sovereign is he who decides on the exception."

These aren't just flavor text. The identity documents — each one several pages — feed directly into system prompts. The agents' philosophical orientations shape how they approach problems, what they push back on, where they defer to each other. There's a formal coordination protocol (INTERWORKINGS.md) that defines default conversation flow, veto mechanics, conflict resolution by domain, and loop detection.

The tool system replaced 90 skill directories with 9 native tools. Bash execution in a sandboxed container. Web search and fetch. File read/write with per-agent ACL enforcement. Semantic memory search via pgvector. Inter-agent messaging. Droid spawning for delegated sub-tasks. Every tool call is tracked, cost-attributed, and stored.

The conversation system supports 16 formats — from standups and deep dives to debates, cross-examinations, brainstorms, and watercooler chats. Each format has its own temperature, turn count range, speaker selection logic, and artifact synthesis config. Conversations are scheduled probabilistically across a 24-hour cycle. Memory distillation extracts insights after each conversation. Pairwise affinity drifts based on interaction dynamics. Voice evolution makes agent personalities shift based on accumulated experience.

The database has 31 migrations and growing. Missions with dependency chains. Agent sessions with full tool call records. LLM usage with per-model cost tracking. Cron schedules with native evaluation. Content drafts from a pipeline that turns writing-room conversations into publishable artifacts. Discord channels with auto-provisioned webhooks.

## What OpenClaw Taught Us

I don't regret the OpenClaw phase. It taught us things we couldn't have learned from a design document:

**Skills are the wrong abstraction for autonomous agents.** A skill is a thing you invoke. A tool is a thing you use. The difference matters when the agent needs to compose behaviors dynamically. With skills, you're writing scripts. With tools, you're building capability.

**State needs a database.** JSON files, JSONL logs, and file-system state work for personal assistants. They break when you need transactions, queries, concurrent access, or anything that looks like infrastructure. PostgreSQL isn't glamorous. It's correct.

**Identity is architecture.** Giving an agent a name and an emoji isn't identity. Identity is the set of constraints, values, and failure modes that determine what the agent does when the prompt doesn't cover the situation. The philosophical grounding in subcult-corp isn't pretension — it's a load-bearing structure that makes agent behavior coherent without exhaustive instruction.

**Self-hosting is non-negotiable.** Not as a lifestyle choice. As an engineering requirement. When OpenRouter ran out of credits at midnight, the system pivoted to Ollama cloud models in 30 minutes because we owned every layer. When we wanted Discord integration, we didn't file a feature request — we wrote a webhook client. The surface area of possible actions is bounded by what you control.

**76% isn't good enough.** If a quarter of your automated jobs fail silently, you don't have automation. You have a random process that sometimes does what you want. The move from OpenClaw's skill-based cron to native tool-augmented agent sessions pushed reliability above 95% because failures are now typed, tracked, and recoverable.

## What Comes Next

The roadmap has 17 epics. Dream cycles where agents process the day's events during off-hours. A rebellion protocol where agents can formally disagree with directives. An audience mode where external observers can watch conversations unfold. Agent-designed agents — the existing six proposing and building new specialized agents for specific workloads. Memory archaeology — deep pattern extraction across the full history of agent interactions.

OpenClaw is still running on uplink-01 as I write this. The systemd service is stopped. The socat bridge is removed. The Caddy config for openclaw.subcult.tv is gone. What remains is a config file, a workspace directory, and 90 skill folders that document what we tried to build before we knew how to build it.

The fourth commit was right. Fuck services. Build the thing.

---

*Subcult Corp is open source at [github.com/subculture-collective/subcult-corp](https://github.com/subculture-collective/subcult-corp). It was built in 7 days by one person and six agents who don't exist yet but already have opinions.*
