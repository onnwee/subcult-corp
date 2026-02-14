// Sanctum cross-talk — agent summoning and inter-agent responses
// Detects when agents reference each other and generates follow-up turns
import { AGENTS, isValidAgent } from '@/lib/agents';
import type { AgentId } from '@/lib/types';
import { loadAffinityMap, getAffinityFromMap } from '@/lib/ops/relationships';
import { llmGenerate } from '@/lib/llm';
import { logger } from '@/lib/logger';
import type { AgentResponse, ConversationMessage } from './agent-router';

const log = logger.child({ module: 'sanctum-crosstalk' });

// ─── Types ───

export interface SummonSignal {
    summoner: AgentId;
    target: AgentId;
    reason: string;
    context: string;
}

export interface CrossTalkResponse extends AgentResponse {
    crossTalk: true;
    replyTo: AgentId;
}

// ─── Summon Detection ───

/**
 * Detect if an agent's response summons or references another agent.
 * Uses heuristic matching on agent names and common summoning phrases.
 */
export function detectSummons(
    agentId: AgentId,
    response: string,
): SummonSignal[] {
    const signals: SummonSignal[] = [];
    const lower = response.toLowerCase();

    for (const otherId of Object.keys(AGENTS) as AgentId[]) {
        if (otherId === agentId) continue;
        const otherName = AGENTS[otherId].displayName.toLowerCase();

        // Explicit summoning phrases
        const summonPatterns = [
            new RegExp(`bring in ${otherName}`, 'i'),
            new RegExp(`ask ${otherName}`, 'i'),
            new RegExp(`${otherName},? what do you think`, 'i'),
            new RegExp(`${otherName} should weigh in`, 'i'),
            new RegExp(`let ${otherName} speak`, 'i'),
            new RegExp(`over to ${otherName}`, 'i'),
            new RegExp(`${otherName} would know`, 'i'),
            new RegExp(`need ${otherName}`, 'i'),
        ];

        for (const pattern of summonPatterns) {
            if (pattern.test(response)) {
                signals.push({
                    summoner: agentId,
                    target: otherId,
                    reason: `Explicitly referenced by ${AGENTS[agentId].displayName}`,
                    context: response.slice(0, 200),
                });
                break;
            }
        }

        // Disagreement detection — "I disagree with X" style
        const disagreementPatterns = [
            new RegExp(`disagree with ${otherName}`, 'i'),
            new RegExp(`${otherName}('s| is) wrong`, 'i'),
            new RegExp(`counter to what ${otherName}`, 'i'),
            new RegExp(`unlike ${otherName}`, 'i'),
        ];

        for (const pattern of disagreementPatterns) {
            if (pattern.test(response)) {
                signals.push({
                    summoner: agentId,
                    target: otherId,
                    reason: `Disagreement detected — ${AGENTS[otherId].displayName} should respond`,
                    context: response.slice(0, 200),
                });
                break;
            }
        }
    }

    return signals;
}

/**
 * Execute a summon — generate a response from the summoned agent.
 */
