// Agent Session Executor — tool-augmented LLM loop
// Runs an agent session: loads voice + tools, calls LLM in a loop,
// executes tool calls, feeds results back until done or timeout.

import { sql, jsonb } from '@/lib/db';
import { llmGenerateWithTools } from '@/lib/llm/client';
import { getVoice } from '@/lib/roundtable/voices';
import { getAgentTools, getDroidTools } from './registry';
import { emitEvent } from '@/lib/ops/events';
import { queryAgentMemories } from '@/lib/ops/memory';
import { loadPrimeDirective } from '@/lib/ops/prime-directive';
import { logger } from '@/lib/logger';
import type { AgentId, LLMMessage, ToolCallRecord } from '../types';
import type { AgentSession } from './types';

const log = logger.child({ module: 'agent-session' });

/**
 * Execute an agent session: load voice, tools, and run the LLM+tools loop.
 * Updates the session row in-place as it progresses.
 */
export async function executeAgentSession(session: AgentSession): Promise<void> {
    const startTime = Date.now();
    const isDroid = session.agent_id.startsWith('droid-');
    const agentId = session.agent_id as AgentId;
    const allToolCalls: ToolCallRecord[] = [];
    let llmRounds = 0;
    let totalTokens = 0;
    let totalCost = 0;

    // Mark session as running
    await sql`
        UPDATE ops_agent_sessions
        SET status = 'running', started_at = NOW()
        WHERE id = ${session.id}
    `;

    try {
        // Load agent voice (droids don't have voices)
        const voice = isDroid ? null : getVoice(agentId);
        const voiceName = isDroid ? session.agent_id : (voice?.displayName ?? agentId);

        // Load agent tools — droids get a limited toolset with ACL-bound file_write
        const tools = isDroid
            ? getDroidTools(session.agent_id)
            : getAgentTools(agentId);

        // Load recent memories for context (skip for droids — they have no memory)
        const memories = isDroid ? [] : await queryAgentMemories({
            agentId,
            limit: 10,
            minConfidence: 0.5,
        });

        // Load recent session outputs for context injection (skip for droids)
        const recentSessions = isDroid ? [] : await sql`
            SELECT agent_id, prompt, result, completed_at
            FROM ops_agent_sessions
            WHERE source = 'cron'
            AND status = 'succeeded'
            AND completed_at > NOW() - INTERVAL '24 hours'
            AND id != ${session.id}
            ORDER BY completed_at DESC
            LIMIT 5
        `;

        // Load prime directive (best-effort — don't fail session if unavailable)
        let primeDirective = '';
        try {
            primeDirective = await loadPrimeDirective();
        } catch {
            // Prime directive unavailable — continue without it
        }

        // Build system prompt
        let systemPrompt = '';
        if (voice) {
            systemPrompt += `${voice.systemDirective}\n\n`;
        }

        if (primeDirective) {
            systemPrompt += `═══ PRIME DIRECTIVE ═══\n${primeDirective}\n\n`;
        }

        systemPrompt += `You are ${voiceName}, operating in an autonomous agent session.\n`;
        systemPrompt += `You have tools available to accomplish your task. Use them as needed.\n`;
        systemPrompt += `When your task is complete, provide a clear summary of what you accomplished.\n`;
        systemPrompt += `When producing artifacts, write them to the workspace using file_write.\n`;
        systemPrompt += `Use the naming convention: YYYY-MM-DD__<workflow>__<type>__<slug>__<agent>__v01.md\n\n`;

        if (tools.length > 0) {
            systemPrompt += `Available tools: ${tools.map(t => t.name).join(', ')}\n\n`;
        }

        if (memories.length > 0) {
            systemPrompt += `Your recent memories:\n`;
            for (const m of memories.slice(0, 5)) {
                systemPrompt += `- [${m.type}] ${m.content.slice(0, 200)}\n`;
            }
            systemPrompt += '\n';
        }

        if (recentSessions.length > 0) {
            systemPrompt += `Recent session outputs (for context):\n`;
            for (const s of recentSessions) {
                const summary = (s.result as Record<string, unknown>)?.summary
                    ?? (s.result as Record<string, unknown>)?.text
                    ?? '(no summary)';
                systemPrompt += `- [${s.agent_id}] ${String(summary).slice(0, 300)}\n`;
            }
            systemPrompt += '\n';
        }

        // The LLM+tools loop
        const messages: LLMMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: session.prompt },
        ];

        const maxRounds = session.max_tool_rounds;
        const timeoutMs = session.timeout_seconds * 1000;
        let lastText = '';

        for (let round = 0; round < maxRounds; round++) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                await completeSession(session.id, 'timed_out', {
                    summary: lastText || 'Session timed out before completing',
                    rounds: llmRounds,
                }, allToolCalls, llmRounds, totalTokens, totalCost, 'Timeout exceeded');
                return;
            }

            llmRounds++;

            const result = await llmGenerateWithTools({
                messages,
                temperature: 0.7,
                maxTokens: 2000,
                model: session.model ?? undefined,
                tools: tools.length > 0 ? tools : undefined,
                maxToolRounds: 1, // We handle the outer loop ourselves
                trackingContext: {
                    agentId,
                    context: 'agent_session',
                    sessionId: session.id,
                },
            });

            lastText = result.text;
            allToolCalls.push(...result.toolCalls);

            // If no tool calls were made, we're done
            if (result.toolCalls.length === 0) {
                break;
            }

            // Feed tool results back as assistant + user messages
            // Build a summary of tool results for the next round
            const toolSummary = result.toolCalls.map(tc => {
                const resultStr = typeof tc.result === 'string'
                    ? tc.result
                    : JSON.stringify(tc.result);
                // Cap individual tool result to avoid context explosion
                const capped = resultStr.length > 5000
                    ? resultStr.slice(0, 5000) + '... [truncated]'
                    : resultStr;
                return `Tool ${tc.name}(${JSON.stringify(tc.arguments)}):\n${capped}`;
            }).join('\n\n');

            // Add the assistant response and tool results
            if (result.text) {
                messages.push({ role: 'assistant', content: result.text });
            }
            messages.push({
                role: 'user',
                content: `Tool results:\n${toolSummary}\n\nContinue with your task. If you're done, provide a final summary.`,
            });
        }

        // Success
        await completeSession(session.id, 'succeeded', {
            text: lastText,
            summary: lastText.slice(0, 500),
            rounds: llmRounds,
        }, allToolCalls, llmRounds, totalTokens, totalCost);

        // Emit completion event
        await emitEvent({
            agent_id: agentId,
            kind: 'agent_session_completed',
            title: `${voiceName} session completed`,
            summary: lastText.slice(0, 200),
            tags: ['agent_session', 'completed', session.source],
            metadata: {
                sessionId: session.id,
                source: session.source,
                rounds: llmRounds,
                toolCalls: allToolCalls.length,
            },
        });

    } catch (err) {
        const errorMsg = (err as Error).message;
        log.error('Agent session failed', {
            error: err,
            sessionId: session.id,
            agentId,
            rounds: llmRounds,
        });

        await completeSession(session.id, 'failed', {
            error: errorMsg,
            rounds: llmRounds,
        }, allToolCalls, llmRounds, totalTokens, totalCost, errorMsg);

        await emitEvent({
            agent_id: agentId,
            kind: 'agent_session_failed',
            title: `Agent session failed: ${errorMsg.slice(0, 100)}`,
            tags: ['agent_session', 'failed', session.source],
            metadata: {
                sessionId: session.id,
                error: errorMsg,
                rounds: llmRounds,
            },
        });
    }
}

/** Update session to terminal status */
async function completeSession(
    sessionId: string,
    status: string,
    result: Record<string, unknown>,
    toolCalls: ToolCallRecord[],
    llmRounds: number,
    totalTokens: number,
    costUsd: number,
    error?: string,
): Promise<void> {
    await sql`
        UPDATE ops_agent_sessions
        SET status = ${status},
            result = ${jsonb(result)},
            tool_calls = ${jsonb(toolCalls.map(tc => ({
                name: tc.name,
                arguments: tc.arguments,
                result: typeof tc.result === 'string' ? tc.result.slice(0, 2000) : tc.result,
            })))},
            llm_rounds = ${llmRounds},
            total_tokens = ${totalTokens},
            cost_usd = ${costUsd},
            error = ${error ?? null},
            completed_at = NOW()
        WHERE id = ${sessionId}
    `;
}
