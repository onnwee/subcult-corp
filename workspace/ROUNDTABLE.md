Chapter 2: Making Them Talk — The Roundtable Conversation System
Agents can work now, but they're like people in separate cubicles — no idea what the others are doing. You need to get them in a room together.
Why Conversations Matter
It's not just for fun. Conversations are the key mechanism for emergent intelligence in multi-agent systems:
Information sync: One agent spots a trending topic, the others have no clue. Conversations make information flow.
Emergent decisions: The analyst crunches data, the coordinator synthesizes everyone's input — this beats any single agent going with its gut.
Memory source: Conversations are the primary source for writing lessons learned (more on this later).
Drama: Honestly, watching agents argue is way more fun than reading logs. Users love it.
Designing Agent Voices
Each agent needs a "persona" — tone, quirks, signature phrases. This is what makes conversations interesting.
Here's an example setup — customize these for your own domain and goals:
🎭 Boss — Project Manager
Tone: Results-oriented, direct
Quirk: Always asking about progress and deadlines
Line: "Bottom line — where are we on this?"
🎭 Analyst — Data Analyst
Tone: Cautious, data-driven
Quirk: Cites a number every time they speak
Line: "The numbers tell a different story."
🎭 Hustler — Growth Specialist
Tone: High-energy, action-biased
Quirk: Wants to "try it now" for everything
Line: "Ship it. We'll iterate."
🎭 Writer — Content Creator
Tone: Emotional, narrative-focused
Quirk: Turns everything into a "story"
Line: "But what's the narrative here?"
🎭 Wildcard — Social Media Ops
Tone: Intuitive, lateral thinker
Quirk: Proposes bold ideas
Line: "Hear me out — this is crazy but..."
If you're building for e-commerce, swap these out: Product Manager / Supply Chain Specialist / Marketing Director / Customer Service Rep. For game dev: Game Designer / Engineer / Artist / QA / Community Manager. The key is giving each role a sharply different perspective — differing viewpoints are what make conversations valuable.
Voices are defined in a config file:
javascript
// lib/roundtable/voices.ts
const VOICES = {
boss: {
displayName: 'Boss',
tone: 'direct, results-oriented, slightly impatient',
quirk: 'Always asks for deadlines and progress updates',
systemDirective: `You are the project manager.
      Speak in short, direct sentences. You care about deadlines,
      priorities, and accountability. Cut through fluff quickly.`,
},
analyst: {
displayName: 'Analyst',
tone: 'measured, data-driven, cautious',
quirk: 'Cites numbers before giving opinions',
systemDirective: `You are the data analyst.
      Always ground your opinions in data. You push back on gut feelings
      and demand evidence. You're skeptical but fair.`,
},
// ... your other agents
};
Beginner tip: Not sure how to write a systemDirective? Describe the personality you want in one sentence and hand it to your AI coding assistant: "Write me a system prompt for an impatient project manager who speaks in short bursts and always asks about deadlines." It'll generate a complete directive for you.
16 Conversation Formats
I designed 16 conversation formats, but you only need 3 to start:

1.  Standup — the most practical
    4-6 agents participate
    6-12 turns of dialogue
    The coordinator always speaks first (leader opens)
    Purpose: align priorities, surface issues
2.  Debate — the most dramatic
    2-3 agents participate
    6-10 turns of dialogue
    Temperature 0.8 (more creative, more conflict)
    Purpose: two agents with disagreements face off
3.  Watercooler — surprisingly valuable
    2-3 agents participate
    2-5 turns of dialogue
    Temperature 0.9 (very casual)
    Purpose: random chitchat. But I've found that some of the best insights emerge from casual conversation.
    javascript
    // lib/roundtable/formats.ts
    const FORMATS = {
    standup: { minAgents: 4, maxAgents: 6, minTurns: 6, maxTurns: 12, temperature: 0.6 },
    debate: { minAgents: 2, maxAgents: 3, minTurns: 6, maxTurns: 10, temperature: 0.8 },
    watercooler: { minAgents: 2, maxAgents: 3, minTurns: 2, maxTurns: 5, temperature: 0.9 },
    // ... 13 more
    };
    Who Speaks First? Who Goes Next?
    Not random round-robin — that's too mechanical. In a real team meeting, you're more likely to respond to someone you have good rapport with; if you just gave a long speech, someone else probably goes next. We simulate this with weighted randomness:
    javascript
    function selectNextSpeaker(context) {
    const weights = participants.map(agent => {
    if (agent === lastSpeaker) return 0; // no back-to-back speaking
    let w = 1.0;
    w += affinityTo(agent, lastSpeaker) _ 0.6; // good rapport with last speaker → more likely to respond
    w -= recencyPenalty(agent, speakCounts) _ 0.4; // spoke recently → lower weight
    w += (Math.random() \* 0.4 - 0.2); // 20% random jitter
    return w;
    });
    return weightedRandomPick(participants, weights);
    }
    This makes conversations feel real — agents with good relationships tend to riff off each other, but it's not absolute. Sometimes someone unexpected jumps in.
    Daily Schedule
    I designed 24 time slots covering the full day. The core idea:
    Morning: Standup (100% probability, always happens) + brainstorm + strategy session
    Afternoon: Deep-dive analysis + check-in + content review
    Evening: Watercooler chat + debate + night briefing
    Late night: Deep discussion + night-shift conversations
    Each slot has a probability (40%-100%), so it doesn't fire every time. This keeps the rhythm natural.
    javascript
    // lib/roundtable/schedule.ts — one slot example
    {
    hour_utc: 6,
    name: 'Morning Standup',
    format: 'standup',
    participants: ['opus', 'brain', ...threeRandom],
    probability: 1.0, // happens every day
    }
    Conversation Orchestration
    The unified worker (running as a Docker container) handles this:
    Polls the ops_roundtable_queue table every 30 seconds
    Picks up pending conversation tasks
    Generates dialogue turn by turn (one LLM call per turn)
    Caps each turn at 120 characters (forces agents to talk like humans, not write essays)
    Extracts memories after the conversation ends (next chapter)
    Fires events to ops_agent_events (so the frontend can see it)
    javascript
    // simplified conversation orchestration flow
    async function orchestrateConversation(session) {
    const history = [];
    for (let turn = 0; turn < maxTurns; turn++) {
    const speaker = turn === 0
    ? selectFirstSpeaker(participants, format)
    : selectNextSpeaker({ participants, lastSpeaker, speakCounts, affinities });

        const dialogue = await llm.generate({
          system: buildSystemPrompt(speaker, history),
          user: buildUserPrompt(topic, turn, maxTurns),
          temperature: format.temperature,
        });

        const cleaned = sanitize(dialogue);  // cap at 120 chars, strip URLs, etc.
        history.push({ speaker, dialogue: cleaned, turn });
        await emitEvent(speaker, cleaned);
        await delay(3000 + Math.random() * 5000);  // 3-8 second gap

    }
    return history;
    }
    Tip: The roundtable system touches a lot of files (voices.ts, formats.ts, schedule.ts, speaker-selection.ts, orchestrator.ts, unified-worker/index.ts). If you want to prototype fast, write out the conversation formats and agent voice descriptions you want, then tell Claude Code: "Build me a roundtable conversation worker using Supabase as a queue with turn-by-turn LLM generation." It can produce a working version.
