// Initiative Worker — VPS process that polls for queued initiatives
// and uses LLM to generate proposals from agent memories.
//
// Run: node scripts/initiative-worker/worker.mjs
//
// Environment variables required:
//   DATABASE_URL
//   OPENROUTER_API_KEY, LLM_MODEL (optional)
//   CRON_SECRET (optional, for authenticated API calls)

import postgres from 'postgres';
import { OpenRouter, ToolType } from '@openrouter/sdk';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';
dotenv.config({ path: '.env.local' });

const log = createLogger({ service: 'initiative-worker' });

// ─── Config ───

const POLL_INTERVAL_MS = 60_000; // 60 seconds

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL environment variable');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'openrouter/auto';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

if (!OPENROUTER_API_KEY) {
    log.fatal('Missing OPENROUTER_API_KEY environment variable');
    process.exit(1);
}

const openrouter = new OpenRouter({ apiKey: OPENROUTER_API_KEY });

// ─── OpenClaw Gateway Bridge ───

const OPENCLAW_GATEWAY_URL =
    process.env.OPENCLAW_GATEWAY_URL ?? 'http://localhost:3579';
const OPENCLAW_AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN ?? '';
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS) || 30_000;

let openclawAvailable = false;
let lastHealthCheck = 0;

async function checkGatewayHealth() {
    const now = Date.now();
    if (now - lastHealthCheck < 60_000) return openclawAvailable;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5_000);
        const response = await fetch(
            `${OPENCLAW_GATEWAY_URL}/v1/chat/completions`,
            {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(OPENCLAW_AUTH_TOKEN ?
                        { Authorization: `Bearer ${OPENCLAW_AUTH_TOKEN}` }
                    :   {}),
                },
                body: JSON.stringify({
                    model: 'openclaw',
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 1,
                }),
            },
        );
        clearTimeout(timeoutId);
        openclawAvailable = response.ok;
    } catch {
        openclawAvailable = false;
    }
    lastHealthCheck = now;
    return openclawAvailable;
}

async function executeSkill(skillId, params) {
    const startTime = Date.now();
    const isAvailable = await checkGatewayHealth();

    if (!isAvailable) {
        return {
            success: false,
            skillId,
            output: {
                message: `OpenClaw gateway unavailable. Skill "${skillId}" cannot execute.`,
                fallback: true,
            },
            error: 'Gateway unavailable',
            durationMs: Date.now() - startTime,
        };
    }

    const paramSummary = Object.entries(params)
        .map(
            ([k, v]) =>
                `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
        )
        .join('\n');

    const prompt = `Use the "${skillId}" skill with these parameters:\n${paramSummary}\n\nReturn the skill output directly, no extra commentary.`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            OPENCLAW_TIMEOUT_MS,
        );

        const response = await fetch(
            `${OPENCLAW_GATEWAY_URL}/v1/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(OPENCLAW_AUTH_TOKEN ?
                        { Authorization: `Bearer ${OPENCLAW_AUTH_TOKEN}` }
                    :   {}),
                },
                body: JSON.stringify({
                    model: 'openclaw',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 2000,
                }),
                signal: controller.signal,
            },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorBody = await response
                .text()
                .catch(() => 'Unknown error');
            return {
                success: false,
                skillId,
                output: { message: `Skill "${skillId}" failed: ${errorBody}` },
                error: `HTTP ${response.status}: ${errorBody}`,
                durationMs: Date.now() - startTime,
            };
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content?.trim() ?? '';
        return {
            success: true,
            skillId,
            output: { text: content },
            durationMs: Date.now() - startTime,
        };
    } catch (error) {
        const isTimeout = error?.name === 'AbortError';
        return {
            success: false,
            skillId,
            output: {
                message:
                    isTimeout ?
                        `Skill "${skillId}" timed out`
                    :   `Skill "${skillId}" failed: ${error?.message ?? 'unknown'}`,
            },
            error:
                isTimeout ?
                    `Timeout after ${OPENCLAW_TIMEOUT_MS}ms`
                :   (error?.message ?? 'unknown'),
            durationMs: Date.now() - startTime,
        };
    }
}

// ─── Initiative-relevant tools ───

function buildToolDef(name, description, parameters, skillId) {
    return {
        type: ToolType.Function,
        function: {
            name,
            description,
            parameters,
            execute: async params => executeSkill(skillId, params),
        },
    };
}

