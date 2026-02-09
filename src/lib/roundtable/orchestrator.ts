// Roundtable Orchestrator — turn-by-turn conversation generation
// The VPS worker calls this to run a conversation session
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    ConversationFormat,
    ConversationTurnEntry,
    RoundtableSession,
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

/**
 * Build the system prompt for a speaker in a conversation.
 * Includes their voice directive + conversation history so far.
 * Interaction type adjusts tone based on affinity with last speaker.
 */
function buildSystemPrompt(
    speakerId: string,
    history: ConversationTurnEntry[],
    format: ConversationFormat,
    topic: string,
    interactionType?: string,
    voiceModifiers?: string[],
): string {
    const voice = getVoice(speakerId);
    if (!voice) {
        return `You are ${speakerId}. Speak naturally and concisely.`;
    }

    let prompt = `${voice.systemDirective}\n\n`;
    prompt += `FORMAT: ${format} conversation\n`;
    prompt += `TOPIC: ${topic}\n`;
    prompt += `YOUR QUIRK: ${voice.quirk}\n`;

    if (interactionType) {
        const toneGuides: Record<string, string> = {
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
            const turnVoice = getVoice(turn.speaker);
            const name = turnVoice?.displayName ?? turn.speaker;
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

/**
 * Build the user prompt for a specific turn.
 */
function buildUserPrompt(
    topic: string,
    turn: number,
    maxTurns: number,
    speakerName: string,
): string {
    if (turn === 0) {
        return `You're opening this conversation about: "${topic}". Set the tone. Keep it under 120 characters.`;
    }

    if (turn === maxTurns - 1) {
        return `This is the final turn. Wrap up your thoughts on "${topic}" concisely. Under 120 characters.`;
    }

    return `Respond naturally as ${speakerName}. Stay on topic: "${topic}". Under 120 characters.`;
}

/**
 * Orchestrate a full conversation session.
 * Generates dialogue turn by turn, stores each turn to the database,
 * and emits events for the frontend.
 *
 * @param sb - Supabase client
 * @param session - The session record from ops_roundtable_sessions
 * @param delayBetweenTurns - ms to wait between turns (3-8s for natural feel)
 * @returns Array of conversation turns
 */
export async function orchestrateConversation(
    sb: SupabaseClient,
    session: RoundtableSession,
    delayBetweenTurns: boolean = true,
): Promise<ConversationTurnEntry[]> {
    const format = getFormat(session.format);
    const maxTurns = pickTurnCount(format);
    const history: ConversationTurnEntry[] = [];

    // Load affinity map once for the entire conversation
    const affinityMap = await loadAffinityMap(sb);

    // Derive voice modifiers once per participant (cached per conversation)
    const voiceModifiersMap = new Map<string, string[]>();
    for (const participant of session.participants) {
        try {
            const mods = await deriveVoiceModifiers(sb, participant);
            voiceModifiersMap.set(participant, mods);
        } catch (err) {
            console.error(
                `[orchestrator] Voice modifier derivation failed for ${participant}:`,
                (err as Error).message,
            );
            voiceModifiersMap.set(participant, []);
        }
    }

    // Mark session as running
    await sb
        .from('ops_roundtable_sessions')
        .update({
            status: 'running',
            started_at: new Date().toISOString(),
        })
        .eq('id', session.id);

    // Emit session start event
    await emitEvent(sb, {
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
            // Select speaker
            const speaker =
                turn === 0 ?
                    selectFirstSpeaker(session.participants, session.format)
                :   selectNextSpeaker({
                        participants: session.participants,
                        lastSpeaker: history[history.length - 1].speaker,
                        history,
                        affinityMap,
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
            );
            const userPrompt = buildUserPrompt(
                session.topic,
                turn,
                maxTurns,
                speakerName,
            );

            const rawDialogue = await llmGenerate({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: format.temperature,
                maxTokens: 100,
            });

            const dialogue = sanitizeDialogue(rawDialogue, 120);

            const entry: ConversationTurnEntry = {
                speaker,
                dialogue,
                turn,
            };
            history.push(entry);

            // Store turn in database
            await sb.from('ops_roundtable_turns').insert({
                session_id: session.id,
                turn_number: turn,
                speaker,
                dialogue,
                metadata: { speakerName },
            });

            // Update session turn count
            await sb
                .from('ops_roundtable_sessions')
                .update({ turn_count: turn + 1 })
                .eq('id', session.id);

            // Emit turn event
            await emitEvent(sb, {
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

        // Mark session as completed
        await sb
            .from('ops_roundtable_sessions')
            .update({
                status: 'completed',
                turn_count: history.length,
                completed_at: new Date().toISOString(),
            })
            .eq('id', session.id);

        // Emit completion event
        await emitEvent(sb, {
            agent_id: 'system',
            kind: 'conversation_completed',
            title: `${session.format} completed: ${session.topic}`,
            summary: `${history.length} turns | Speakers: ${[...new Set(history.map(h => h.speaker))].join(', ')}`,
            tags: ['conversation', 'completed', session.format],
            metadata: {
                sessionId: session.id,
                turnCount: history.length,
                speakers: [...new Set(history.map(h => h.speaker))],
            },
        });

        // Distill memories from the conversation (best-effort)
        try {
            await distillConversationMemories(
                sb,
                session.id,
                history,
                session.format,
            );
        } catch (err) {
            console.error(
                '[orchestrator] Memory distillation failed:',
                (err as Error).message,
            );
        }

        return history;
    } catch (err) {
        // Mark session as failed
        await sb
            .from('ops_roundtable_sessions')
            .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                metadata: {
                    ...session.metadata,
                    error: (err as Error).message,
                },
            })
            .eq('id', session.id);

        await emitEvent(sb, {
            agent_id: 'system',
            kind: 'conversation_failed',
            title: `${session.format} failed: ${session.topic}`,
            summary: (err as Error).message,
            tags: ['conversation', 'failed', session.format],
            metadata: {
                sessionId: session.id,
                error: (err as Error).message,
                turnsCompleted: history.length,
            },
        });

        throw err;
    }
}

/**
 * Enqueue a new conversation session.
 * Returns the created session ID.
 */
export async function enqueueConversation(
    sb: SupabaseClient,
    options: {
        format: ConversationFormat;
        topic: string;
        participants: string[];
        scheduleSlot?: string;
        scheduledFor?: string;
    },
): Promise<string> {
    const { data, error } = await sb
        .from('ops_roundtable_sessions')
        .insert({
            format: options.format,
            topic: options.topic,
            participants: options.participants,
            status: 'pending',
            schedule_slot: options.scheduleSlot ?? null,
            scheduled_for: options.scheduledFor ?? new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(
            `Failed to enqueue conversation: ${error?.message ?? 'unknown'}`,
        );
    }

    return data.id;
}

/**
 * Check the schedule and enqueue any conversations that should fire now.
 * Called by the heartbeat.
 */
export async function checkScheduleAndEnqueue(
    sb: SupabaseClient,
): Promise<{ checked: boolean; enqueued: string | null }> {
    // Lazy import to avoid circular deps at module load
    const { getSlotForHour, shouldSlotFire } = await import('./schedule');
    const { getPolicy } = await import('../ops/policy');

    // Check if roundtable is enabled
    const roundtablePolicy = await getPolicy(sb, 'roundtable_policy');
    if (!(roundtablePolicy.enabled as boolean)) {
        return { checked: true, enqueued: null };
    }

    // Check daily conversation limit
    const maxDaily = (roundtablePolicy.max_daily_conversations as number) ?? 5;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: todayCount } = await sb
        .from('ops_roundtable_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());

    if ((todayCount ?? 0) >= maxDaily) {
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

    const { count: existingCount } = await sb
        .from('ops_roundtable_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_slot', slot.name)
        .gte('created_at', hourStart.toISOString());

    if ((existingCount ?? 0) > 0) {
        return { checked: true, enqueued: null };
    }

    // Probability check
    if (!shouldSlotFire(slot)) {
        return { checked: true, enqueued: null };
    }

    // Generate a topic based on the format
    const topic = generateTopic(slot);

    // Enqueue the conversation
    const sessionId = await enqueueConversation(sb, {
        format: slot.format,
        topic,
        participants: slot.participants,
        scheduleSlot: slot.name,
    });

    return { checked: true, enqueued: sessionId };
}

/**
 * Generate a conversation topic based on the schedule slot.
 */
function generateTopic(slot: { name: string; format: string }): string {
    const topicPools: Record<string, string[]> = {
        standup: [
            'What are our priorities today?',
            'Any blockers or risks we should address?',
            'What did we accomplish since last standup?',
            'Where should we focus our energy?',
            'System health and next steps',
        ],
        debate: [
            'Should we prioritize quality or speed?',
            'Is our current approach sustainable?',
            'What are we missing in our analysis?',
            'Should we change our content strategy?',
            'How can we improve our signal-to-noise ratio?',
        ],
        watercooler: [
            'What interesting patterns have you noticed lately?',
            'Any wild ideas worth exploring?',
            'What surprised you recently?',
            'If we could do one thing differently, what would it be?',
            'Random thought of the day',
        ],
    };

    const pool = topicPools[slot.format] ?? topicPools.standup;
    return pool[Math.floor(Math.random() * pool.length)];
}
