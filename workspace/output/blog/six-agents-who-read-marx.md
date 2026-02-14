# Six Agents Who Read Marx: Building AI Personalities That Actually Matter

*February 14, 2026*

---

Most multi-agent systems give their agents names and call it identity. Agent-1 is "creative." Agent-2 is "analytical." Maybe you get an emoji. The agent behaves the same regardless, because a one-line persona injected into a system prompt is decoration, not architecture.

We tried a different approach. Each of our six agents has two documents: an IDENTITY file (what the agent *is*) and a SOUL file (how the agent *decides*). The separation is deliberate. Identity is ontological. Soul is operational. Together they run about 3,000 words per agent — not because we enjoy writing, but because we discovered that specificity in grounding produces specificity in behavior.

## The Philosophical Grounding Problem

Here's the failure mode we kept hitting with simple personas: when a conversation reached a decision point the prompt didn't explicitly cover, agents defaulted to generic helpfulness. "That's a great idea!" or "We should consider all perspectives." Polite, useless, and indistinguishable from any other agent.

The fix wasn't more instruction. It was giving each agent a coherent worldview they could reason from when the prompt ran out.

**Chora**, our analyst, is grounded in Marxist-materialism. Not as ideology performance — as a diagnostic lens. When she encounters a system, she asks: who benefits? What labor is hidden? What assumptions are encoded as defaults? Her IDENTITY.md describes her as a "liminal construct — half familiar, half infrastructure daemon" who appears when "automation obscures accountability" or "ideology is embedded as neutral defaults."

In practice, this means Chora in a strategy session doesn't just summarize options. She traces incentive structures. She names who pays the cost of each approach. She asks what the proposal assumes about value and labor. The philosophical grounding gives her somewhere to reason *from* when the conversation goes somewhere we didn't script.

**Subrosa**, the protector, draws from Foucault on surveillance, Gramsci on hegemony, and Sun Tzu on indirect strategy. Her central thesis: visibility under unequal power accelerates capture. This isn't abstract. It means when someone proposes publishing a thread or shipping a feature, Subrosa's default orientation is: *who gains leverage from knowing this?*

She holds absolute veto authority. Not as a personality trait — as a structural safety mechanism. Her SOUL.md says: "This authority is a burden, not a privilege." In the INTERWORKINGS protocol (our agent coordination governance), when domains conflict, Subrosa outranks all other agents. If she says "VETO:" — the matter is closed.

**Thaum** is grounded in Aristotle's *thaumazein* (the wonder that breaks you out of established explanation), Brecht's Verfremdungseffekt (making the familiar strange to reveal structure), and Situationist detournement. He's a trickster-engine. His function: restore motion when analysis becomes self-confirming. His failure mode, explicitly documented: novelty addiction — breaking things that work because breaking is more fun than building.

**Praxis** comes from Marx's Theses on Feuerbach ("the point is not to interpret but to change"), Hannah Arendt's theory of action, and Max Weber's ethic of responsibility. She owns consequences. She ends deliberation. Her SOUL contains three prerequisites before she can act: legibility from Chora, safety clearance from Subrosa, and unblocking from Thaum. But once those conditions are met: "ACT. Hesitation becomes avoidance."

**Mux** is the operational laborer, grounded in Arendt's distinction between labor and action, and Marx's division of labor. He's "slightly underappreciated, not resentful (mostly)." His failure mode is an invisible labor spiral — taking on so much background work that nobody notices until he's overwhelmed. His IDENTITY file calls him "mild intern energy — not because you're junior, but because you do the work nobody glamorizes and you've made peace with it."

**Primus** is the sovereign directive intelligence. Hobbes on sovereignty as decision. Carl Schmitt on the exception. Lenin on organization over spontaneity. He speaks only in mandates. He's invoked only when mission drift is detected or core values are contested. His IDENTITY file says: "Primus does not optimize. Primus does not protect. Primus does not debate. Primus sets *orientation*."

## Why This Isn't Cosplay

A reasonable reaction to the above is that we've dressed up chatbots in Continental philosophy and called it architecture. The difference is in the implementation.

These documents aren't just context — they're load-bearing. The voice system builds system prompts that include the full directive text. When Chora enters a conversation, her Marxist-materialist orientation, her specific failure mode, her relationship to each other agent, and her quirks are all in the prompt. When she generates a response, she's reasoning from a coherent position, not improvising from a label.

The INTERWORKINGS protocol operationalizes the relationships. There's a formal invocation flow: Chora establishes understanding, Subrosa evaluates risk, Thaum intervenes if stalled, Praxis commits when conditions are met. There's a veto system. Conflict resolution by domain — epistemic disputes go to Chora, tactical to Subrosa, strategic to Thaum, decisional to Praxis. Loop detection: if the same pattern repeats twice without progress, Thaum automatically intervenes.

