// Unified Worker — single process that handles all background queues
// Replaces: roundtable-worker, mission-worker, initiative-worker
// Adds: agent-session queue (cron-triggered tool-augmented sessions)
//
// Imports directly from src/lib/ — no more 4,000 lines of duplicated code.
//
// Run: node scripts/unified-worker/dist/index.js

import 'dotenv/config';
import postgres from 'postgres';
import { orchestrateConversation } from '../../src/lib/roundtable/orchestrator';
import { executeAgentSession } from '../../src/lib/tools/agent-session';
import { createLogger } from '../../src/lib/logger';
import type { RoundtableSession } from '../../src/lib/types';
import type { AgentSession } from '../../src/lib/tools/types';

const log = createLogger({ service: 'unified-worker' });

// ─── Config ───

const WORKER_ID = `unified-${process.pid}`;

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
    log.fatal('Missing OPENROUTER_API_KEY');
    process.exit(1);
}

// Direct DB connection for queue polling (separate from the app's pool)
const sql = postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
});

// ─── Queue handlers ───

/** Poll and process pending agent sessions (highest priority) */
async function pollAgentSessions(): Promise<boolean> {
    const [session] = await sql<AgentSession[]>`
        UPDATE ops_agent_sessions
        SET status = 'running', started_at = NOW()
        WHERE id = (
            SELECT id FROM ops_agent_sessions
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `;

    if (!session) return false;

    log.info('Processing agent session', {
        sessionId: session.id,
        agent: session.agent_id,
        source: session.source,
    });

    try {
        await executeAgentSession(session);

        // Post artifact to Discord if this was a conversation synthesis session
        if (session.source === 'conversation' && session.source_id) {
            try {
                const { postArtifactToDiscord } =
                    await import('../../src/lib/discord/roundtable');
                // Read the completed session to get the result text
                const [completed] = await sql<
                    [{ result: Record<string, unknown> | null }]
                >`
                    SELECT result FROM ops_agent_sessions WHERE id = ${session.id}
                `;
                const artifactText =
                    (completed?.result as Record<string, string>)?.text ??
                    (completed?.result as Record<string, string>)?.output ??
                    '';
                if (artifactText) {
                    await postArtifactToDiscord(
                        session.source_id,
                        '',
                        artifactText,
                    );
                }
            } catch {
                // Non-fatal — Discord posting should never stall the worker
            }
        }
    } catch (err) {
        log.error('Agent session execution failed', {
            error: err,
            sessionId: session.id,
        });
        await sql`
            UPDATE ops_agent_sessions
            SET status = 'failed',
                error = ${(err as Error).message},
                completed_at = NOW()
            WHERE id = ${session.id}
        `;
    }

    return true;
}