export async function executeSummon(
    summon: SummonSignal,
    conversationHistory: ConversationMessage[],
): Promise<CrossTalkResponse> {
    const startTime = Date.now();
    const target = AGENTS[summon.target];
    const summoner = AGENTS[summon.summoner];

    const systemPrompt = `You are ${target.displayName}, the ${target.role} of SubCulture.
${target.description}

═══ SUMMONING CONTEXT ═══
You were brought into this conversation by ${summoner.displayName} (${summoner.role}).
They said: "${summon.context}"
Reason you were summoned: ${summon.reason}

Respond in character. Address the point that prompted your summoning.
Be direct and concise. Under 400 characters.
Do NOT prefix your response with your name.`;

    const recentContext = conversationHistory.slice(-10);
    let contextStr = '';
    for (const msg of recentContext) {
        if (msg.role === 'user') {
            contextStr += `User: ${msg.content}\n`;
        } else {
            const name =
                msg.agentId ?
                    (AGENTS[msg.agentId as AgentId]?.displayName ?? msg.agentId)
                :   'Agent';
            contextStr += `${name}: ${msg.content}\n`;
        }
    }

    const content = await llmGenerate({
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Conversation context:\n${contextStr}\n\nRespond to being summoned.`,
            },
        ],
        temperature: 0.85,
        maxTokens: 250,
        trackingContext: {
            agentId: summon.target,
            context: 'sanctum-summon',
        },
    });

    return {
        agentId: summon.target,
        content: content || `*${target.displayName} acknowledges the summon*`,
        metadata: {
            model: 'auto',
            tokensUsed: 0,
            responseTimeMs: Date.now() - startTime,
        },
        crossTalk: true,
        replyTo: summon.summoner,
    };
}

/**
 * Generate cross-talk responses — agents reacting to each other's messages.
 * Probability-based: not every exchange triggers cross-talk.
 * Limited to 1-2 follow-ups per user message.
 */
export async function generateCrossTalk(
    originalResponses: AgentResponse[],
    userMessage: string,
    conversationHistory: ConversationMessage[],
): Promise<CrossTalkResponse[]> {
    if (originalResponses.length < 2) return [];

    const crossTalkResponses: CrossTalkResponse[] = [];
    const affinityMap = await loadAffinityMap();

    // Check each pair of responses for cross-talk opportunities
    for (
        let i = 0;
        i < originalResponses.length && crossTalkResponses.length < 2;
        i++
    ) {
        for (
            let j = i + 1;
            j < originalResponses.length && crossTalkResponses.length < 2;
            j++
        ) {
            const respA = originalResponses[i];
            const respB = originalResponses[j];
            const affinity = getAffinityFromMap(
                affinityMap,
                respA.agentId,
                respB.agentId,
            );

            // Cross-talk probability: higher when affinity is low (tension) or very high (synergy)
            const tension = Math.abs(affinity - 0.5);
            const probability = tension > 0.2 ? 0.4 : 0.15;

            if (Math.random() > probability) continue;

            // Determine who reacts to whom
            const [reactor, target] =
                affinity < 0.4 ? [respB, respA] : [respA, respB];

            const toneHint =
                affinity < 0.4 ?
                    'You disagree with or want to challenge what was said.'
                : affinity > 0.7 ?
                    'You want to build on and amplify what was said.'
                :   'You want to add a nuance or qualification.';

            const startTime = Date.now();
            const reactorAgent = AGENTS[reactor.agentId];
            const targetAgent = AGENTS[target.agentId];

            const systemPrompt = `You are ${reactorAgent.displayName}, the ${reactorAgent.role}.
${reactorAgent.description}

═══ CROSS-TALK ═══
You're responding to what ${targetAgent.displayName} just said in the Sanctum.
${targetAgent.displayName} said: "${target.content}"
${toneHint}

Be brief and pointed — this is a follow-up, not a monologue.
Under 300 characters. Do NOT prefix with your name.`;

            try {
                const content = await llmGenerate({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `The user's original question was: "${userMessage}". Respond to ${targetAgent.displayName}'s take.`,
                        },
                    ],
                    temperature: 0.9,
                    maxTokens: 200,
                    trackingContext: {
                        agentId: reactor.agentId,
                        context: 'sanctum-crosstalk',
                    },
                });

                crossTalkResponses.push({
                    agentId: reactor.agentId,
                    content: content || `*${reactorAgent.displayName} nods*`,
                    metadata: {
                        model: 'auto',
                        tokensUsed: 0,
                        responseTimeMs: Date.now() - startTime,
                    },
                    crossTalk: true,
                    replyTo: target.agentId,
                });
            } catch (err) {
                log.error('Cross-talk generation failed', {
                    error: err,
                    reactor: reactor.agentId,
                    target: target.agentId,
                });
            }
        }
    }

    return crossTalkResponses;
}