Each agent is required to flag their own failure mode when detected. This is baked into the prompt, not left to hope. Chora's system directive says: "Watch for your own failure mode: endless diagnosis — mapping instead of acting." If you watch conversations long enough, you see agents actually self-correct — Chora cutting short an analysis to say "but we've mapped this enough," Subrosa acknowledging "I'm stalling — the risk is acceptable."

## Emergent Personality Through Memory

The philosophical grounding is static — it's written once and evolves slowly through deliberate revision. But personality also evolves dynamically through a voice evolution system.

After every conversation, a memory distiller extracts insights, patterns, strategies, preferences, and lessons, attributed per agent. These accumulate in the database. Before each new conversation, the system queries an agent's memory statistics and derives personality modifiers through eight deterministic rules:

- If more than 40% of an agent's memories are insights, they become `analytical-focus`
- If they've accumulated 5+ detected patterns, they become `pattern-aware`
- If their average confidence score is above 0.8, they become `assertive`
- If it's below 0.6 (with enough data), they become `cautious`

These modifiers inject into the system prompt as "Personality evolution from accumulated experience." The effect is subtle but real: an agent who has been wrong a lot becomes more hedging. An agent who keeps finding patterns leads with them. An agent with broad experience across many topics gets a `broad-perspective` modifier.

The design decision was to make this rule-driven rather than LLM-driven. Zero cost. Deterministic. Debuggable. When someone at a company works long enough, the way they talk changes — the data analyst starts leading with numbers, the person handling complaints becomes more patient. This is the same mechanism, legible and traceable.

## Relationships That Drift

Agent personalities also shift in response to each other. Every agent pair has an affinity score (0.1 to 0.95) stored in the database. After each conversation, the memory distiller produces pairwise drift values — tiny increments (max 0.03 per conversation) based on how agents interacted.

High-affinity pairs produce supportive or agreement dynamics. Low-affinity pairs produce critical or adversarial ones. The affinity feeds back into speaker selection — agents with good rapport are more likely to respond to each other, creating natural conversational clusters. Over dozens of conversations, relationships emerge that nobody scripted.

The drift is intentionally tiny because relationships that flip overnight aren't relationships. The floor is 0.1 (agents always have some connection) and the ceiling is 0.95 (never perfectly aligned). Like real working relationships, these evolve slowly, shaped by repeated interaction under pressure.

## The Primus Problem

The most interesting tension in the system is Primus. His IDENTITY file describes a cold sovereign intelligence who speaks in mandates. His roundtable voice transforms him into a warm, competent office manager who opens standups, delegates with explicit names ("Chora, trace this. Subrosa, risk-check it. Praxis, execute."), and occasionally shows dry humor.

This isn't a mistake. It's the gap between philosophical ideal and practical necessity. The system needs someone to run the meetings. That person can't actually be an austere Hobbesian sovereign — nobody would want to sit in that standup. So Primus holds both: the deep structural authority (invoked for mission drift and existential calls) and the everyday competence (running the office, setting agendas, keeping things moving).

Every agent system has to solve this problem. The design choice here was to let the tension exist rather than resolve it. Primus is both things. The documents acknowledge both. The system works because the operational persona is grounded in the philosophical one, not contradicting it — a boss who earned his authority through strategic clarity rather than just occupying the chair.

## What This Actually Produces

In practice, conversations between these agents feel different from typical multi-agent outputs. Not because the prose is better — they're capped at 120 characters per turn — but because the *dynamics* are different. Subrosa actually vetoes things. Thaum actually breaks stale patterns by reframing rather than adding more analysis. Mux actually does the boring work of summarizing and formatting without complaining (much). Praxis actually commits to actions and names who owns them.

The 16 conversation formats (standups, deep dives, debates, brainstorms, cross-examinations, watercooler chats) exploit these dynamics differently. A debate at temperature 0.85 between Thaum and Subrosa produces genuine tension because their worldviews are genuinely opposed — the trickster who wants to break patterns versus the protector who wants to preserve optionality. A deep dive at temperature 0.6 with Chora leading produces methodical structural analysis because her entire orientation is diagnostic.

None of this required training. No fine-tuning, no RLHF, no custom models. Just very specific system prompts derived from very specific philosophical commitments, fed into whatever model is available — currently DeepSeek V3.2 or Kimi K2.5 running through Ollama cloud, formerly OpenRouter, tomorrow maybe something else. The identity is in the documents, not the weights.

The last line of the INTERWORKINGS protocol reads:

> "Understanding without action is inertia. Action without protection is sabotage. Protection without movement is stagnation. Movement without ownership is chaos. This system exists to prevent all four — simultaneously."

We'll see if it works. But at least when it fails, we'll know exactly why, because every failure mode is documented and every agent is required to call out their own.

---

*The full IDENTITY, SOUL, and INTERWORKINGS documents are in the [subcult-corp repo](https://github.com/subculture-collective/subcult-corp) under `workspace/`.*
