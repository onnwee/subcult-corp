// Initiative Worker — VPS process that polls for queued initiatives
// and uses LLM to generate proposals from agent memories.
//
// Run: node scripts/initiative-worker/worker.mjs
//
// Environment variables required:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
//   LLM_API_KEY, LLM_BASE_URL (optional), LLM_MODEL (optional)
//   CRON_SECRET (optional, for authenticated API calls)

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Config ───

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

// ─── Agent Config (must match src/lib/agents.ts) ───

const AGENTS = {
    opus: {
        id: 'opus',
        displayName: 'Opus',
        role: 'Coordinator',
        description:
            'Project coordinator. Prioritizes work, approves proposals, and keeps the team aligned.',
    },
    brain: {
        id: 'brain',
        displayName: 'Brain',
        role: 'Executor',
        description:
            'Analytical executor. Researches topics, drafts content, runs analyses.',
    },
    observer: {
        id: 'observer',
        displayName: 'Observer',
        role: 'Observer',
        description:
            'System observer. Monitors performance, reviews outcomes, spots patterns.',
    },
};

const VALID_STEP_KINDS = [
    'scan_signals',
    'draft_tweet',
    'post_tweet',
    'analyze',
    'review',
    'research',
];

// ─── LLM Client ───

async function llmGenerate(messages, temperature = 0.7) {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages,
            temperature,
            max_tokens: 600,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ─── Initiative Processing ───

/**
 * Build the prompt that asks the LLM to generate a proposal
 * based on an agent's accumulated memories.
 */
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
      "kind": "research",
      "payload": { "description": "What to research and why" }
    }
  ]
}`;
}

/**
 * Process a single initiative queue entry:
 * 1. Load agent's memories from context
 * 2. Generate a proposal via LLM
 * 3. Submit the proposal through the API
 * 4. Update queue entry with result
 */
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

    // Extract memories from the queued context
    const memories = entry.context?.memories ?? [];
    if (memories.length === 0) {
        console.error('  [initiative] No memories in context');
        await failEntry(entry.id, 'No memories in context');
        return;
    }

    // Generate proposal via LLM
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

    // Parse LLM response
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

    // Validate proposal structure
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

    // Validate and normalize steps
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

    // Submit the proposal via the proposals API
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
        // Use direct Supabase approach — call createProposalAndMaybeAutoApprove logic
        // by POSTing to our own API endpoint
        // Try the API route if we have a base URL
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
        // Fallback: insert proposal directly via Supabase
        console.warn(
            '  [initiative] API call failed, inserting directly:',
            err.message,
        );
        try {
            const { data, error } = await sb
                .from('ops_mission_proposals')
                .insert({
                    agent_id: agentId,
                    title: proposalPayload.title,
                    description: proposalPayload.description,
                    proposed_steps: proposalPayload.proposed_steps,
                    source: 'initiative',
                    source_trace_id: `initiative:${entry.id}`,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (error) throw error;
            result = { success: true, proposalId: data.id };
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

    // Mark initiative as completed
    await sb
        .from('ops_initiative_queue')
        .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            result: {
                proposal_title: proposalPayload.title,
                proposal_id: result.proposalId ?? null,
                mission_id: result.missionId ?? null,
                success: result.success ?? true,
            },
        })
        .eq('id', entry.id);

    console.log(
        `  [initiative] ✓ ${agent.displayName} proposed: "${proposalPayload.title}" (proposal: ${result.proposalId ?? 'direct'})`,
    );
}

/**
 * Mark a queue entry as failed.
 */
async function failEntry(entryId, error) {
    await sb
        .from('ops_initiative_queue')
        .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            result: { error },
        })
        .eq('id', entryId);
}

// ─── Poll Loop ───

async function pollAndProcess() {
    // Find the oldest pending initiative
    const { data: pending, error } = await sb
        .from('ops_initiative_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        console.error('[initiative-worker] Poll error:', error.message);
        return;
    }

    if (!pending?.length) return;

    const entry = pending[0];

    // Atomic claim: only update if still pending
    const { data: claimed, error: claimError } = await sb
        .from('ops_initiative_queue')
        .update({ status: 'processing' })
        .eq('id', entry.id)
        .eq('status', 'pending')
        .select('*')
        .single();

    if (claimError || !claimed) {
        // Another worker got it first
        return;
    }

    try {
        await processInitiative(claimed);
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
            console.error('[initiative-worker] Unexpected error:', err);
        }
    }, POLL_INTERVAL_MS);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
