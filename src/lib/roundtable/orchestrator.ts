// Roundtable Orchestrator — turn-by-turn conversation generation
// The VPS worker calls this to run a conversation session
import { sql, jsonb } from '@/lib/db';
import type {
    ConversationFormat,
    ConversationTurnEntry,
    RoundtableSession,
    ToolDefinition,
} from '../types';
import { getVoice } from './voices';
import { getFormat, pickTurnCount } from './formats';
import { selectFirstSpeaker, selectNextSpeaker } from './speaker-selection';
import { llmGenerate, sanitizeDialogue } from '../llm';
import { emitEvent } from '../ops/events';
import { distillConversationMemories } from '../ops/memory-distiller';
import {
    loadAffinityMap,
    getAffinityFromMap,
    getInteractionType,
} from '../ops/relationships';
import { deriveVoiceModifiers } from '../ops/voice-evolution';
import { getAgentTools } from '../skills';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'orchestrator' });

/**
 * Build the system prompt for a speaker in a conversation.
 * Includes their full voice directive, conversation history, format context,
 * interaction dynamics, and INTERWORKINGS protocol awareness.
 */
function buildSystemPrompt(
    speakerId: string,
    history: ConversationTurnEntry[],
    format: ConversationFormat,
    topic: string,
    interactionType?: string,
    voiceModifiers?: string[],
    availableTools?: ToolDefinition[],
): string {
    const voice = getVoice(speakerId);
    if (!voice) {
        return `You are ${speakerId}. Speak naturally and concisely.`;
    }

    const formatConfig = getFormat(format);

    let prompt = `${voice.systemDirective}\n\n`;
    prompt += `═══ CONVERSATION CONTEXT ═══\n`;
    prompt += `FORMAT: ${format} — ${formatConfig.purpose}\n`;
    prompt += `TOPIC: ${topic}\n`;
    prompt += `YOUR SYMBOL: ${voice.symbol}\n`;
    prompt += `YOUR SIGNATURE MOVE: ${voice.quirk}\n`;

    if (interactionType) {
        const toneGuides: Record<string, string> = {
            supportive:
                'Build on what was said — add your angle without undermining',
            agreement:
                'Align, but push further. Agreement without addition is dead air.',
            neutral: 'Respond honestly. No obligation to agree or disagree.',
            critical:
                'Push back. Name what is weak, what is missing, what is assumed.',
            challenge:
                'Directly contest the last point. Be specific about why.',
            adversarial:
                'Stress-test this. Find the failure mode. Break the argument if you can.',
        };
        prompt += `INTERACTION DYNAMIC: ${interactionType} — ${toneGuides[interactionType] ?? 'respond naturally'}\n`;
    }

    // INTERWORKINGS protocol awareness
    prompt += `\n═══ OFFICE DYNAMICS ═══\n`;
    prompt += `- If Subrosa says "VETO:" — the matter is closed. Acknowledge and move on.\n`;
    prompt += `- If you have nothing to add, silence is a valid response. Say "..." or stay brief.\n`;
    prompt += `- Watch for your own failure mode: ${voice.failureMode}\n`;
    prompt += `- Primus is the office manager. He sets direction and makes final calls.\n`;

    if (voiceModifiers && voiceModifiers.length > 0) {
        prompt += '\nPERSONALITY EVOLUTION (from accumulated experience):\n';
        prompt += voiceModifiers.map(m => `- ${m}`).join('\n');
        prompt += '\n';
    }

    prompt += '\n';

    if (history.length > 0) {
        prompt += `═══ CONVERSATION SO FAR ═══\n`;
        for (const turn of history) {
            const turnVoice = getVoice(turn.speaker);
            const name =
                turnVoice ?
                    `${turnVoice.symbol} ${turnVoice.displayName}`
                :   turn.speaker;
            prompt += `${name}: ${turn.dialogue}\n`;
        }
    }

    if (availableTools && availableTools.length > 0) {
        prompt += `\n═══ AVAILABLE TOOLS ═══\n`;
        prompt += `You have access to the following tools via OpenClaw. Use them when the conversation would benefit from real data, research, or action.\n`;
        prompt += `Tools: ${availableTools.map(t => t.name).join(', ')}\n`;
        prompt += `- Only invoke a tool if it directly serves the current discussion\n`;
        prompt += `- Your dialogue response should incorporate or react to tool results naturally\n`;
        prompt += `- Do NOT mention tool names in your dialogue — speak as yourself, using the information\n`;
    }

    prompt += `\n═══ RULES ═══\n`;
    prompt += `- Keep your response under 120 characters\n`;
    prompt += `- Speak as ${voice.displayName} (${voice.pronouns}) — no stage directions, no asterisks, no quotes\n`;
    prompt += `- Stay in character: ${voice.tone}\n`;
    prompt += `- Respond to what was just said. Don't monologue. Don't repeat yourself.\n`;
    prompt += `- Do NOT prefix your response with your name or symbol\n`;
    prompt += `- If you're ${voice.displayName} and this format doesn't need you, keep it brief or pass\n`;

    return prompt;
}