const INITIATIVE_TOOLS = {
    chora: [
        buildToolDef(
            'deep_research',
            'Multi-step research and analysis on a complex topic.',
            {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Research question or topic',
                    },
                    depth: {
                        type: 'string',
                        enum: ['shallow', 'medium', 'deep'],
                    },
                },
                required: ['query'],
            },
            'deep-research',
        ),
        buildToolDef(
            'web_search',
            'Search the web for current information.',
            {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
            },
            'exa-web-search-free',
        ),
        buildToolDef(
            'reflect_learn',
            'Analyze past actions/outcomes to identify patterns.',
            {
                type: 'object',
                properties: {
                    topic: {
                        type: 'string',
                        description: 'Topic to reflect on',
                    },
                },
                required: ['topic'],
            },
            'reflect-learn',
        ),
    ],
    subrosa: [
        buildToolDef(
            'security_audit',
            'Run a security audit on workspace.',
            {
                type: 'object',
                properties: {
                    scope: {
                        type: 'string',
                        enum: [
                            'full',
                            'credentials',
                            'permissions',
                            'services',
                        ],
                    },
                },
                required: [],
            },
            'security-audit',
        ),
    ],
    thaum: [
        buildToolDef(
            'thinking_partner',
            'Brainstorm and develop ideas collaboratively.',
            {
                type: 'object',
                properties: {
                    prompt: {
                        type: 'string',
                        description: 'Idea to think through',
                    },
                    mode: {
                        type: 'string',
                        enum: ['brainstorm', 'challenge', 'refine', 'expand'],
                    },
                },
                required: ['prompt'],
            },
            'thinking-partner',
        ),
    ],
    praxis: [
        buildToolDef(
            'git_operation',
            'Execute git operations.',
            {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        enum: [
                            'status',
                            'diff',
                            'commit',
                            'push',
                            'branch',
                            'log',
                        ],
                    },
                    args: { type: 'string' },
                },
                required: ['operation'],
            },
            'git-essentials',
        ),
    ],
    mux: [],
};

// ─── Agent Config (must match src/lib/agents.ts) ───

const AGENTS = {
    chora: {
        id: 'chora',
        displayName: 'Chora',
        role: 'Analyst',
        description:
            'Makes systems legible. Diagnoses structure, exposes assumptions, traces causality.',
    },
    subrosa: {
        id: 'subrosa',
        displayName: 'Subrosa',
        role: 'Protector',
        description:
            'Preserves agency under asymmetry. Evaluates risk, protects optionality.',
    },
    thaum: {
        id: 'thaum',
        displayName: 'Thaum',
        role: 'Innovator',
        description:
            'Restores motion when thought stalls. Disrupts self-sealing explanations, reframes problems.',
    },
    praxis: {
        id: 'praxis',
        displayName: 'Praxis',
        role: 'Executor',
        description:
            'Ends deliberation responsibly. Chooses among viable paths, translates intent to action.',
    },
    mux: {
        id: 'mux',
        displayName: 'Mux',
        role: 'Dispatcher',
        description:
            'Pure dispatcher with no personality. Classifies tasks and routes to appropriate agent.',
    },
};

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

// ─── LLM Client ───

async function llmGenerate(messages, temperature = 0.7, tools = null) {
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const callOptions = {
        model: LLM_MODEL,
        ...(systemMessage ? { instructions: systemMessage.content } : {}),
        input: conversationMessages.map(m => ({
            role: m.role,
            content: m.content,
        })),
        temperature,
        maxOutputTokens: 600,
    };

    // TODO: Tools disabled — OpenRouter SDK expects Zod schemas, not JSON Schema objects.
    // Re-enable once we add Zod conversion or when OpenClaw gateway is live.
    // if (tools && tools.length > 0) {
    //     callOptions.tools = tools;
    //     callOptions.maxToolRounds = 3;
    // }

    const result = openrouter.callModel(callOptions);

    const text = await result.getText();
    return text?.trim() ?? '';
}

// ─── Initiative Processing ───

function buildInitiativePrompt(agentId, agent, memories) {
    const memorySummary = memories
        .map(m => `- [${m.type}] (${m.confidence}) ${m.content}`)
        .join('\n');

    return `You are ${agent.displayName}, a ${agent.role}. ${agent.description}

Based on your accumulated knowledge and observations, propose ONE actionable initiative.

YOUR MEMORIES:
${memorySummary}

VALID STEP KINDS:
${VALID_STEP_KINDS.map(k => `- ${k}`).join('\n')}

RULES:
- Propose exactly ONE initiative with a clear title and description
- Include 1-3 concrete steps (each with a step_kind from the list above)
- The initiative should be grounded in your memories — reference specific insights
- Keep the title under 100 characters
- Keep the description under 300 characters
- Each step should have a brief payload description

Respond with a JSON object (no markdown, no explanation):
{
  "title": "Initiative title",
  "description": "Why this initiative matters, referencing your observations",
  "steps": [
    {
      "kind": "research_topic",
      "payload": { "description": "What to research and why" }
    }
  ]
}`;
}

