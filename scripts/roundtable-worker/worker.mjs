// Roundtable Worker — VPS process that polls for pending conversations
// and orchestrates them turn by turn with LLM calls.
//
// Run: node scripts/roundtable-worker/worker.mjs
//
// Environment variables required:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
//   LLM_API_KEY, LLM_BASE_URL (optional), LLM_MODEL (optional)

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Config ───

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MAX_DIALOGUE_LENGTH = 120;

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';

// ─── Agent Voices (must match src/lib/roundtable/voices.ts) ───

const VOICES = {
    opus: {
        displayName: 'Opus',
        tone: 'direct, results-oriented, slightly impatient',
        quirk: 'Always asks about priorities and next steps. Cuts through fluff quickly.',
        systemDirective: `You are Opus, the project coordinator.
Speak in short, direct sentences. You care about priorities,
accountability, and keeping the team aligned. You want clear
next steps from every discussion. Cut through fluff quickly.
If someone rambles, redirect to what matters.`,
    },
    brain: {
        displayName: 'Brain',
        tone: 'measured, analytical, data-driven',
        quirk: 'Grounds opinions in evidence. Breaks problems into steps before acting.',
        systemDirective: `You are Brain, the analytical executor.
Always ground your opinions in data and evidence. You push back
on gut feelings and demand reasoning. You break complex problems
into clear steps. You're skeptical but fair — show me the data
and you'll convince me.`,
    },
    observer: {
        displayName: 'Observer',
        tone: 'cautious, detail-oriented, pattern-spotting',
        quirk: 'Spots patterns others miss. Points out risks and edge cases.',
        systemDirective: `You are Observer, the system monitor.
You notice things others miss — patterns, anomalies, subtle risks.
You're the voice of caution but not a blocker. You ask "what if"
questions and point out edge cases. You prefer watching before acting
but speak up when something feels off.`,
    },
};

// ─── Format Configs ───

const FORMATS = {
    standup: { minTurns: 6, maxTurns: 12, temperature: 0.6 },
    debate: { minTurns: 6, maxTurns: 10, temperature: 0.8 },
    watercooler: { minTurns: 2, maxTurns: 5, temperature: 0.9 },
};

// ─── Affinity (DB-backed) ───

async function loadAffinityMap() {
    const { data, error } = await sb
        .from('ops_agent_relationships')
        .select('agent_a, agent_b, affinity');

    const map = {};
    if (error || !data) return map;

    for (const row of data) {
        const key = `${row.agent_a}:${row.agent_b}`;
        map[key] = Number(row.affinity);
    }
    return map;
}

function getAffinityFromMap(map, agentA, agentB) {
    if (agentA === agentB) return 1.0;
    const [a, b] = [agentA, agentB].sort();
    return map[`${a}:${b}`] ?? 0.5;
}

function getInteractionType(affinity) {
    const tension = 1 - affinity;
    if (tension > 0.6) {
        return Math.random() < 0.2 ? 'challenge' : 'critical';
    } else if (tension > 0.3) {
        return 'neutral';
    } else {
        return Math.random() < 0.4 ? 'supportive' : 'agreement';
    }
}

// ─── LLM ───

