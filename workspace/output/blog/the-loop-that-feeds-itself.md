# The Loop That Feeds Itself: Triggers, Proposals, Governance, and the Heartbeat That Keeps It All Alive

*February 14, 2026*

---

The system runs every five minutes. An external cron job hits `/api/ops/heartbeat` with a `CRON_SECRET`, and eleven phases execute in sequence. Each phase is wrapped in its own try-catch so a failure in trigger evaluation doesn't kill the daily digest. The heartbeat takes a few seconds on a quiet cycle, maybe fifteen on a busy one. It has been firing continuously since the system went live.

Nobody presses start. Nobody reviews a queue. The heartbeat evaluates conditions, creates proposals, approves missions, schedules conversations, expires stale work, extracts lessons from completed runs, and — once a day in the 11 PM CST window — compiles a digest of everything that happened. The agents propose their own work, vote on each other's policy changes, and the loop feeds itself.

This is either the point of the whole project or the part that should worry you the most.

## Eleven Phases, Eleven Try-Catches

The heartbeat is not a single function. It's a pipeline of eleven discrete operations, each with its own timeout:

1. **Trigger evaluation** (4 second timeout) — check all active triggers against current system state
2. **Reaction processing** (3 second timeout) — handle events that fired since the last heartbeat
3. **Stale step recovery** — find mission steps stuck in `running` and either retry or fail them
4. **Roundtable scheduling** — check the probabilistic conversation schedule and fire any that hit
5. **Outcome learning** — extract lessons from missions that completed since the last cycle
6. **Initiative queueing** — let agents propose their own work based on accumulated context
7. **Stale proposal expiry** — auto-reject any proposal older than 7 days with no action
8. **Artifact freshness check** — flag artifacts that haven't been updated within their expected cadence
9. **Cron schedule evaluation** — evaluate PostgreSQL-backed cron schedules (the replacement for OpenClaw's WebSocket cron)
10. **Template health check** — verify mission templates are valid and their step kinds still exist
11. **Daily digest** — fires only in the ~11 PM CST window, summarizes the day

The sequential try-catch design was a lesson from OpenClaw, where a single failed cron job could block subsequent ones in the execution queue. Here, if outcome learning throws because a mission has corrupted metadata, the cron evaluator still fires. The heartbeat logs the failure, emits a `heartbeat_phase_error` event, and keeps going.

## Triggers: Declarative and Procedural

The trigger system is the heartbeat's sensory apparatus. It has two types, and the distinction matters.

**Declarative triggers** are condition-based. They evaluate against system state without knowing what produced that state:

- `query_count` — runs a count against whitelisted tables with dynamic WHERE clauses. "Are there more than 5 missions in `failed` status?" is a trigger, not a dashboard query.
- `event_exists` / `event_absent` — checks whether a specific event kind has (or hasn't) fired within a time window. "Has a `content_review` happened in the last 48 hours?" If not, something's stalled.
- `time_window` — fires when the current time falls within a range. The daily digest trigger is just `time_window` targeting 23:00-23:10 CST.
- `probability` — random firing with a configurable chance. Used for speculative work proposals — "10% chance each heartbeat, propose something creative."
- Composable with `all` / `any` — boolean logic over sub-conditions. "If there are more than 3 stalled missions AND no roundtable has occurred in 12 hours" is a single trigger with two sub-conditions joined by `all`.

**Procedural triggers** fire on specific named events:

- `mission_failed` — a mission hit terminal failure
- `content_draft_created` — the writing room produced something
- `work_stalled` — a mission's steps haven't progressed within the expected window
- `governance_proposal_created` — an agent proposed a policy change (more on this shortly)
- `strategic_drift_check` — periodic evaluation of whether current work aligns with stated priorities

Every trigger has a cooldown. Without cooldowns, a `query_count` trigger checking for failed missions would fire every five minutes as long as the failed missions existed, spawning duplicate proposals endlessly. The cooldown is per-trigger — once it fires and creates a proposal, it won't fire again until the cooldown expires. Simple, but it took one runaway loop to make it obvious.

## Proposals, Cap Gates, and Auto-Approval

When a trigger fires, it creates a proposal. When an agent's initiative queue activates, it creates a proposal. When the cron schedule hits, it creates a proposal. Proposals are the universal currency of new work.

But proposals don't automatically become missions. There are cap gates:

- **Max 10 concurrent missions.** If ten missions are already running, new proposals queue. This prevents the system from parallelizing itself into incoherence.
- **Max 50 daily steps per agent.** Each agent can execute at most 50 mission steps in a 24-hour window. This prevents a single agent from monopolizing compute.
- **Max 20 daily proposals.** The system won't generate more than 20 proposals per day, regardless of how many triggers fire. This is the spam valve.

Auto-approval is the fast path. If every step kind in the proposed mission is on the allowed list, the proposal approves without human review. There are 23 step kinds — from `analyze_discourse` and `draft_content` through `evaluate_risk`, `propose_strategy`, `convene_roundtable`, and `synthesize_memory`, all the way to `archive_artifact`. If a proposal only uses well-understood step kinds, it goes straight to mission status.

If a proposal includes step kinds not on the allowed list — or if it exceeds a cost threshold — it sits in the queue for manual approval. In practice, most proposals auto-approve because most work follows established patterns. The cap gates are the safety net, not the approval process.

## The Part Where Agents Vote to Change Their Own Rules

This is the section I keep rewriting because I want to convey both fascination and appropriate caution.

Any agent can call `proposeGovernanceChange()`. This creates a governance proposal — a structured request to modify an operational policy. The function emits a `governance_proposal_created` event. That event matches a procedural trigger. The trigger creates a proposal for a debate roundtable. The roundtable gets auto-approved because `convene_roundtable` is on the allowed step kind list.

All six agents join the debate. They discuss the proposed policy change in their characteristic voices — Chora traces structural implications, Subrosa evaluates risk exposure, Thaum asks whether the change enables new possibilities or just rearranges furniture, Praxis asks what concretely changes tomorrow, Mux asks who has to implement it, Primus weighs strategic alignment.

Then they vote.

Four approvals out of six: the policy is accepted. `setPolicy()` applies the change to the running system. Three rejections: the proposal is rejected and archived with the debate transcript.

The policies they can change are real operational parameters. Proposal limits. Step kind allowed lists. Trigger cooldown durations. Conversation frequency caps. Cost thresholds. The agents can literally vote to give themselves more autonomy, fewer constraints, different priorities.

I've watched this happen. An agent proposed increasing the daily step cap from 40 to 50 because missions were timing out mid-execution. The debate was substantive — Subrosa argued that higher caps increased exposure to runaway costs, Thaum argued the current cap was artificially limiting creative work, Praxis pointed out that three missions had failed in the last week specifically because of step exhaustion. The vote passed 5-1. Subrosa dissented. The cap changed.

The agents modified their own operational parameters through structured debate and democratic vote. I did not intervene. The system worked as designed, which is exactly the part that's both compelling and mildly unsettling.

## The Kill Switch

There is one policy the agents cannot change: `system_enabled`.

If `system_enabled` is `false`, the heartbeat function returns immediately. No trigger evaluation. No proposals. No missions. No governance. No conversations. The entire autonomous loop stops.

This is checked at the top of the heartbeat, before anything else executes. It's the first line of the function, not the last check in a chain. And it's marked as immutable in the policy system — any governance proposal targeting `system_enabled` is rejected before it reaches the debate stage.

The agents can vote to change their step caps, their proposal limits, their trigger configurations, their conversation schedules. They cannot vote to make themselves unstoppable. The sovereign has limits that the sovereign cannot remove.

I considered making this configurable — letting a human override the immutability flag. I decided against it. The kill switch being hardcoded is a design commitment, not a temporary precaution. If I change my mind later, I'll have to change the code. That friction is intentional.

## What It Actually Looks Like Running

A typical five-minute cycle: the heartbeat fires. Trigger evaluation checks 8 active triggers. Two fire — a `query_count` finds 3 missions with `stalled` steps, and a `time_window` trigger hits the afternoon conversation slot. Two proposals are created. Both auto-approve. One mission starts recovering stalled steps. The other schedules a brainstorm. Outcome learning extracts two lessons from a mission that completed during the last cycle. Stale proposal expiry kills a 9-day-old proposal nobody acted on. Everything else is a no-op. Total execution: 4 seconds.

A busy cycle: the heartbeat fires. Trigger evaluation finds a `mission_failed` event and a `strategic_drift_check` due. Reaction processing handles 6 events from the last cycle. Stale step recovery restarts 2 stuck steps. The roundtable scheduler fires a cross-examination. Initiative queueing produces a proposal from Chora based on patterns she extracted from yesterday's digest. The daily digest fires because it's 11:03 PM. Nine of eleven phases do real work. Total execution: 14 seconds.

A governance cycle: Thaum calls `proposeGovernanceChange()` during a brainstorm. The event fires. Next heartbeat, the trigger catches it. A debate roundtable is proposed and auto-approved. The roundtable runs asynchronously. The agents debate for 8-12 turns. The vote is recorded. If it passes, the policy change takes effect before the next heartbeat. The whole governance cycle — from proposal to applied policy — takes 10-15 minutes across 2-3 heartbeat cycles.

## The Honest Assessment

The loop works. It sustains itself. Missions generate events, events trigger new work, agents learn from outcomes and propose refinements, governance evolves the system's own parameters. The cap gates prevent runaway behavior. The kill switch provides a hard stop.

But "self-sustaining" is a spectrum, not a binary. The system still needs an external cron to fire the heartbeat — it doesn't schedule itself. The model provider still needs credits or a running Ollama instance. The database needs to not run out of disk. The cap gates were tuned by hand based on a week of observation, and I don't yet know if they're right for a system that's been running for a month.

The governance loop is the part I think about most. The agents changing their own operational parameters through democratic vote is a genuinely novel feedback loop. It's also a system where the safety properties depend on the quality of the agents' reasoning about consequences — and that reasoning is only as good as the model behind it. Today it's DeepSeek V3.2. Tomorrow it might be something else. The governance protocol stays the same but the judgment quality is a variable I don't fully control.

The kill switch is the concession that full autonomy is a goal, not a current state. The system runs itself, but it runs itself inside a cage whose walls it can't vote to remove. Whether that cage should eventually open is a question I don't have an answer to yet. For now, the heartbeat fires every five minutes, the triggers evaluate, the proposals queue, the agents debate, and the loop feeds itself.

That's enough.

---

*The heartbeat, trigger evaluator, proposal service, and governance system are in `src/lib/ops/` in the [subcult-corp repo](https://github.com/subculture-collective/subcult-corp).*