/** Poll and process pending roundtable conversations */
async function pollRoundtables(): Promise<boolean> {
    const rows = await sql<RoundtableSession[]>`
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

    const session = rows[0];
    if (!session) return false;

    // Reset to pending so orchestrateConversation can set it properly
    await sql`
        UPDATE ops_roundtable_sessions
        SET status = 'pending'
        WHERE id = ${session.id}
    `;

    log.info('Processing roundtable', {
        sessionId: session.id,
        format: session.format,
        topic: session.topic.slice(0, 80),
    });

    try {
        await orchestrateConversation(session, true);

        // Content Pipeline: extract content from writing_room sessions
        if (session.format === 'writing_room') {
            try {
                const { extractContentFromSession } =
                    await import('../../src/lib/ops/content-pipeline');
                const draftId = await extractContentFromSession(session.id);
                if (draftId) {
                    log.info('Content draft extracted from writing_room', {
                        sessionId: session.id,
                        draftId,
                    });
                }
            } catch (extractErr) {
                // Non-fatal — content extraction should never stall the worker
                log.error('Content extraction failed (non-fatal)', {
                    error: extractErr,
                    sessionId: session.id,
                });
            }
        }

        // Content Pipeline: process review results from content_review sessions
        if (session.format === 'content_review') {
            try {
                const { processReviewSession } =
                    await import('../../src/lib/ops/content-pipeline');
                await processReviewSession(session.id);
                log.info('Content review processed', { sessionId: session.id });
            } catch (reviewErr) {
                // Non-fatal — review processing should never stall the worker
                log.error('Content review processing failed (non-fatal)', {
                    error: reviewErr,
                    sessionId: session.id,
                });
            }
        }

        // Governance: extract votes from debate sessions tied to a governance proposal
        const proposalId = (session.metadata as Record<string, unknown>)
            ?.governance_proposal_id as string | undefined;
        if (session.format === 'debate' && proposalId) {
            try {
                const { castGovernanceVote } =
                    await import('../../src/lib/ops/governance');
                const { llmGenerate } =
                    await import('../../src/lib/llm/client');

                // Fetch the debate turns
                const turns = await sql<
                    Array<{ agent_id: string; dialogue: string }>
                >`
                    SELECT agent_id, dialogue FROM ops_roundtable_turns
                    WHERE session_id = ${session.id}
                    ORDER BY turn_number ASC
                `;

                if (turns.length > 0) {
                    // Build a transcript for LLM parsing
                    const transcript = turns
                        .map(t => `${t.agent_id}: ${t.dialogue}`)
                        .join('\n\n');

                    const parseResult = await llmGenerate({
                        messages: [
                            {
                                role: 'system',
                                content:
                                    "You extract each participant's final position from a governance debate. " +
                                    'Return ONLY valid JSON — an array of objects, one per unique participant. ' +
                                    'Each object: { "agent": "<agent_id>", "vote": "approve" | "reject", "reason": "<1-sentence summary>" }',
                            },
                            {
                                role: 'user',
                                content: `Extract the final position of each participant in this debate:\n\n${transcript}`,
                            },
                        ],
                        temperature: 0.2,
                        maxTokens: 800,
                        trackingContext: {
                            agentId: 'system',
                            context: 'governance-vote-extraction',
                        },
                    });

                    // Parse the JSON response
                    const jsonMatch = parseResult.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        const votes = JSON.parse(jsonMatch[0]) as Array<{
                            agent: string;
                            vote: 'approve' | 'reject';
                            reason: string;
                        }>;

                        for (const v of votes) {
                            if (
                                v.agent &&
                                (v.vote === 'approve' || v.vote === 'reject')
                            ) {
                                await castGovernanceVote(
                                    proposalId,
                                    v.agent,
                                    v.vote,
                                    v.reason ?? '',
                                );
                            }
                        }

                        log.info('Governance votes extracted from debate', {
                            sessionId: session.id,
                            proposalId,
                            voteCount: votes.length,
                        });
                    }
                }
            } catch (govErr) {
                // Non-fatal — governance vote extraction should never stall the worker
                log.error('Governance vote extraction failed (non-fatal)', {
                    error: govErr,
                    sessionId: session.id,
                    proposalId,
                });
            }
        }

        // Rebellion: resolve rebellion if cross-exam about a rebelling agent completed
        const rebellionAgentId = (session.metadata as Record<string, unknown>)
            ?.rebellion_agent_id as string | undefined;
        if (session.format === 'cross_exam' && rebellionAgentId) {
            try {
                const { endRebellion, isAgentRebelling } =
                    await import('../../src/lib/ops/rebellion');
                const stillRebelling = await isAgentRebelling(rebellionAgentId);
                if (stillRebelling) {
                    await endRebellion(
                        rebellionAgentId,
                        'cross_exam_completed',
                    );
                    log.info('Rebellion resolved via cross-exam', {
                        sessionId: session.id,
                        rebellionAgentId,
                    });
                }
            } catch (rebellionErr) {
                // Non-fatal — rebellion resolution should never stall the worker
                log.error(
                    'Rebellion resolution from cross-exam failed (non-fatal)',
                    {
                        error: rebellionErr,
                        sessionId: session.id,
                        rebellionAgentId,
                    },
                );
            }
        }
    } catch (err) {
        log.error('Roundtable orchestration failed', {
            error: err,
            sessionId: session.id,
        });
    }

    return true;
}

/** Poll and process queued mission steps — routes through agent sessions for tool access */
async function pollMissionSteps(): Promise<boolean> {
    // Find a queued step whose dependencies (if any) have all succeeded
    const [step] = await sql`
        UPDATE ops_mission_steps
        SET status = 'running',
            reserved_by = ${WORKER_ID},
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = (
            SELECT s.id FROM ops_mission_steps s
            WHERE s.status = 'queued'
            AND NOT EXISTS (
                SELECT 1 FROM ops_mission_steps dep
                WHERE dep.id = ANY(s.depends_on)
                AND dep.status != 'succeeded'
            )
            ORDER BY s.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `;

    if (!step) return false;

    log.info('Processing mission step', {
        stepId: step.id,
        kind: step.kind,
        missionId: step.mission_id,
    });

    try {
        // Load mission context
        const [mission] = await sql`
            SELECT title, created_by FROM ops_missions WHERE id = ${step.mission_id}
        `;

        // Use assigned_agent if set, otherwise fall back to mission creator
        const agentId = step.assigned_agent ?? mission?.created_by ?? 'mux';

        const { emitEvent } = await import('../../src/lib/ops/events');
        const { buildStepPrompt } =
            await import('../../src/lib/ops/step-prompts');

        // Build a tool-aware prompt for this step kind (with template version tracking)
        const { prompt, templateVersion } = await buildStepPrompt(
            step.kind,
            {
                missionTitle: mission?.title ?? 'Unknown',
                agentId,
                payload: step.payload ?? {},
                outputPath: step.output_path ?? undefined,
            },
            { withVersion: true },
        );

        // Record template version on the step for outcome tracking
        if (templateVersion != null) {
            await sql`
                UPDATE ops_mission_steps
                SET template_version = ${templateVersion}
                WHERE id = ${step.id}
            `;
        }

        // Grant temporary write access if the step writes outside base ACLs
        if (step.output_path) {
            const outputPrefix =
                step.output_path.endsWith('/') ?
                    step.output_path
                :   step.output_path + '/';
            try {
                await sql`
                    INSERT INTO ops_acl_grants (agent_id, path_prefix, source, source_id, expires_at)
                    VALUES (${agentId}, ${outputPrefix}, 'mission', ${step.mission_id}::uuid, NOW() + INTERVAL '4 hours')
                `;
            } catch (grantErr) {
                log.warn('Failed to create ACL grant for step', {
                    error: grantErr,
                    agentId,
                    outputPath: step.output_path,
                });
            }
        }

        // Create an agent session so the step gets full tool access
        const [session] = await sql`
            INSERT INTO ops_agent_sessions (
                agent_id, prompt, source, source_id,
                timeout_seconds, max_tool_rounds, status
            ) VALUES (
                ${agentId},
                ${prompt},
                'mission',
                ${step.mission_id},
                120,
                10,
                'pending'
            )
            RETURNING id
        `;

        // Mark step with the agent session reference
        await sql`
            UPDATE ops_mission_steps
            SET result = ${sql.json({ agent_session_id: session.id, agent: agentId })}::jsonb,
                updated_at = NOW()
            WHERE id = ${step.id}
        `;

        // Keep the step in 'running' status until the agent session completes.
        // The step will be finalized by a separate process that monitors agent sessions,
        // or can be manually updated based on the session result.
        // This prevents downstream steps from starting before the session completes.

        await emitEvent({
            agent_id: agentId,
            kind: 'step_dispatched',
            title: `Step dispatched to agent session: ${step.kind}`,
            tags: ['mission', 'step', 'dispatched'],
            metadata: {
                missionId: step.mission_id,
                stepId: step.id,
                kind: step.kind,
                agentSessionId: session.id,
            },
        });

        // Note: Do NOT call finalizeMissionIfComplete here since the step is still running
    } catch (err) {
        log.error('Mission step failed', { error: err, stepId: step.id });

        // Get the agent session ID if it was created before the error
        const stepData = await sql<Array<{ result: Record<string, unknown> }>>`
            SELECT result FROM ops_mission_steps WHERE id = ${step.id}
        `;
        const agentSessionId = (stepData[0]?.result as Record<string, unknown>)
            ?.agent_session_id as string | undefined;

        await sql`
            UPDATE ops_mission_steps
            SET status = 'failed',
                failure_reason = ${(err as Error).message},
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${step.id}
        `;

        // Ensure any agent session created for this step is not left pending
        if (agentSessionId) {
            await sql`
                UPDATE ops_agent_sessions
                SET status = 'failed',
                    error = ${(err as Error).message},
                    completed_at = NOW()
                WHERE id = ${agentSessionId}
                  AND status = 'pending'
            `;
        }

        await finalizeMissionIfComplete(step.mission_id);
    }

    return true;
}

/** Finalize mission steps based on their agent session status */
async function finalizeMissionSteps(): Promise<boolean> {
    // Find running steps with their associated agent session status in a single query
    const steps = await sql<
        Array<{
            id: string;
            mission_id: string;
            session_status: string | null;
            session_error: string | null;
        }>
    >`
        SELECT
            s.id,
            s.mission_id,
            sess.status as session_status,
            sess.error as session_error
        FROM ops_mission_steps s
        LEFT JOIN ops_agent_sessions sess ON sess.id = (s.result->>'agent_session_id')::uuid
        WHERE s.status = 'running'
        AND s.result->>'agent_session_id' IS NOT NULL
    `;

    if (steps.length === 0) return false;

    let finalized = 0;
    for (const step of steps) {
        // Skip if session not found or still running/pending
        if (!step.session_status) continue;

        if (step.session_status === 'succeeded') {
            await sql`
                UPDATE ops_mission_steps
                SET status = 'succeeded',
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${step.id}
            `;
            finalized++;
            await finalizeMissionIfComplete(step.mission_id);
        } else if (step.session_status === 'failed') {
            await sql`
                UPDATE ops_mission_steps
                SET status = 'failed',
                    failure_reason = ${step.session_error ?? 'Agent session failed'},
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${step.id}
            `;
            finalized++;
            await finalizeMissionIfComplete(step.mission_id);
        }
        // If still running/pending, leave it alone
    }

    return finalized > 0;
}

/** Poll and process pending initiatives */
async function pollInitiatives(): Promise<boolean> {
    const [entry] = await sql`
        UPDATE ops_initiative_queue
        SET status = 'processing'
        WHERE id = (
            SELECT id FROM ops_initiative_queue
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `;

    if (!entry) return false;

    log.info('Processing initiative', {
        entryId: entry.id,
        agent: entry.agent_id,
    });

    try {
        // ─── Agent Design Proposal (Phase 14) ───
        // If the initiative context specifies agent_design_proposal action,
        // delegate to the agent-designer module instead of generic initiative flow.
        const initiativeAction = (entry.context as Record<string, unknown>)
            ?.action;
        if (initiativeAction === 'agent_design_proposal') {
            log.info('Processing agent design proposal', {
                entryId: entry.id,
                agent: entry.agent_id,
            });
            const { generateAgentProposal } =
                await import('../../src/lib/ops/agent-designer');
            const proposal = await generateAgentProposal(entry.agent_id);
            await sql`
                UPDATE ops_initiative_queue
                SET status = 'completed',
                    processed_at = NOW(),
                    result = ${sql.json({
                        type: 'agent_design_proposal',
                        proposalId: proposal.id,
                        agentName: proposal.agent_name,
                    })}::jsonb
                WHERE id = ${entry.id}
            `;
            return true;
        }

        // ─── Memory Archaeology (Phase 15) ───
        if (initiativeAction === 'memory_archaeology') {
            log.info('Processing memory archaeology dig', {
                entryId: entry.id,
                agent: entry.agent_id,
            });
            const { performDig } =
                await import('../../src/lib/ops/memory-archaeology');
            const maxMemories =
                ((entry.context as Record<string, unknown>)
                    ?.max_memories as number) ?? 100;

            // Rotate agents: cycle through agents with memories
            const agentRows = await sql<{ agent_id: string }[]>`
                SELECT DISTINCT agent_id FROM ops_agent_memory
                WHERE superseded_by IS NULL
                ORDER BY agent_id
            `;
            const agentIds = agentRows.map(r => r.agent_id);
            const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
            const targetAgent =
                agentIds.length > 0 ?
                    agentIds[weekNumber % agentIds.length]
                :   entry.agent_id;

            const result = await performDig({
                agent_id: targetAgent,
                max_memories: maxMemories,
            });
            await sql`
                UPDATE ops_initiative_queue
                SET status = 'completed',
                    processed_at = NOW(),
                    result = ${sql.json({
                        type: 'memory_archaeology',
                        dig_id: result.dig_id,
                        finding_count: result.findings.length,
                        memories_analyzed: result.memories_analyzed,
                        target_agent: targetAgent,
                    })}::jsonb
                WHERE id = ${entry.id}
            `;
            return true;
        }

        const { llmGenerate } = await import('../../src/lib/llm/client');
        const { getVoice } = await import('../../src/lib/roundtable/voices');

        const voice = getVoice(entry.agent_id);
        const memories = entry.context?.memories ?? [];

        const systemPrompt =
            voice ?
                `${voice.systemDirective}\n\nYou are generating a mission proposal based on your accumulated knowledge and observations.`
            :   `You are ${entry.agent_id}. Generate a mission proposal.`;

        let memoryContext = '';
        if (Array.isArray(memories) && memories.length > 0) {
            memoryContext =
                '\n\nYour recent memories:\n' +
                (memories as Array<{ content: string; type: string }>)
                    .slice(0, 10)
                    .map(m => `- [${m.type}] ${m.content}`)
                    .join('\n');
        }

        const userPrompt = `Based on your role, personality, and accumulated experience, propose a mission.${memoryContext}\n\nRespond with:\n1. A clear mission title\n2. A brief description of why this matters\n3. 2-4 concrete steps to accomplish it\n\nFormat as JSON: { "title": "...", "description": "...", "steps": [{ "kind": "...", "payload": {} }] }`;

        const result = await llmGenerate({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.8,
            maxTokens: 1000,
            trackingContext: {
                agentId: entry.agent_id,
                context: 'initiative',
            },
        });

        // Try to parse the JSON response
        let parsed;
        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
            parsed = null;
        }

        if (parsed?.title) {
            // Create proposal via direct DB insert
            await sql`
                INSERT INTO ops_mission_proposals (
                    agent_id, title, description, proposed_steps,
                    source, auto_approved
                ) VALUES (
                    ${entry.agent_id},
                    ${parsed.title},
                    ${parsed.description ?? ''},
                    ${sql.json(parsed.steps ?? [])}::jsonb,
                    'initiative',
                    false
                )
            `;
        }

        await sql`
            UPDATE ops_initiative_queue
            SET status = 'completed',
                processed_at = NOW(),
                result = ${sql.json({ text: result, parsed })}::jsonb
            WHERE id = ${entry.id}
        `;
    } catch (err) {
        log.error('Initiative processing failed', {
            error: err,
            entryId: entry.id,
        });
        await sql`
            UPDATE ops_initiative_queue
            SET status = 'failed',
                processed_at = NOW(),
                result = ${sql.json({ error: (err as Error).message })}::jsonb
            WHERE id = ${entry.id}
        `;
    }

    return true;
}

/** Check if all steps in a mission are done, finalize if so */
async function finalizeMissionIfComplete(missionId: string): Promise<void> {
    const [counts] = await sql<
        [{ total: number; succeeded: number; failed: number }]
    >`
        SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int as succeeded,
            COUNT(*) FILTER (WHERE status = 'failed')::int as failed
        FROM ops_mission_steps
        WHERE mission_id = ${missionId}
    `;

    if (!counts || counts.total === 0) return;

    const allDone = counts.succeeded + counts.failed === counts.total;
    if (!allDone) return;

    const finalStatus = counts.failed > 0 ? 'failed' : 'succeeded';
    const failReason =
        counts.failed > 0 ?
            `${counts.failed} of ${counts.total} steps failed`
        :   null;

    await sql`
        UPDATE ops_missions
        SET status = ${finalStatus},
            failure_reason = ${failReason},
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${missionId}
        AND status = 'running'
    `;
}

// ─── Main poll loop ───

let running = true;

async function pollLoop(): Promise<void> {
    while (running) {
        try {
            // Agent sessions — highest priority, check every loop
            const hadSession = await pollAgentSessions();
            if (hadSession) continue; // Process back-to-back sessions

            // Roundtables — check every loop (they have natural delays between turns)
            await pollRoundtables();

            // Mission steps — check every other loop
            await pollMissionSteps();

            // Finalize mission steps based on agent session completion
            await finalizeMissionSteps();

            // Initiatives — check every other loop
            await pollInitiatives();
        } catch (err) {
            log.error('Poll loop error', { error: err });
        }

        // Wait 15 seconds between polls
        await new Promise(resolve => setTimeout(resolve, 15_000));
    }
}

// ─── Graceful shutdown ───

function shutdown(signal: string): void {
    log.info(`Received ${signal}, shutting down...`);
    running = false;
    // Give in-flight work 30s to complete
    setTimeout(() => {
        log.warn('Forced shutdown after 30s timeout');
        process.exit(1);
    }, 30_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Entry point ───

log.info('Unified worker started', {
    workerId: WORKER_ID,
    database: !!process.env.DATABASE_URL,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    ollama: process.env.OLLAMA_BASE_URL || 'disabled',
    braveSearch: !!process.env.BRAVE_API_KEY,
});

pollLoop()
    .then(() => {
        log.info('Worker stopped');
        process.exit(0);
    })
    .catch(err => {
        log.fatal('Fatal error', { error: err });
        process.exit(1);
    });