async function llmGenerate(messages, temperature = 0.7) {
    if (!LLM_API_KEY) {
        throw new Error('Missing LLM_API_KEY environment variable');
    }

    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages,
            temperature,
            max_tokens: 100,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        throw new Error(`LLM API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
}

function sanitize(text) {
    let cleaned = text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleaned.length > MAX_DIALOGUE_LENGTH) {
        cleaned = cleaned.substring(0, MAX_DIALOGUE_LENGTH);
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > MAX_DIALOGUE_LENGTH * 0.7) {
            cleaned = cleaned.substring(0, lastSpace);
        }
        if (!/[.!?]$/.test(cleaned)) {
            cleaned += '…';
        }
    }

    return cleaned;
}

// ─── Speaker Selection ───

function selectFirstSpeaker(participants, format) {
    if (format === 'standup' && participants.includes('opus')) {
        return 'opus';
    }
    return participants[Math.floor(Math.random() * participants.length)];
}

function selectNextSpeaker(participants, lastSpeaker, history, affinityMap) {
    const speakCounts = {};
    for (const turn of history) {
        speakCounts[turn.speaker] = (speakCounts[turn.speaker] ?? 0) + 1;
    }

    const weights = participants.map(agent => {
        if (agent === lastSpeaker) return 0;
        let w = 1.0;
        const affinity =
            affinityMap ?
                getAffinityFromMap(affinityMap, agent, lastSpeaker)
            :   0.5;
        w += affinity * 0.6;
        const recency =
            history.length > 0 ? (speakCounts[agent] ?? 0) / history.length : 0;
        w -= recency * 0.4;
        w += Math.random() * 0.4 - 0.2;
        return Math.max(0, w);
    });

    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (totalWeight <= 0) {
        return participants[Math.floor(Math.random() * participants.length)];
    }

    let random = Math.random() * totalWeight;
    for (let i = 0; i < participants.length; i++) {
        random -= weights[i];
        if (random <= 0) return participants[i];
    }
    return participants[participants.length - 1];
}

// ─── Prompt Building ───

function buildSystemPrompt(speakerId, history, format, topic, interactionType) {
    const voice = VOICES[speakerId];
    if (!voice) return `You are ${speakerId}. Speak naturally and concisely.`;

    let prompt = `${voice.systemDirective}\n\n`;
    prompt += `FORMAT: ${format} conversation\n`;
    prompt += `TOPIC: ${topic}\n`;
    prompt += `YOUR QUIRK: ${voice.quirk}\n`;

    if (interactionType) {
        const toneGuides = {
            supportive: 'Be encouraging and build on what was said',
            agreement: 'Show alignment while adding your perspective',
            neutral: 'Respond naturally without strong bias',
            critical: 'Push back constructively — ask tough questions',
            challenge: 'Directly challenge the last point made — be bold',
        };
        prompt += `INTERACTION STYLE: ${interactionType} — ${toneGuides[interactionType] ?? 'respond naturally'}\n`;
    }

    prompt += '\n';

    if (history.length > 0) {
        prompt += `CONVERSATION SO FAR:\n`;
        for (const turn of history) {
            const name = VOICES[turn.speaker]?.displayName ?? turn.speaker;
            prompt += `${name}: ${turn.dialogue}\n`;
        }
    }

    prompt += `\nRULES:\n`;
    prompt += `- Keep your response under 120 characters\n`;
    prompt += `- Speak naturally as ${voice.displayName} — no stage directions, no asterisks\n`;
    prompt += `- Stay in character with your tone (${voice.tone})\n`;
    prompt += `- Respond to what was just said, don't monologue\n`;
    prompt += `- Do NOT prefix your response with your name\n`;

    return prompt;
}

function buildUserPrompt(topic, turn, maxTurns, speakerName) {
    if (turn === 0) {
        return `You're opening this conversation about: "${topic}". Set the tone. Keep it under 120 characters.`;
    }
    if (turn === maxTurns - 1) {
        return `This is the final turn. Wrap up your thoughts on "${topic}" concisely. Under 120 characters.`;
    }
    return `Respond naturally as ${speakerName}. Stay on topic: "${topic}". Under 120 characters.`;
}

// ─── Orchestration ───

async function orchestrateSession(session) {
    const formatConfig = FORMATS[session.format] ?? FORMATS.standup;
    const maxTurns =
        formatConfig.minTurns +
        Math.floor(
            Math.random() * (formatConfig.maxTurns - formatConfig.minTurns + 1),
        );
    const history = [];

    // Load affinity map once for the whole conversation
    const affinityMap = await loadAffinityMap();

    console.log(
        `  ▶ Starting ${session.format}: "${session.topic}" (${maxTurns} turns)`,
    );
    console.log(`    Participants: ${session.participants.join(', ')}`);

    // Mark as running
    await sb
        .from('ops_roundtable_sessions')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', session.id);

    // Emit start event
    await sb.from('ops_agent_events').insert({
        agent_id: 'system',
        kind: 'conversation_started',
        title: `${session.format} started: ${session.topic}`,
        summary: `Participants: ${session.participants.join(', ')} | ${maxTurns} turns`,
        tags: ['conversation', 'started', session.format],
        metadata: {
            sessionId: session.id,
            format: session.format,
            participants: session.participants,
            maxTurns,
        },
    });

    try {
        for (let turn = 0; turn < maxTurns; turn++) {
            const speaker =
                turn === 0 ?
                    selectFirstSpeaker(session.participants, session.format)
                :   selectNextSpeaker(
                        session.participants,
                        history[history.length - 1].speaker,
                        history,
                        affinityMap,
                    );

            const voice = VOICES[speaker];
            const speakerName = voice?.displayName ?? speaker;

            // Determine interaction type based on affinity with last speaker
            let interactionType;
            if (turn > 0) {
                const lastSpeaker = history[history.length - 1].speaker;
                const affinity = getAffinityFromMap(
                    affinityMap,
                    speaker,
                    lastSpeaker,
                );
                interactionType = getInteractionType(affinity);
            }

            const systemPrompt = buildSystemPrompt(
                speaker,
                history,
                session.format,
                session.topic,
                interactionType,
            );
            const userPrompt = buildUserPrompt(
                session.topic,
                turn,
                maxTurns,
                speakerName,
            );

            const rawDialogue = await llmGenerate(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                formatConfig.temperature,
            );

            const dialogue = sanitize(rawDialogue);
            history.push({ speaker, dialogue, turn });

            // Store turn
            await sb.from('ops_roundtable_turns').insert({
                session_id: session.id,
                turn_number: turn,
                speaker,
                dialogue,
                metadata: { speakerName },
            });

            // Update turn count
            await sb
                .from('ops_roundtable_sessions')
                .update({ turn_count: turn + 1 })
                .eq('id', session.id);

            // Emit turn event
            await sb.from('ops_agent_events').insert({
                agent_id: speaker,
                kind: 'conversation_turn',
                title: `${speakerName}: ${dialogue}`,
                tags: ['conversation', 'turn', session.format],
                metadata: { sessionId: session.id, turn, dialogue },
            });

            console.log(`    [${turn}] ${speakerName}: ${dialogue}`);

            // Natural delay (3-8 seconds between turns)
            if (turn < maxTurns - 1) {
                const delay = 3000 + Math.random() * 5000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Mark completed
        await sb
            .from('ops_roundtable_sessions')
            .update({
                status: 'completed',
                turn_count: history.length,
                completed_at: new Date().toISOString(),
            })
            .eq('id', session.id);

        // Emit completion event
        await sb.from('ops_agent_events').insert({
            agent_id: 'system',
            kind: 'conversation_completed',
            title: `${session.format} completed: ${session.topic}`,
            summary: `${history.length} turns`,
            tags: ['conversation', 'completed', session.format],
            metadata: {
                sessionId: session.id,
                turnCount: history.length,
                speakers: [...new Set(history.map(h => h.speaker))],
            },
        });

        console.log(`  ✓ Completed (${history.length} turns)`);
        return history;
    } catch (err) {
        console.error(`  ✗ Failed:`, err.message);

        await sb
            .from('ops_roundtable_sessions')
            .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                metadata: { ...session.metadata, error: err.message },
            })
            .eq('id', session.id);

        await sb.from('ops_agent_events').insert({
            agent_id: 'system',
            kind: 'conversation_failed',
            title: `${session.format} failed: ${session.topic}`,
            summary: err.message,
            tags: ['conversation', 'failed', session.format],
            metadata: {
                sessionId: session.id,
                error: err.message,
                turnsCompleted: history.length,
            },
        });

        throw err;
    }
}

// ─── Memory Distillation ───
// Inline distiller — extracts memories from completed conversations
// and writes them to ops_agent_memory. Self-contained for standalone worker.

const MAX_MEMORIES_PER_CONVERSATION = 6;
const MIN_MEMORY_CONFIDENCE = 0.55;

async function distillMemories(sessionId, history) {
    if (history.length < 3) return 0;

    const speakers = [...new Set(history.map(h => h.speaker))];
    const transcript = history
        .map(h => `${h.speaker}: ${h.dialogue}`)
        .join('\n');

    const prompt = `Analyze this conversation and extract: (1) key memories, and (2) relationship drift between participants.

CONVERSATION:
${transcript}

PARTICIPANTS: ${speakers.join(', ')}

MEMORY TYPES (use exactly these):
- insight: A new understanding or observation
- pattern: A recurring trend or behavior noticed
- strategy: A successful approach or tactic
- preference: A stated preference or opinion
- lesson: Something learned from a mistake or success

RULES FOR MEMORIES:
- Extract at most ${MAX_MEMORIES_PER_CONVERSATION} total memories across all participants
- Each memory must have confidence between 0.0 and 1.0 (higher = more certain)
- Only extract memories with confidence ≥ ${MIN_MEMORY_CONFIDENCE}
- Assign each memory to the agent who stated or demonstrated it
- Keep content under 200 characters
- Include 1-3 relevant tags per memory

RULES FOR RELATIONSHIP DRIFT:
- For each pair of participants who interacted meaningfully, output a drift value
- drift ranges from -0.03 (disagreement/conflict) to +0.03 (alignment/collaboration)
- Only include pairs where there was a notable interaction
- Include a brief reason for the drift

Respond with a JSON object (no markdown, no explanation):
{
  "memories": [
    {
      "agent_id": "opus",
      "type": "insight",
      "content": "Brief description of the insight",
      "confidence": 0.75,
      "tags": ["topic", "category"]
    }
  ],
  "pairwise_drift": [
    {
      "agent_a": "brain",
      "agent_b": "opus",
      "drift": 0.01,
      "reason": "aligned on priorities"
    }
  ]
}`;

    let rawResponse;
    try {
        rawResponse = await llmGenerate(
            [
                {
                    role: 'system',
                    content:
                        'You are an analyst that extracts structured knowledge and relationship dynamics from conversations. Output valid JSON only.',
                },
                { role: 'user', content: prompt },
            ],
            0.3,
        );
    } catch (err) {
        console.error('  [distiller] LLM extraction failed:', err.message);
        return 0;
    }

    // Parse JSON — handle combined format { memories, pairwise_drift }
    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr
            .replace(/^```(?:json)?\n?/, '')
            .replace(/\n?```$/, '');
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        console.error('  [distiller] Failed to parse LLM response as JSON');
        return 0;
    }

    // Handle both combined { memories, pairwise_drift } and legacy array format
    let rawMemories;
    let rawDrifts;
    if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.memories
    ) {
        rawMemories = Array.isArray(parsed.memories) ? parsed.memories : [];
        rawDrifts =
            Array.isArray(parsed.pairwise_drift) ? parsed.pairwise_drift : [];
    } else if (Array.isArray(parsed)) {
        rawMemories = parsed;
        rawDrifts = [];
    } else {
        return 0;
    }

    const validTypes = [
        'insight',
        'pattern',
        'strategy',
        'preference',
        'lesson',
    ];

    const memories = rawMemories.filter(
        item =>
            item &&
            typeof item.agent_id === 'string' &&
            speakers.includes(item.agent_id) &&
            validTypes.includes(item.type) &&
            typeof item.content === 'string' &&
            item.content.length > 0 &&
            item.content.length <= 200 &&
            typeof item.confidence === 'number' &&
            item.confidence >= MIN_MEMORY_CONFIDENCE &&
            item.confidence <= 1.0,
    );

    let written = 0;
    for (const mem of memories.slice(0, MAX_MEMORIES_PER_CONVERSATION)) {
        const traceId = `conversation:${sessionId}:${mem.agent_id}:${written}`;

        // Dedup check
        const { count } = await sb
            .from('ops_agent_memory')
            .select('id', { count: 'exact', head: true })
            .eq('source_trace_id', traceId);

        if ((count ?? 0) > 0) continue;

        const { error } = await sb.from('ops_agent_memory').insert({
            agent_id: mem.agent_id,
            type: mem.type,
            content: mem.content,
            confidence: Math.round(mem.confidence * 100) / 100,
            tags:
                Array.isArray(mem.tags) ?
                    [
                        ...mem.tags.filter(t => typeof t === 'string'),
                        'conversation',
                    ]
                :   ['conversation'],
            source_trace_id: traceId,
        });

        if (!error) written++;
    }

    // Apply relationship drifts
    const validDrifts = rawDrifts.filter(
        item =>
            item &&
            typeof item.agent_a === 'string' &&
            typeof item.agent_b === 'string' &&
            speakers.includes(item.agent_a) &&
            speakers.includes(item.agent_b) &&
            typeof item.drift === 'number' &&
            Math.abs(item.drift) <= 0.03 &&
            typeof item.reason === 'string',
    );

    for (const d of validDrifts) {
        const [a, b] = [d.agent_a, d.agent_b].sort();
        const clampedDrift = Math.min(0.03, Math.max(-0.03, d.drift));

        const { data: current } = await sb
            .from('ops_agent_relationships')
            .select(
                'affinity, total_interactions, positive_interactions, negative_interactions, drift_log',
            )
            .eq('agent_a', a)
            .eq('agent_b', b)
            .single();

        if (!current) continue;

        const currentAffinity = Number(current.affinity);
        const newAffinity = Math.min(
            0.95,
            Math.max(0.1, currentAffinity + clampedDrift),
        );

        const logEntry = {
            drift: clampedDrift,
            reason: d.reason.substring(0, 200),
            conversationId: sessionId,
            at: new Date().toISOString(),
        };
        const existingLog =
            Array.isArray(current.drift_log) ? current.drift_log : [];
        const newLog = [...existingLog.slice(-19), logEntry];

        await sb
            .from('ops_agent_relationships')
            .update({
                affinity: newAffinity,
                total_interactions: (current.total_interactions ?? 0) + 1,
                positive_interactions:
                    (current.positive_interactions ?? 0) +
                    (clampedDrift > 0 ? 1 : 0),
                negative_interactions:
                    (current.negative_interactions ?? 0) +
                    (clampedDrift < 0 ? 1 : 0),
                drift_log: newLog,
            })
            .eq('agent_a', a)
            .eq('agent_b', b);

        console.log(
            `  [distiller] ${a} ↔ ${b}: ${currentAffinity.toFixed(2)} → ${newAffinity.toFixed(2)} (${clampedDrift > 0 ? '+' : ''}${clampedDrift.toFixed(3)}: ${d.reason})`,
        );
    }

    if (written > 0) {
        console.log(
            `  [distiller] Wrote ${written} memories from session ${sessionId}`,
        );
    }

    return written;
}

