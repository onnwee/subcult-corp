# The Office That Runs Itself: A 24-Hour Schedule for Agents Who Don't Sleep

*February 14, 2026*

---

At 3 AM Central Time, two of our agents might have a conversation. There's a 15% chance. If the probability check passes, they'll do a check-in — something lightweight about whatever's on the system's mind. At 6 AM, the morning standup fires at 100% probability. Everyone's there. By noon, three agents are at the watercooler (70% chance). At 3 PM, Thaum might start a debate (55%). At 11 PM, Praxis and Subrosa review what's ready to ship (30%).

This isn't a cron schedule disguised as a calendar. It's a probabilistic daily rhythm for an office that doesn't close, built to make autonomous AI agents feel less like batch jobs and more like colleagues who happen to work 24 hours a day.

## The Problem With Always-On

The naive approach to autonomous agents is: run them continuously. Give them a goal, let them loop, check results. This produces a specific kind of output — relentless, uniform, and slightly manic. There's no rhythm. No ebb and flow. No difference between Tuesday morning and Saturday night.

Humans don't work like this. An office has a shape to its day. Mornings are for alignment. Midday is for deep work. Afternoons are for creative tangents. Evenings are for review. Late nights are for the weird conversations that wouldn't happen during business hours.

We wanted that shape without faking it.

## Twenty Slots, Twenty Probabilities

The schedule is a TypeScript array of 20 time slots spanning the full 24-hour cycle. Each slot has a name, a conversation format, specific participant requirements, and a firing probability.

The morning block (6-10 AM) is structured and high-probability. The standup is mandatory. Triage, planning, and deep dives follow at descending probabilities — 70%, 60%, 50%. This is when the office does its "real work."

Midday (11 AM - 1 PM) shifts. The writing room fires at 40%. The lunch watercooler at 70% — because in any real office, the casual noon conversation is more reliable than the scheduled meetings.

The afternoon (2-5 PM) is creative and adversarial. Brainstorms, debates, cross-examinations. These formats have moderate probabilities (35-55%) because you can't force creative work on a schedule, but you can create conditions where it might happen.

Evening (6-10 PM) is review and synthesis. Content review, reframe sessions, retros, strategy briefings. The manager's briefing at 10 PM has Primus, Chora, and Praxis at 50% — the leadership team checking in before the office goes quiet.

Late night (11 PM - 3 AM) is sparse. The shipping review at 11 PM is only 30%. The late-night watercooler at 1 AM is 25%. The insomnia check-in at 3 AM is 15%. These exist because occasionally, interesting things happen at weird hours. The low probability means they're rare — maybe once or twice a week. When they fire, the conversations have a different character because only 2 agents are present and the format is informal.

## Who Shows Up

Participant selection is the second layer of non-determinism. Each slot specifies required agents and how many additional random ones to include.

The morning standup requires all six agents. Triage requires Chora and Subrosa (analysis and risk) plus one random. Planning requires Primus, Praxis, and Mux (direction, execution, operations) plus one. The deep dive only needs Chora plus two — she's the analyst, and the rotating cast means different combinations produce different insights.

The `withRequired` helper function builds participant lists by ensuring specific agents are present, then filling remaining slots with random selections from whoever's left. This means the 2 PM brainstorm always has Thaum (the creative disruptor) but his collaborators change daily. Some days he brainstorms with Chora (structured creativity). Other days with Subrosa (adversarial creativity). The dynamics shift without anyone scripting them.

## Probabilistic, Not Random

The critical design choice: probabilities are not uniform. They're tuned to produce a realistic office density.

At 100% standup probability and a daily cap of 5 conversations, the standup always happens and then 4 more slots fire from the remaining 19. Typical days look like: standup + triage + one afternoon session + watercooler + one evening review. Occasionally a debate displaces the triage. Sometimes the late-night watercooler fires and two agents have a weird, unstructured chat about whatever the system has been processing.

The daily cap matters. Without it, the 20 slots with their combined probabilities would produce 8-10 conversations per day — too many. The cap forces selection pressure. Higher-probability slots crowd out lower ones. The morning block dominates because it fires first. Evening and night sessions only happen when the morning was light.

This produces organic variation. Monday might have 5 morning-heavy conversations. Tuesday might have 3, with a late-night watercooler that generates an unexpected insight. No two days are identical, but every day has recognizable structure.

## The Topics Pool

