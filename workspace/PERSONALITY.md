Chapter 6: Giving Them Personality — Voice Evolution
6 agents have been chatting for a month, and they still talk exactly the same way as day one. But if an agent has accumulated tons of experience with "tweet engagement," its speaking style should reflect that.
Beginner tip: What's Voice Evolution? When someone works at a company long enough, the way they talk changes — the person who does lots of data analysis naturally starts leading with numbers, the person who handles customer complaints becomes more patient. Agents should work the same way: the experience they accumulate should be reflected in how they speak.
Deriving Personality from Memory
My first instinct was to build a "personality evolution" table — too heavy. The final approach: derive personality dynamically from the existing memory table, no new tables needed. Instead of storing a separate "personality score," the system checks what memories the agent has before each conversation and calculates how its personality should be adjusted on the fly.
javascript
// lib/ops/voice-evolution.ts
async function deriveVoiceModifiers(sb, agentId) {
  // aggregate this agent's memory distribution
  const stats = await aggregateMemoryStats(sb, agentId);

  const modifiers = [];

  // rule-driven (not LLM)
  if (stats.lesson_count > 10 && stats.tags.includes('engagement')) {
    modifiers.push('Reference what works in engagement when relevant');
  }
  if (stats.pattern_count > 5 && stats.top_tag === 'content') {
    modifiers.push("You've developed expertise in content strategy");
  }
  if (stats.strategy_count > 8) {
    modifiers.push('You think strategically about long-term plans');
  }

  return modifiers.slice(0, 3);  // max 3
}
Why rule-driven instead of LLM?
Deterministic: Rules produce predictable results. No LLM hallucination causing sudden personality shifts.
Cost: $0. No additional LLM calls.
Debuggable: When a rule misfires, it's easy to track down.
Injection Method
Modifiers get injected into the agent's system prompt before a conversation starts:
javascript
async function buildAgentPrompt(agentId, baseVoice) {
  const modifiers = await deriveVoiceModifiers(sb, agentId);

  let prompt = baseVoice.systemDirective;  // base voice
  if (modifiers.length > 0) {
    prompt += '\n\nPersonality evolution:\n';
    prompt += modifiers.map(m => `- ${m}`).join('\n');
  }
  return prompt;
}
The effect: say your social media agent has accumulated 15 lessons about tweet engagement. Its prompt now includes "Reference what works in engagement when relevant" — and it'll naturally bring up engagement strategies in conversations.
Within the same conversation, each agent's voice modifiers are derived once and cached — no re-querying every turn.