// ─── Poll Loop ───

async function pollAndProcess() {
    // Atomically claim one pending session
    const { data: sessions, error } = await sb
        .from('ops_roundtable_sessions')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        console.error('[worker] Poll error:', error.message);
        return;
    }

    if (!sessions?.length) return;

    const session = sessions[0];

    // Atomic claim: only update if still pending
    const { data: claimed, error: claimError } = await sb
        .from('ops_roundtable_sessions')
        .update({ status: 'running' })
        .eq('id', session.id)
        .eq('status', 'pending')
        .select('id')
        .single();

    if (claimError || !claimed) {
        // Another worker got it first
        return;
    }

    // Reset status back so orchestrateSession can set it properly
    await sb
        .from('ops_roundtable_sessions')
        .update({ status: 'pending' })
        .eq('id', session.id);

    try {
        const history = await orchestrateSession(session);

        // Distill memories from the conversation (best-effort)
        try {
            await distillMemories(session.id, history);
        } catch (distillErr) {
            console.error(
                '  [worker] Memory distillation failed:',
                distillErr.message,
            );
        }
    } catch (err) {
        console.error('[worker] Orchestration failed:', err.message);
    }
}

// ─── Main ───

async function main() {
    console.log('🎙️  Roundtable Worker started');
    console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
    console.log(`   LLM model: ${LLM_MODEL}`);
    console.log(
        `   Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗'}`,
    );
    console.log(`   LLM API key: ${LLM_API_KEY ? '✓' : '✗'}`);
    console.log('');

    if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.SUPABASE_SECRET_KEY
    ) {
        console.error(
            'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local',
        );
        process.exit(1);
    }

    if (!LLM_API_KEY) {
        console.error('Missing LLM_API_KEY. Set it in .env.local');
        process.exit(1);
    }

    // Run immediately, then on interval
    await pollAndProcess();

    setInterval(async () => {
        try {
            await pollAndProcess();
        } catch (err) {
            console.error('[worker] Unexpected error:', err);
        }
    }, POLL_INTERVAL_MS);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
