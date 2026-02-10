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
import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Config ───

const POLL_INTERVAL_MS = 60_000; // 60 seconds

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL environment variable');
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
    console.error('Missing OPENROUTER_API_KEY environment variable');
    process.exit(1);
}

const openrouter = new OpenRouter({ apiKey: OPENROUTER_API_KEY });

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
        maxOutputTokens: 600,
    });

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
        console.error(`  [initiative] Unknown agent: ${agentId}`);
        await failEntry(entry.id, `Unknown agent: ${agentId}`);
        return;
    }

    console.log(
        `  [initiative] Processing initiative for ${agent.displayName} (${entry.id})`,
    );

    const memories = entry.context?.memories ?? [];
    if (memories.length === 0) {
        console.error('  [initiative] No memories in context');
        await failEntry(entry.id, 'No memories in context');
        return;
    }

    const prompt = buildInitiativePrompt(agentId, agent, memories);
    let rawResponse;
    try {
        rawResponse = await llmGenerate(
            [
                {
                    role: 'system',
                    content:
                        'You are an AI agent generating a structured proposal based on your accumulated knowledge. Output valid JSON only.',
                },
                { role: 'user', content: prompt },
            ],
            0.7,
        );
    } catch (err) {
        console.error('  [initiative] LLM generation failed:', err.message);
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
        console.error('  [initiative] Failed to parse LLM response as JSON');
        await failEntry(entry.id, 'Failed to parse LLM proposal');
        return;
    }

    if (
        !proposal.title ||
        !proposal.steps ||
        !Array.isArray(proposal.steps) ||
        proposal.steps.length === 0
    ) {
        console.error('  [initiative] Invalid proposal structure');
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
        console.error('  [initiative] No valid steps in proposal');
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
        console.warn(
            '  [initiative] API call failed, inserting directly:',
            err.message,
        );
        try {
            const [row] = await sql`
                INSERT INTO ops_mission_proposals (agent_id, title, description, proposed_steps, source, source_trace_id, status)
                VALUES (
                    ${agentId},
                    ${proposalPayload.title},
                    ${proposalPayload.description},
                    ${JSON.stringify(proposalPayload.proposed_steps)}::jsonb,
                    'initiative',
                    ${proposalPayload.source_trace_id},
                    'pending'
                )
                RETURNING id
            `;
            result = { success: true, proposalId: row.id };
        } catch (directErr) {
            console.error(
                '  [initiative] Direct insert also failed:',
                directErr.message,
            );
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
            result = ${JSON.stringify(completionResult)}::jsonb
        WHERE id = ${entry.id}
    `;

    console.log(
        `  [initiative] ✓ ${agent.displayName} proposed: "${proposalPayload.title}" (proposal: ${result.proposalId ?? 'direct'})`,
    );
}

async function failEntry(entryId, error) {
    await sql`
        UPDATE ops_initiative_queue
        SET status = 'failed',
            processed_at = NOW(),
            result = ${JSON.stringify({ error })}::jsonb
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
        console.error('[initiative-worker] Processing failed:', err.message);
        await failEntry(entry.id, `Unexpected error: ${err.message}`);
    }
}

// ─── Main ───

async function main() {
    console.log('💡 Initiative Worker started');
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
            console.error('[initiative-worker] Unexpected error:', err);
        }
    }, POLL_INTERVAL_MS);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