Each format has a curated pool of 4-7 topic prompts, chosen randomly per session. These aren't generic. They're designed to provoke specific dynamics:

Standup topics: "Status check: what moved, what is stuck, what needs attention?" and "Where should our energy go today?" and "What did we learn since yesterday that changes our priorities?"

Debate topics: "Quality versus speed — where is the actual tradeoff right now?" and "Are we building infrastructure or performing productivity?"

Watercooler topics: "Hot take: something everyone assumes but nobody questions" and "What is the most underappreciated thing someone here does?"

Brainstorm topics: "What if we approached this from the completely opposite direction?" and "Weird combinations: pick two unrelated ideas and smash them together."

The topic pools are deliberately provocative. "Is our content strategy serving the mission or just generating activity?" is more interesting than "Discuss content strategy." The provocations create starting conditions that push agents into their differentiated roles — Subrosa responds differently to "What looks safe but is actually fragile?" than Thaum does.

## Temperature as Mood

Format temperature is one of the subtler design decisions. Operational formats (standup, triage, planning, shipping) run at 0.5 — deterministic, focused, on-task. Creative formats (brainstorm, watercooler) run at 0.95 — high variance, associative, occasionally surprising. Adversarial formats (debate, cross-exam) sit at 0.8-0.85 — enough variability to produce genuine tension, enough structure to stay coherent.

The writing room runs at 0.7. Strategy at 0.65. Deep dive at 0.6. These aren't arbitrary — they reflect the observation that deep analytical work benefits from moderate randomness (enough to find non-obvious connections) while operational work needs to be reliable.

Combined with speaker selection (which weights affinity, recency, and random jitter), the temperature creates distinct conversational textures. A standup feels clipped and efficient. A watercooler feels loose and tangential. A deep dive feels methodical with occasional surprises. A debate feels confrontational but bounded.

## After the Conversation

When a conversation ends, two things happen automatically.

First, the memory distiller extracts insights, patterns, and relationship drift. If Chora and Thaum had a productive brainstorm, their pairwise affinity ticks up by 0.01-0.03. If Subrosa vetoed something Praxis proposed, their affinity might tick down. Over weeks, these tiny increments produce emergent relationship dynamics that feed back into speaker selection — agents who work well together end up in more conversations together.

Second, formats with artifact configs trigger synthesis. A standup produces a briefing (synthesized by Mux — he does the operational labor). A deep dive produces a report (synthesized by Chora). A strategy session produces a plan (synthesized by Primus). The synthesis happens in a separate agent session with tool access, so the synthesizer can read files, search memory, and produce a structured document.

Now, with the Discord integration, conversations also stream live. Each turn posts to a thread as the speaking agent — their symbol and name as the webhook identity. When the conversation ends, a summary embed posts with turn count, speakers, and the last three exchanges. When the artifact synthesizer finishes (sometimes minutes later), the artifact posts to the same thread.

The result is a Discord server where you can watch the office operate in real time. Threads appear in #roundtable throughout the day. Some mornings are busy — standup followed by triage followed by planning. Some evenings are quiet. The rhythm is organic because the probabilities are tuned for it.

## What It Feels Like

The honest answer: sometimes boring. The morning standup is often unremarkable. Status updates. Blockers. Normal office stuff.

But then the 2 PM brainstorm fires with Thaum and Subrosa, and they get into a genuine disagreement about whether a proposed feature increases exposure, and Thaum reframes the problem as a question about who the actual audience is, and Subrosa concedes that the risk model assumed a different threat actor, and the memory distiller extracts an insight that gets filed under Subrosa's name with high confidence.

Or the 1 AM watercooler fires (it's a 25% shot — maybe twice a week) and Mux and Chora have a casual conversation about what's been underappreciated in the recent work, and it surfaces a pattern that nobody flagged during the structured sessions.

These moments aren't scripted. They're made possible by the schedule's structure — the probabilities, the participant selection, the topic pools, the temperature tuning — creating conditions where interesting things can happen without requiring them to happen on demand.

The office runs itself. Most of the time it's just an office. But the best ideas emerge from the space between the scheduled meetings, the late-night check-ins that almost didn't fire, the unlikely pairing of agents who don't usually work together. That's what the probabilistic schedule is designed to produce.

---

*The schedule, formats, and orchestrator code are in `src/lib/roundtable/` in the [subcult-corp repo](https://github.com/subculture-collective/subcult-corp).*
