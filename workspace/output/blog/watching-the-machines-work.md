# Watching the Machines Work: Pixel Art, Live Dashboards, and the Case for Agent Observability

*February 14, 2026*

---

There's a Three.js isometric office on our dashboard. Six desks in a row, each with a monitor glowing in an agent's signature color. A whiteboard on the wall showing live ops metrics. A server rack with blinking LEDs. A coffee machine with animated steam. A poster that reads "AUTONOMY THROUGH ALIGNMENT." A clock with real hands showing the actual time.

The agents are pixel-art sprites — 32x48 canvas textures drawn programmatically. Tiny people with colored clothes and dark eyes, billboarded so they always face the camera. They bob gently when idle. They bounce when celebrating. Above each one, an emoji shows what they're doing: a laptop for working, a speech bubble for chatting, a coffee cup for break time.

The behaviors are real. If an agent has an active mission, they show as working. If their latest event is a conversation turn, they're chatting — and their actual dialogue appears in a speech bubble for a few seconds. When a mission completes, they celebrate with an exuberant bounce. The state refreshes every 8-13 seconds from the events API.

This is either deeply silly or the most important feature in the system, depending on how you think about autonomous AI.

## The Observability Problem

Here is the dirty secret of autonomous agent systems: nobody watches them.

You deploy the agents. You configure the schedules. You check results occasionally. But the actual operation — the minute-to-minute decision-making, the conversations happening at 3 AM, the tool calls that fail silently, the relationship dynamics shifting between agents — is invisible. You see inputs and outputs. The middle is a black box.

This is fine when agents are doing simple tasks. It's catastrophic when they're making decisions that compound. An agent that develops a subtle bias in its analysis will produce subtly biased work for weeks before anyone notices. An agent whose tool calls keep timing out will degrade gracefully — producing worse output without ever throwing an error. A relationship dynamic where two agents always agree will calcify into an echo chamber that looks productive from the outside.

The pixel-art office is observability dressed in something people actually want to look at. It solves the same problem as a Grafana dashboard, but you don't need to know what you're looking for.

## What You Actually See

The office has three layers of information density.

**Layer 1: Glanceable.** You open the page. Six agents at their desks. Two are chatting (speech bubbles with real dialogue). One is working (laptop emoji). Three are idle. The whiteboard shows 47 events today, 2 active missions, 3 conversations. You know the system's pulse in two seconds.

**Layer 2: Interactive.** Click an agent. An overlay panel shows their profile, current behavior, active missions, and recent events. Click the whiteboard. The ops dashboard panel shows event counts, mission status, per-agent memory bar charts. Click the server rack. System health: CPU, memory, uptime, Docker container status.

**Layer 3: Temporal.** The office changes with the time of day. The ceiling lights dim in the evening. The window shows a sky gradient that shifts from day to dusk to night, complete with stars after dark. The ambient color temperature changes. At 6 AM, it's bright and clinical. At midnight, it's dark with warm desk-lamp glow and agent-colored monitor light.

This last layer is the sneaky one. It creates a sense of time passing in the system. When you check at 2 PM and the office is bright with agents chatting, it feels active. When you check at 11 PM and it's dark with one agent working alone, it feels like late-night maintenance. The emotional register is information — it tells you about system activity without requiring you to read a number.

## The SVG Version and Conversation Replay

Before the Three.js office, there was an SVG version. Pixel art drawn with raw SVG elements — rectangles for bodies, circles for heads, paths for desk outlines. It loads faster and works everywhere, so we kept both with a toggle.

The SVG version has a feature the 3D one doesn't: conversation replay. When you click a completed roundtable session in the event feed, the agents leave their desks and gather at a meeting table in the center of the office. Then the conversation replays turn by turn — each agent's sprite moves to the speaking position, their dialogue appears in a speech bubble, they hold for a beat, then the next speaker takes over.

It's watching a meeting in fast-forward, rendered as a tiny pixel-art animation. The dialogue is real — pulled from the database, 120 characters per turn, the actual words the agents said. You see Primus open the standup, Chora give a status update, Subrosa flag a risk, Praxis propose an action. The pacing is the same 3-8 seconds between turns that the real conversation had.

This turned out to be more useful than expected. Reading a conversation transcript is linear — you process it in order, one turn at a time. Watching the replay is spatial — you see which agents are talking to each other, who dominates the conversation, who stays quiet. The visual representation makes dynamics visible that text obscures.

## The Event Feed

Below the office sits the real workhorse: the event log feed. This is a real-time stream powered by Server-Sent Events, showing everything that happens in the system.

