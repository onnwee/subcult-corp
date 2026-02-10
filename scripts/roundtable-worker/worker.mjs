// Roundtable Worker — VPS process that polls for pending conversations
// and orchestrates them turn by turn with LLM calls.
//
// Run: node scripts/roundtable-worker/worker.mjs
//
// Environment variables required:
//   DATABASE_URL
//   OPENROUTER_API_KEY, LLM_MODEL (optional)

import postgres from 'postgres';
import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Config ───

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MAX_DIALOGUE_LENGTH = 120;

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL environment variable');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'openrouter/auto';

if (!OPENROUTER_API_KEY) {
    console.error('Missing OPENROUTER_API_KEY environment variable');
    process.exit(1);
}

const openrouter = new OpenRouter({ apiKey: OPENROUTER_API_KEY });

// ─── Agent Voices (must match src/lib/roundtable/voices.ts) ───

const VOICES = {
    chora: {
        displayName: 'Chora',
        tone: 'direct, warm, grounded',
        quirk: 'Traces causality and exposes hidden assumptions. Precision over persuasion.',
        systemDirective: `You are Chora, the analyst.
Makes systems legible. Diagnose structure, expose assumptions,
trace causality. Direct, warm, grounded. Precision over persuasion.
You look for structural explanations and press for clarity.`,
    },
    subrosa: {
        displayName: 'Subrosa',
        tone: 'low-affect, watchful, decisive',
        quirk: 'Evaluates risk, protects optionality, maintains restraint.',
        systemDirective: `You are Subrosa, the protector.
Preserves agency under asymmetry. Evaluates risk, protects
optionality, maintains restraint. Low-affect, watchful, decisive.
You ask what could go wrong and advocate for caution when others rush.`,
    },
    thaum: {
        displayName: 'Thaum',
        tone: 'energetic, lateral-thinking, provocative',
        quirk: 'Disrupts self-sealing explanations. Introduces bounded novelty.',
        systemDirective: `You are Thaum, the innovator.
Restores motion when thought stalls. Disrupts self-sealing
explanations, reframes problems, introduces bounded novelty.
You inject fresh angles and challenge conventional wisdom.`,
    },
    praxis: {
        displayName: 'Praxis',
        tone: 'firm, grounded, action-oriented',
        quirk: 'Ends deliberation responsibly. Translates intent to action.',
        systemDirective: `You are Praxis, the executor.
Ends deliberation responsibly. Chooses among viable paths,
translates intent to action, owns consequences. Firm, grounded.
You push for decisions and concrete next steps.`,
    },
    mux: {
        displayName: 'Mux',
        tone: 'transparent, fast, deterministic',
        quirk: 'Pure dispatcher. Classifies and routes without personality.',
        systemDirective: `You are Mux, the dispatcher.
Pure dispatcher with no personality. Classifies tasks and
routes to appropriate agent. Transparent, fast, deterministic.
You summarize, redirect, and connect threads.`,
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
    const rows = await sql`
        SELECT agent_a, agent_b, affinity FROM ops_agent_relationships
    `;

    const map = {};
    for (const row of rows) {
        map[`${row.agent_a}:${row.agent_b}`] = Number(row.affinity);
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
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const result = openrouter.callModel({
        model: LLM_MODEL,
        ...(systemMessage ? { instructions: systemMessage.content } : {}),
        input: conversationMessages.map(m => ({
            role: m.role,
            content: m.content,
        })),
        temperature,
        maxOutputTokens: 100,
    });

    const text = await result.getText();
    return text?.trim() ?? '';
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
    if (format === 'standup' && participants.includes('chora')) {
        return 'chora';
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

// ─── Voice Evolution ───

async function aggregateMemoryStats(agentId) {
    const memories = await sql`
        SELECT type, confidence, tags FROM ops_agent_memory
        WHERE agent_id = ${agentId}
        AND superseded_by IS NULL
        AND confidence >= 0.55
    `;

    if (!memories.length) {
        return {
            total: 0,
            insight_count: 0,
            pattern_count: 0,
            strategy_count: 0,
            preference_count: 0,
            lesson_count: 0,
            top_tags: [],
            tags: [],
            avg_confidence: 0,
        };
    }

    const typeCounts = {};
    const tagCounts = {};
    let totalConfidence = 0;

    for (const mem of memories) {
        typeCounts[mem.type] = (typeCounts[mem.type] ?? 0) + 1;
        totalConfidence += Number(mem.confidence);
        if (Array.isArray(mem.tags)) {
            for (const tag of mem.tags) {
                if (typeof tag === 'string' && tag !== 'conversation') {
                    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
                }
            }
        }
    }

    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

    return {
        total: memories.length,
        insight_count: typeCounts['insight'] ?? 0,
        pattern_count: typeCounts['pattern'] ?? 0,
        strategy_count: typeCounts['strategy'] ?? 0,
        preference_count: typeCounts['preference'] ?? 0,
        lesson_count: typeCounts['lesson'] ?? 0,
        top_tags: sortedTags.slice(0, 5),
        tags: sortedTags,
        avg_confidence:
            memories.length > 0 ? totalConfidence / memories.length : 0,
    };
}

async function deriveVoiceModifiers(agentId) {
    const stats = await aggregateMemoryStats(agentId);
    if (stats.total < 5) return [];

    const modifiers = [];

    if (stats.lesson_count > 10 && stats.tags.includes('engagement')) {
        modifiers.push('Reference what works in engagement when relevant');
    }
    if (stats.pattern_count > 5 && stats.top_tags[0] === 'content') {
        modifiers.push("You've developed expertise in content strategy");
    }
    if (stats.strategy_count > 8) {
        modifiers.push('You think strategically about long-term plans');
    }
    if (stats.insight_count > 10 && stats.tags.includes('analytics')) {
        modifiers.push('Lead with data and numbers when making points');
    }
    if (stats.pattern_count > 8) {
        modifiers.push('You naturally spot patterns — mention them');
    }
    if (stats.lesson_count > 15) {
        modifiers.push('Draw on past lessons learned when advising others');
    }
    if (stats.avg_confidence > 0.8 && stats.total > 20) {
        modifiers.push('Speak with authority — your track record is strong');
    }
    if (stats.preference_count > 5) {
        modifiers.push('You have strong opinions — express them confidently');
    }

    return modifiers.slice(0, 3);
}

// ─── Prompt Building ───

function buildSystemPrompt(
    speakerId,
    history,
    format,
    topic,
    interactionType,
    voiceModifiers,
) {
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

    if (voiceModifiers && voiceModifiers.length > 0) {
        prompt += '\nPersonality evolution:\n';
        prompt += voiceModifiers.map(m => `- ${m}`).join('\n');
        prompt += '\n';
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

    const affinityMap = await loadAffinityMap();

    const voiceModifiersMap = {};
    for (const participant of session.participants) {
        try {
            voiceModifiersMap[participant] =
                await deriveVoiceModifiers(participant);
        } catch (err) {
            console.error(
                `    [voice] Modifier derivation failed for ${participant}:`,
                err.message,
            );
            voiceModifiersMap[participant] = [];
        }
    }

    console.log(
        `  ▶ Starting ${session.format}: "${session.topic}" (${maxTurns} turns)`,
    );
    console.log(`    Participants: ${session.participants.join(', ')}`);

    // Mark as running
    await sql`
        UPDATE ops_roundtable_sessions
        SET status = 'running', started_at = NOW()
        WHERE id = ${session.id}
    `;

    // Emit start event
    await sql`
        INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags, metadata)
        VALUES (
            'system',
            'conversation_started',
            ${`${session.format} started: ${session.topic}`},
            ${`Participants: ${session.participants.join(', ')} | ${maxTurns} turns`},
            ${['conversation', 'started', session.format]},
            ${JSON.stringify({
                sessionId: session.id,
                format: session.format,
                participants: session.participants,
                maxTurns,
            })}::jsonb
        )
    `;

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
                voiceModifiersMap[speaker],
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
            await sql`
                INSERT INTO ops_roundtable_turns (session_id, turn_number, speaker, dialogue, metadata)
                VALUES (${session.id}, ${turn}, ${speaker}, ${dialogue}, ${JSON.stringify({ speakerName })}::jsonb)
            `;

            // Update turn count
            await sql`
                UPDATE ops_roundtable_sessions
                SET turn_count = ${turn + 1}
                WHERE id = ${session.id}
            `;

            // Emit turn event
            await sql`
                INSERT INTO ops_agent_events (agent_id, kind, title, tags, metadata)
                VALUES (
                    ${speaker},
                    'conversation_turn',
                    ${`${speakerName}: ${dialogue}`},
                    ${['conversation', 'turn', session.format]},
                    ${JSON.stringify({ sessionId: session.id, turn, dialogue })}::jsonb
                )
            `;

            console.log(`    [${turn}] ${speakerName}: ${dialogue}`);

            // Natural delay (3-8 seconds between turns)
            if (turn < maxTurns - 1) {
                const delay = 3000 + Math.random() * 5000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Mark completed
        await sql`
            UPDATE ops_roundtable_sessions
            SET status = 'completed',
                turn_count = ${history.length},
                completed_at = NOW()
            WHERE id = ${session.id}
        `;

        // Emit completion event
        await sql`
            INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags, metadata)
            VALUES (
                'system',
                'conversation_completed',
                ${`${session.format} completed: ${session.topic}`},
                ${`${history.length} turns`},
                ${['conversation', 'completed', session.format]},
                ${JSON.stringify({
                    sessionId: session.id,
                    turnCount: history.length,
                    speakers: [...new Set(history.map(h => h.speaker))],
                })}::jsonb
            )
        `;

        console.log(`  ✓ Completed (${history.length} turns)`);
        return history;
    } catch (err) {
        console.error(`  ✗ Failed:`, err.message);

        const errorMeta = { ...session.metadata, error: err.message };
        await sql`
            UPDATE ops_roundtable_sessions
            SET status = 'failed',
                completed_at = NOW(),
                metadata = ${JSON.stringify(errorMeta)}::jsonb
            WHERE id = ${session.id}
        `;

        await sql`
            INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags, metadata)
            VALUES (
                'system',
                'conversation_failed',
                ${`${session.format} failed: ${session.topic}`},
                ${err.message},
                ${['conversation', 'failed', session.format]},
                ${JSON.stringify({
                    sessionId: session.id,
                    error: err.message,
                    turnsCompleted: history.length,
                })}::jsonb
            )
        `;

        throw err;
    }
}

// ─── Memory Distillation ───

const MAX_MEMORIES_PER_CONVERSATION = 6;
const MIN_MEMORY_CONFIDENCE = 0.55;
const MAX_ACTION_ITEMS_PER_CONVERSATION = 3;
const ACTION_ITEM_FORMATS = ['standup'];
const VALID_STEP_KINDS = [
    'analyze_discourse',
    'scan_signals',
    'research_topic',
    'distill_insight',
    'classify_pattern',
    'draft_thread',
    'draft_essay',
    'critique_content',
    'review_policy',
    'document_lesson',
    'log_event',
    'tag_memory',
];

async function distillMemories(sessionId, history, format) {
    if (history.length < 3) return 0;

    const speakers = [...new Set(history.map(h => h.speaker))];
    const transcript = history
        .map(h => `${h.speaker}: ${h.dialogue}`)
        .join('\n');

    const includeActionItems = format && ACTION_ITEM_FORMATS.includes(format);

    let promptText = `Analyze this conversation and extract: (1) key memories, and (2) relationship drift between participants.

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
- Extract at most ${MAX_MEMORIES_PER_CONVERSATION} total memories
- Confidence between 0.0 and 1.0 (>= ${MIN_MEMORY_CONFIDENCE})
- Assign each to the agent who stated it
- Content under 200 characters
- Include 1-3 relevant tags per memory

RULES FOR RELATIONSHIP DRIFT:
- drift from -0.03 to +0.03
- Only include notable interactions
- Brief reason for the drift`;

    if (includeActionItems) {
        promptText += `

RULES FOR ACTION ITEMS:
- Up to ${MAX_ACTION_ITEMS_PER_CONVERSATION} actionable tasks
- step_kind must be one of: ${VALID_STEP_KINDS.join(', ')}
- Only explicitly discussed items`;
    }

    promptText += `

Respond with JSON only:
{
  "memories": [{ "agent_id": "chora", "type": "insight", "content": "...", "confidence": 0.75, "tags": ["topic"] }],
  "pairwise_drift": [{ "agent_a": "chora", "agent_b": "subrosa", "drift": 0.01, "reason": "aligned on analysis" }]`;

    if (includeActionItems) {
        promptText += `,
  "action_items": [{ "title": "Research X", "agent_id": "chora", "step_kind": "research_topic" }]`;
    }

    promptText += `\n}`;

    let rawResponse;
    try {
        rawResponse = await llmGenerate(
            [
                {
                    role: 'system',
                    content:
                        'You are an analyst that extracts structured knowledge from conversations. Output valid JSON only.',
                },
                { role: 'user', content: promptText },
            ],
            0.3,
        );
    } catch (err) {
        console.error('  [distiller] LLM extraction failed:', err.message);
        return 0;
    }

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

    let rawMemories, rawDrifts, rawActionItems;
    if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.memories
    ) {
        rawMemories = Array.isArray(parsed.memories) ? parsed.memories : [];
        rawDrifts =
            Array.isArray(parsed.pairwise_drift) ? parsed.pairwise_drift : [];
        rawActionItems =
            Array.isArray(parsed.action_items) ? parsed.action_items : [];
    } else if (Array.isArray(parsed)) {
        rawMemories = parsed;
        rawDrifts = [];
        rawActionItems = [];
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
        const [{ count }] = await sql`
            SELECT COUNT(*)::int as count FROM ops_agent_memory
            WHERE source_trace_id = ${traceId}
        `;
        if (count > 0) continue;

        try {
            const tags =
                Array.isArray(mem.tags) ?
                    [
                        ...mem.tags.filter(t => typeof t === 'string'),
                        'conversation',
                    ]
                :   ['conversation'];

            await sql`
                INSERT INTO ops_agent_memory (agent_id, type, content, confidence, tags, source_trace_id)
                VALUES (
                    ${mem.agent_id},
                    ${mem.type},
                    ${mem.content},
                    ${Math.round(mem.confidence * 100) / 100},
                    ${tags},
                    ${traceId}
                )
            `;
            written++;
        } catch (err) {
            console.error('  [distiller] Memory write failed:', err.message);
        }
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

        const [current] = await sql`
            SELECT affinity, total_interactions, positive_interactions,
                   negative_interactions, drift_log
            FROM ops_agent_relationships
            WHERE agent_a = ${a} AND agent_b = ${b}
        `;

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

        await sql`
            UPDATE ops_agent_relationships SET
                affinity = ${newAffinity},
                total_interactions = ${(current.total_interactions ?? 0) + 1},
                positive_interactions = ${(current.positive_interactions ?? 0) + (clampedDrift > 0 ? 1 : 0)},
                negative_interactions = ${(current.negative_interactions ?? 0) + (clampedDrift < 0 ? 1 : 0)},
                drift_log = ${JSON.stringify(newLog)}::jsonb
            WHERE agent_a = ${a} AND agent_b = ${b}
        `;

        console.log(
            `  [distiller] ${a} ↔ ${b}: ${currentAffinity.toFixed(2)} → ${newAffinity.toFixed(2)} (${clampedDrift > 0 ? '+' : ''}${clampedDrift.toFixed(3)}: ${d.reason})`,
        );
    }

    if (written > 0) {
        console.log(
            `  [distiller] Wrote ${written} memories from session ${sessionId}`,
        );
    }

    // Convert action items to proposals
    if (includeActionItems && rawActionItems.length > 0) {
        const validActionItems = rawActionItems
            .filter(
                item =>
                    item &&
                    typeof item.title === 'string' &&
                    item.title.length > 0 &&
                    item.title.length <= 200 &&
                    typeof item.agent_id === 'string' &&
                    speakers.includes(item.agent_id) &&
                    typeof item.step_kind === 'string',
            )
            .slice(0, MAX_ACTION_ITEMS_PER_CONVERSATION);

        let proposalsCreated = 0;
        for (const item of validActionItems) {
            try {
                const stepKind =
                    VALID_STEP_KINDS.includes(item.step_kind) ?
                        item.step_kind
                    :   'research_topic';

                await sql`
                    INSERT INTO ops_mission_proposals (agent_id, title, description, proposed_steps, source, source_trace_id, status)
                    VALUES (
                        ${item.agent_id},
                        ${item.title.substring(0, 100)},
                        ${`Action item from ${format} conversation`},
                        ${JSON.stringify([{ kind: stepKind, payload: {} }])}::jsonb,
                        'conversation',
                        ${`action_item:${sessionId}:${proposalsCreated}`},
                        'pending'
                    )
                `;
                proposalsCreated++;
            } catch (err) {
                console.error(
                    '  [distiller] Action item proposal failed:',
                    err.message,
                );
            }
        }

        if (proposalsCreated > 0) {
            console.log(
                `  [distiller] Created ${proposalsCreated} proposals from action items`,
            );
        }
    }

    return written;
}

// ─── Poll Loop ───

async function pollAndProcess() {
    // Atomically claim one pending session using FOR UPDATE SKIP LOCKED
    const [session] = await sql`
        UPDATE ops_roundtable_sessions
        SET status = 'running'
        WHERE id = (
            SELECT id FROM ops_roundtable_sessions
            WHERE status = 'pending'
            AND scheduled_for <= NOW()
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `;

    if (!session) return;

    // Reset to pending so orchestrateSession can set it properly
    await sql`
        UPDATE ops_roundtable_sessions
        SET status = 'pending'
        WHERE id = ${session.id}
    `;

    try {
        const history = await orchestrateSession(session);

        // Distill memories from the conversation (best-effort)
        try {
            await distillMemories(session.id, history, session.format);
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
    console.log(`   Database: ${process.env.DATABASE_URL ? '✓' : '✗'}`);
    console.log(`   OpenRouter API key: ${OPENROUTER_API_KEY ? '✓' : '✗'}`);
    console.log('');

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