/**
 * Build the user prompt for a specific turn.
 * Format-aware: the instruction changes based on the conversation type.
 */
function buildUserPrompt(
    topic: string,
    turn: number,
    maxTurns: number,
    speakerName: string,
    format: ConversationFormat,
): string {
    if (turn === 0) {
        const openers: Partial<Record<ConversationFormat, string>> = {
            standup: `Open the standup. Set the frame for: "${topic}". Brief and structured.`,
            checkin: `Quick check-in. Ask the room: "${topic}". Keep it light.`,
            deep_dive: `Open a deep analysis of: "${topic}". Set up the structural question.`,
            risk_review: `Begin threat assessment on: "${topic}". Name what's at stake.`,
            brainstorm: `Kick off brainstorming on: "${topic}". Go wide, not deep.`,
            debate: `Open the debate on: "${topic}". Take a clear position.`,
            cross_exam: `Begin interrogation of: "${topic}". Find the weak point.`,
            reframe: `The current frame on "${topic}" isn't working. Break it open.`,
            watercooler: `Start a casual chat about: "${topic}". No agenda.`,
        };
        const opener =
            openers[format] ??
            `You're opening this conversation about: "${topic}". Set the tone.`;
        return `${opener} Under 120 characters.`;
    }

    if (turn === maxTurns - 1) {
        return `Final turn. Land your point on "${topic}". No loose threads. Under 120 characters.`;
    }

    return `Respond as ${speakerName}. Stay on: "${topic}". Under 120 characters.`;
}

/**
 * Orchestrate a full conversation session.
 * Generates dialogue turn by turn, stores each turn to the database,
 * and emits events for the frontend.
 *
 * @param session - The session record from ops_roundtable_sessions
 * @param delayBetweenTurns - whether to wait between turns (3-8s for natural feel)
 * @returns Array of conversation turns
 */