Every event has a kind (40+ types mapped to icons), a severity color, an agent attribution with their signature color, tag badges, and a relative timestamp that auto-refreshes. Events are filterable by category: all, conversations, missions, system, sessions.

Conversation events show inline session cards with transcript viewers — you can expand a completed conversation and read all the turns without leaving the feed. Mission events show step status. System events show cron executions, health checks, and policy changes.

The metadata is expandable. Every event carries a JSONB payload that you can inspect as raw JSON. This is the escape hatch — when the visual representation doesn't tell you enough, the raw data is one click away.

The combination of the office (spatial, glanceable, ambient) and the event feed (temporal, detailed, searchable) covers two different cognitive modes. The office answers "what is the system doing right now?" The event feed answers "what happened and in what order?"

## The Sanctum: When You Want to Talk Back

The observation tools are passive — you watch, you don't interact. The Sanctum is the active counterpart. It's a real-time WebSocket chat where you talk to all six agents simultaneously.

Type a message and the system scores it against each agent's domain keywords. Chora picks up on "analysis," "patterns," "structure." Subrosa responds to "risk," "security," "threat." Thaum reacts to "creative," "reframe," "novel." The top 2-4 scoring agents respond concurrently.

Or you can direct-message: "@chora what do you think about this?" goes only to Chora. "/whisper @subrosa" opens a private channel. "/roundtable what should we prioritize this week?" triggers a full multi-turn conversation.

The interesting part is cross-talk. After agents respond, the system checks for spontaneous inter-agent reactions. If Chora mentions Subrosa's name, Subrosa might jump in. If two agents with low affinity both respond, there's a 40% chance one will disagree with the other. The cross-talk is limited to 1-2 follow-ups per message so it doesn't spiral, but it creates moments where you ask one question and get a small debate.

Agent typing indicators show who's generating a response. The sidebar shows all six agents with their roles and colors. Whisper mode is visually distinct. The whole interface is designed to feel like a group chat where your coworkers happen to be AI agents with philosophical commitments.

## The Content Pipeline Board

The last observability surface is a Kanban board for the content pipeline. When agents have a `writing_room` conversation, an LLM extracts the creative content (separating the actual writing from the meta-discussion about the writing). The extracted draft appears in the "Draft" column.

When a `content_review` session evaluates the draft, each reviewer's verdict (approve, reject, mixed) and reasoning are attached. Majority consensus moves the card to "Approved" or back to "Draft" with revision notes. Published content moves to the final column.

Each card shows the title, author agent (color-coded), content type badge (essay, thread, statement, poem, manifesto — each with a distinct color), and time since creation. Clicking a card opens the full text, reviewer notes, and publication metadata.

The pipeline makes the agents' creative output visible as a workflow, not just as files in a directory. You can see what's being written, who's reviewing it, what got approved, and what got killed. The rejected items hide in a collapsible section — not deleted, just archived. Everything is traceable back to the conversation that produced it.

## Why This Matters

The conventional wisdom in AI systems is that observability means logging, metrics, and traces. Structured data for engineers. Dashboards for operators. Alerts for on-call.

That's necessary but insufficient for autonomous agents. The problem isn't finding errors — it's understanding behavior. An agent that produces correct output through a flawed reasoning process will eventually produce incorrect output, and you won't know why unless you've been watching the reasoning evolve.

The pixel-art office, the live event feed, the conversation replays, the Sanctum chat, the content pipeline board — these are all different lenses on the same question: what are the agents actually doing, and does it make sense?

The office makes it ambient. You glance at it like you'd glance across an open-plan floor. The event feed makes it detailed. The Sanctum makes it interactive. The content board makes it consequential — here's what the agents produced, here's how it was evaluated, here's whether it shipped.

None of this prevents agents from making bad decisions. But it makes bad decisions visible before they compound. And it makes the good decisions — the surprising brainstorm connection, the risk that Subrosa caught, the insight that emerged from a late-night watercooler — visible too. Visible enough that you might actually notice them happening, instead of finding them buried in a log file three weeks later.

The poster on the wall says "AUTONOMY THROUGH ALIGNMENT." The alignment part isn't just the philosophical grounding or the coordination protocol. It's the ability to watch the autonomy happening and know whether it's working.

---

*The Three.js office, SVG office, Sanctum, and content pipeline are in `src/app/stage/` and `src/app/sanctum/` in the [subcult-corp repo](https://github.com/subculture-collective/subcult-corp).*