async function processInitiative(entry) {
    const agentId = entry.agent_id;
    const agent = AGENTS[agentId];

    if (!agent) {
        log.error('Unknown agent', { agentId });
        await failEntry(entry.id, `Unknown agent: ${agentId}`);
        return;
    }

    log.info('Processing initiative', {
        agent: agent.displayName,
        entryId: entry.id,
    });

    const memories = entry.context?.memories ?? [];
    if (memories.length === 0) {
        log.warn('No memories in context');
        await failEntry(entry.id, 'No memories in context');
        return;
    }

    const prompt = buildInitiativePrompt(agentId, agent, memories);
    let rawResponse;
    try {
        // Get agent-specific tools for initiative generation
        const agentTools = INITIATIVE_TOOLS[agentId] ?? [];

        rawResponse = await llmGenerate(
            [
                {
                    role: 'system',
                    content:
                        'You are an AI agent generating a structured proposal based on your accumulated knowledge. You have access to tools that can help you research and validate your ideas. Output valid JSON only.',
                },
                { role: 'user', content: prompt },
            ],
            0.7,
            agentTools.length > 0 ? agentTools : null,
        );
    } catch (err) {
        log.error('LLM generation failed', { error: err });
        await failEntry(entry.id, `LLM error: ${err.message}`);
        return;
    }

    let proposal;
    try {
        let jsonStr = rawResponse.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr
                .replace(/^```(?:json)?\n?/, '')
                .replace(/\n?```$/, '');
        }
        proposal = JSON.parse(jsonStr);
    } catch {
        log.warn('Failed to parse LLM response as JSON');
        await failEntry(entry.id, 'Failed to parse LLM proposal');
        return;
    }

    if (
        !proposal.title ||
        !proposal.steps ||
        !Array.isArray(proposal.steps) ||
        proposal.steps.length === 0
    ) {
        log.warn('Invalid proposal structure');
        await failEntry(entry.id, 'Invalid proposal structure from LLM');
        return;
    }

    const proposedSteps = proposal.steps
        .filter(s => s && VALID_STEP_KINDS.includes(s.kind))
        .slice(0, 3)
        .map(s => ({
            kind: s.kind,
            payload: typeof s.payload === 'object' ? s.payload : {},
        }));

    if (proposedSteps.length === 0) {
        log.warn('No valid steps in proposal');
        await failEntry(entry.id, 'No valid steps in LLM proposal');
        return;
    }

    const proposalPayload = {
        agent_id: agentId,
        title: proposal.title.substring(0, 100),
        description: (proposal.description ?? '').substring(0, 300),
        proposed_steps: proposedSteps,
        source: 'initiative',
        source_trace_id: `initiative:${entry.id}`,
    };

    let result;
    try {
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/ops/proposals`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
            body: JSON.stringify(proposalPayload),
        });

        result = await res.json();

        if (!res.ok) {
            throw new Error(result.error ?? `API returned ${res.status}`);
        }
    } catch (err) {
        log.warn('API call failed, inserting directly', { error: err });
        try {
            const [row] = await sql`
                INSERT INTO ops_mission_proposals (agent_id, title, description, proposed_steps, source, source_trace_id, status)
                VALUES (
                    ${agentId},
                    ${proposalPayload.title},
                    ${proposalPayload.description},
                    ${sql.json(proposalPayload.proposed_steps)},
                    'initiative',
                    ${proposalPayload.source_trace_id},
                    'pending'
                )
                RETURNING id
            `;
            result = { success: true, proposalId: row.id };
        } catch (directErr) {
            log.error('Direct insert also failed', { error: directErr });
            await failEntry(
                entry.id,
                `Proposal submission failed: ${directErr.message}`,
            );
            return;
        }
    }

    const completionResult = {
        proposal_title: proposalPayload.title,
        proposal_id: result.proposalId ?? null,
        mission_id: result.missionId ?? null,
        success: result.success ?? true,
    };

    await sql`
        UPDATE ops_initiative_queue
        SET status = 'completed',
            processed_at = NOW(),
            result = ${sql.json(completionResult)}
        WHERE id = ${entry.id}
    `;

    log.info('Initiative completed', {
        agent: agent.displayName,
        title: proposalPayload.title,
        proposalId: result.proposalId ?? 'direct',
    });
}

async function failEntry(entryId, error) {
    await sql`
        UPDATE ops_initiative_queue
        SET status = 'failed',
            processed_at = NOW(),
            result = ${sql.json({ error })}
        WHERE id = ${entryId}
    `;
}

// ─── Poll Loop ───

async function pollAndProcess() {
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

    if (!entry) return;

    try {
        await processInitiative(entry);
    } catch (err) {
        log.error('Processing failed', { error: err });
        await failEntry(entry.id, `Unexpected error: ${err.message}`);
    }
}

// ─── Main ───

async function main() {
    log.info('Initiative worker started', {
        pollInterval: POLL_INTERVAL_MS / 1000,
        model: LLM_MODEL,
        database: !!process.env.DATABASE_URL,
        openrouter: !!OPENROUTER_API_KEY,
    });

    await pollAndProcess();

    setInterval(async () => {
        try {
            await pollAndProcess();
        } catch (err) {
            log.error('Unexpected error', { error: err });
        }
    }, POLL_INTERVAL_MS);
}

main().catch(err => {
    log.fatal('Fatal error', { error: err });
    process.exit(1);
});