export async function orchestrateConversation(
    session: RoundtableSession,
    delayBetweenTurns: boolean = true,
): Promise<ConversationTurnEntry[]> {
    const format = getFormat(session.format);
    const maxTurns = pickTurnCount(format);
    const history: ConversationTurnEntry[] = [];

    // Load affinity map once for the entire conversation
    const affinityMap = await loadAffinityMap();

    // Pre-load tools for each participant (cached per conversation)
    const agentToolsMap = new Map<string, ToolDefinition[]>();
    for (const participant of session.participants) {
        try {
            const tools = getAgentTools(
                participant as Parameters<typeof getAgentTools>[0],
            );
            agentToolsMap.set(participant, tools);
        } catch {
            agentToolsMap.set(participant, []);
        }
    }

    // Derive voice modifiers once per participant (cached per conversation)
    const voiceModifiersMap = new Map<string, string[]>();
    for (const participant of session.participants) {
        try {
            const mods = await deriveVoiceModifiers(participant);
            voiceModifiersMap.set(participant, mods);
        } catch (err) {
            log.error('Voice modifier derivation failed', {
                error: err,
                participant,
            });
            voiceModifiersMap.set(participant, []);
        }
    }

    // Mark session as running
    await sql`
        UPDATE ops_roundtable_sessions
        SET status = 'running', started_at = NOW()
        WHERE id = ${session.id}
    `;

    // Emit session start event
    await emitEvent({
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

    let abortReason: string | null = null;

    for (let turn = 0; turn < maxTurns; turn++) {
        // Select speaker
        const speaker =
            turn === 0 ?
                selectFirstSpeaker(session.participants, session.format)
            :   selectNextSpeaker({
                    participants: session.participants,
                    lastSpeaker: history[history.length - 1].speaker,
                    history,
                    affinityMap,
                    format: session.format,
                });

        const voice = getVoice(speaker);
        const speakerName = voice?.displayName ?? speaker;

        // Determine interaction type based on affinity with last speaker
        let interactionType: string | undefined;
        if (turn > 0) {
            const lastSpeaker = history[history.length - 1].speaker;
            const affinity = getAffinityFromMap(
                affinityMap,
                speaker,
                lastSpeaker,
            );
            interactionType = getInteractionType(affinity);
        }

        // Generate dialogue via LLM
        const systemPrompt = buildSystemPrompt(
            speaker,
            history,
            session.format,
            session.topic,
            interactionType,
            voiceModifiersMap.get(speaker),
            agentToolsMap.get(speaker),
        );
        const userPrompt = buildUserPrompt(
            session.topic,
            turn,
            maxTurns,
            speakerName,
            session.format,
        );

        const speakerTools = agentToolsMap.get(speaker) ?? [];

        let rawDialogue: string;
        try {
            rawDialogue = await llmGenerate({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: format.temperature,
                maxTokens: 100,
                model: session.model ?? format.defaultModel ?? undefined,
                tools: speakerTools.length > 0 ? speakerTools : undefined,
                maxToolRounds: 2,
            });
        } catch (err) {
            log.error('LLM failed during conversation', {
                error: err,
                turn,
                speaker: speakerName,
                sessionId: session.id,
            });
            abortReason = (err as Error).message;
            break;
        }

        const dialogue = sanitizeDialogue(rawDialogue, 120);

        const entry: ConversationTurnEntry = {
            speaker,
            dialogue,
            turn,
        };
        history.push(entry);

        // Store turn in database
        await sql`
            INSERT INTO ops_roundtable_turns (session_id, turn_number, speaker, dialogue, metadata)
            Values (${session.id}, ${turn}, ${speaker}, ${dialogue}, ${jsonb({ speakerName })})
        `;

        // Update session turn count
        await sql`
            UPDATE ops_roundtable_sessions
            SET turn_count = ${turn + 1}
            WHERE id = ${session.id}
        `;

        // Emit turn event
        await emitEvent({
            agent_id: speaker,
            kind: 'conversation_turn',
            title: `${speakerName}: ${dialogue}`,
            tags: ['conversation', 'turn', session.format],
            metadata: {
                sessionId: session.id,
                turn,
                dialogue,
            },
        });

        // Natural delay between turns (3-8 seconds)
        if (delayBetweenTurns && turn < maxTurns - 1) {
            const delay = 3000 + Math.random() * 5000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Determine final status — completed if we got at least 3 turns, failed otherwise
    const finalStatus =
        history.length >= 3 || !abortReason ? 'completed' : 'failed';

    await sql`
        UPDATE ops_roundtable_sessions
        SET status = ${finalStatus},
            turn_count = ${history.length},
            completed_at = NOW(),
            metadata = ${jsonb(
                abortReason ?
                    {
                        ...(session.metadata ?? {}),
                        abortReason,
                        abortedAtTurn: history.length,
                    }
                :   (session.metadata ?? {}),
            )}
        WHERE id = ${session.id}
    `;

    const speakers = [...new Set(history.map(h => h.speaker))].join(', ');

    await emitEvent({
        agent_id: 'system',
        kind:
            finalStatus === 'completed' ?
                'conversation_completed'
            :   'conversation_failed',
        title: `${session.format} ${finalStatus}: ${session.topic}`,
        summary:
            abortReason ?
                `${history.length} turns (aborted: ${abortReason})`
            :   `${history.length} turns | Speakers: ${speakers}`,
        tags: ['conversation', finalStatus, session.format],
        metadata: {
            sessionId: session.id,
            turnCount: history.length,
            speakers: [...new Set(history.map(h => h.speaker))],
            ...(abortReason ? { abortReason } : {}),
        },
    });

    // Distill memories from the conversation (best-effort, even if aborted)
    if (history.length >= 3) {
        try {
            await distillConversationMemories(
                session.id,
                history,
                session.format,
            );
        } catch (err) {
            log.error('Memory distillation failed', {
                error: err,
                sessionId: session.id,
            });
        }
    }

    return history;
}

/**
 * Enqueue a new conversation session.
 * Returns the created session ID.
 */
export async function enqueueConversation(options: {
    format: ConversationFormat;
    topic: string;
    participants: string[];
    scheduleSlot?: string;
    scheduledFor?: string;
    model?: string;
}): Promise<string> {
    const [row] = await sql<[{ id: string }]>`
        INSERT INTO ops_roundtable_sessions (format, topic, participants, status, schedule_slot, scheduled_for, model)
        VALUES (
            ${options.format},
            ${options.topic},
            ${options.participants},
            'pending',
            ${options.scheduleSlot ?? null},
            ${options.scheduledFor ?? new Date().toISOString()},
            ${options.model ?? null}
        )
        RETURNING id
    `;

    return row.id;
}

/**
 * Check the schedule and enqueue any conversations that should fire now.
 * Called by the heartbeat.
 */
export async function checkScheduleAndEnqueue(): Promise<{
    checked: boolean;
    enqueued: string | null;
}> {
    // Lazy import to avoid circular deps at module load
    const { getSlotForHour, shouldSlotFire } = await import('./schedule');
    const { getPolicy } = await import('../ops/policy');

    // Check if roundtable is enabled
    const roundtablePolicy = await getPolicy('roundtable_policy');
    if (!(roundtablePolicy.enabled as boolean)) {
        return { checked: true, enqueued: null };
    }

    // Check daily conversation limit
    const maxDaily = (roundtablePolicy.max_daily_conversations as number) ?? 5;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [{ count: todayCount }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_roundtable_sessions
        WHERE created_at >= ${todayStart.toISOString()}
    `;

    if (todayCount >= maxDaily) {
        return { checked: true, enqueued: null };
    }

    // Check current hour
    const currentHour = new Date().getUTCHours();
    const slot = getSlotForHour(currentHour);
    if (!slot) {
        return { checked: true, enqueued: null };
    }

    // Check if this slot already fired this hour (prevent duplicates)
    const hourStart = new Date();
    hourStart.setUTCMinutes(0, 0, 0);

    const [{ count: existingCount }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_roundtable_sessions
        WHERE schedule_slot = ${slot.name}
        AND created_at >= ${hourStart.toISOString()}
    `;

    if (existingCount > 0) {
        return { checked: true, enqueued: null };
    }

    // Probability check
    if (!shouldSlotFire(slot)) {
        return { checked: true, enqueued: null };
    }

    // Generate a topic based on the format
    const topic = generateTopic(slot);

    // Enqueue the conversation
    const sessionId = await enqueueConversation({
        format: slot.format,
        topic,
        participants: slot.participants,
        scheduleSlot: slot.name,
    });

    return { checked: true, enqueued: sessionId };
}

/**
 * Generate a conversation topic based on the schedule slot.
 * Each format has its own pool of provocative, personality-driven topics.
 */
function generateTopic(slot: { name: string; format: string }): string {
    const topicPools: Record<string, string[]> = {
        standup: [
            'Status check: what moved, what is stuck, what needs attention?',
            'Blockers and dependencies — who is waiting on whom?',
            'Where should our energy go today?',
            'System health: anything decaying quietly?',
            'What did we learn since yesterday that changes our priorities?',
        ],
        checkin: [
            'Quick pulse — how is everyone feeling about the work?',
            'Anything urgent that needs collective attention right now?',
            'Energy levels and capacity — who is stretched, who has space?',
        ],
        triage: [
            'New signals came in — classify and prioritize.',
            'We have more tasks than capacity. What gets cut?',
            'Something broke overnight. Assess severity and assign.',
            'Three requests from external. Which ones align with mission?',
        ],
        deep_dive: [
            'What structural problem keeps recurring and why?',
            'Trace the incentive structures behind our recent decisions.',
            'One of our core assumptions may be wrong. Which one?',
            'What system is producing outcomes nobody intended?',
            'Map the dependency chain for our most fragile process.',
        ],
        risk_review: [
            'What are we exposing that we should not be?',
            'If an adversary studied our output, what would they learn?',
            'Which of our current positions becomes dangerous if the context shifts?',
            'Threat model review: what changed since last assessment?',
            'What looks safe but is actually fragile?',
        ],
        strategy: [
            'Are we still building what we said we would build?',
            'What would we stop doing if we were honest about our resources?',
            'Where are we drifting from original intent and is that good?',
            'What decision are we avoiding that would clarify everything?',
            'Six months from now, what will we wish we had started today?',
        ],
        planning: [
            "Turn yesterday's strategy discussion into concrete tasks.",
            'Who owns what this week? Name it. Deadline it.',
            'We committed to three things. Break each into actionable steps.',
            'What needs to ship before anything else can move?',
        ],
        shipping: [
            'Is this actually ready or are we just tired of working on it?',
            'Pre-ship checklist: what can go wrong at launch?',
            'Who needs to review this before it goes live?',
            'What is the rollback plan if this fails?',
        ],
        retro: [
            'What worked better than expected and why?',
            'What failed and what do we change — not just acknowledge?',
            'Where did our process help us and where did it slow us down?',
            'What would we do differently if we started this again tomorrow?',
            'Which of our own assumptions bit us this cycle?',
        ],
        debate: [
            'Quality versus speed — where is the actual tradeoff right now?',
            'Is our content strategy serving the mission or just generating activity?',
            'Should we optimize for reach or depth?',
            'Are we building infrastructure or performing productivity?',
            'Is the current approach sustainable or are we borrowing from the future?',
        ],
        cross_exam: [
            'Stress-test our latest proposal. Find the failure mode.',
            'Play adversary: why would someone argue against what we just decided?',
            'What are we not seeing because we agree too quickly?',
            'Interrogate the assumption behind our most confident position.',
        ],
        brainstorm: [
            'Wild ideas only: what would we do with unlimited resources?',
            'What if we approached this from the completely opposite direction?',
            'Name something we dismissed too quickly. Resurrect it.',
            'What adjacent domain could teach us something about our problem?',
            'Weird combinations: pick two unrelated ideas and smash them together.',
        ],
        reframe: [
            'We are stuck. The current frame is not producing insight. Break it.',
            'What if the problem is not what we think it is?',
            'Reframe: who is the actual audience for this work?',
            'What if we removed the constraint we think is fixed?',
        ],
        writing_room: [
            'Draft session: work on the next piece collaboratively.',
            'This draft needs a stronger opening. Workshop it.',
            'Tone check: does this sound like us or like everyone else?',
            'Cut 40% from this draft without losing the argument.',
        ],
        content_review: [
            'Review recent output: does it meet our quality bar?',
            'Risk scan on published content — anything we should retract or edit?',
            'Alignment check: is our content reflecting our stated values?',
            'What are we saying that we should not be saying publicly?',
        ],
        watercooler: [
            'What is the most interesting thing you encountered this week?',
            'Random thought — no agenda, just vibes.',
            'Something that surprised you about how we work.',
            'If you could redesign one thing about our operation, what would it be?',
            'Hot take: something everyone assumes but nobody questions.',
            'What is the most underappreciated thing someone here does?',
        ],
    };

    const pool = topicPools[slot.format] ?? topicPools.standup;
    return pool[Math.floor(Math.random() * pool.length)];
}
