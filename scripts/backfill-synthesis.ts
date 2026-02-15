// Backfill artifact synthesis sessions for completed roundtables missing artifacts
// One-time script: npx tsx scripts/backfill-synthesis.ts
//
// Context: The artifact synthesis code was deployed after today's roundtables
// had already completed. This script retroactively creates synthesis sessions
// for eligible roundtables (those with artifact-configured formats).

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';
import { createLogger } from '../src/lib/logger';

const log = createLogger({ service: 'backfill-synthesis' });

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 3 });

// ─── Format artifact configs (mirrored from src/lib/roundtable/formats.ts) ───

const ARTIFACT_CONFIGS: Record<string, { type: string; outputDir: string; synthesizer: string }> = {
    standup:        { type: 'briefing', outputDir: 'output/briefings', synthesizer: 'mux' },
    deep_dive:      { type: 'report',   outputDir: 'output/reports',   synthesizer: 'chora' },
    risk_review:    { type: 'review',   outputDir: 'output/reviews',   synthesizer: 'subrosa' },
    strategy:       { type: 'plan',     outputDir: 'agents/primus/directives', synthesizer: 'primus' },
    planning:       { type: 'plan',     outputDir: 'output/reports',   synthesizer: 'mux' },
    shipping:       { type: 'review',   outputDir: 'output/reviews',   synthesizer: 'praxis' },
    retro:          { type: 'digest',   outputDir: 'output/digests',   synthesizer: 'chora' },
    brainstorm:     { type: 'report',   outputDir: 'output/reports',   synthesizer: 'thaum' },
    writing_room:   { type: 'report',   outputDir: 'output',           synthesizer: 'mux' },
    content_review: { type: 'review',   outputDir: 'output/reviews',   synthesizer: 'subrosa' },
};

// ─── Voice display names (for transcript readability) ───

const DISPLAY_NAMES: Record<string, string> = {
    primus: 'Primus',
    chora:  'Chora',
    praxis: 'Praxis',
    subrosa: 'Subrosa',
    thaum:  'Thaum',
    mux:    'Mux',
};

function buildSynthesisPrompt(
    session: { id: string; format: string; topic: string; participants: string[] },
    turns: { speaker: string; dialogue: string; turn_number: number }[],
    artifact: { type: string; outputDir: string; synthesizer: string },
): string {
    const today = new Date().toISOString().split('T')[0];
    const topicSlug = session.topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);

    const filename = `${today}__meeting__${artifact.type}__${topicSlug}__${artifact.synthesizer}__v01.md`;
    const outputPath = `${artifact.outputDir}/${filename}`;

    const transcript = turns.map(t => {
        const name = DISPLAY_NAMES[t.speaker] ?? t.speaker;
        return `${name}: ${t.dialogue}`;
    }).join('\n');

    let prompt = `You just participated in (or observed) a ${session.format} conversation.\n\n`;
    prompt += `Topic: ${session.topic}\n`;
    prompt += `Format: ${session.format}\n`;
    prompt += `Participants: ${session.participants.join(', ')}\n`;
    prompt += `Turns: ${turns.length}\n\n`;
    prompt += `═══ TRANSCRIPT ═══\n${transcript}\n═══ END TRANSCRIPT ═══\n\n`;

    prompt += `Your task: Synthesize this conversation into a structured ${artifact.type}.\n\n`;

    prompt += `Requirements:\n`;
    prompt += `1. Write the artifact with YAML front matter including:\n`;
    prompt += `   - artifact_id: (generate a UUID)\n`;
    prompt += `   - created_at: ${new Date().toISOString()}\n`;
    prompt += `   - agent_id: ${artifact.synthesizer}\n`;
    prompt += `   - workflow_stage: "meeting"\n`;
    prompt += `   - status: "draft"\n`;
    prompt += `   - retention_class: "standard"\n`;
    prompt += `   - source_refs:\n`;
    prompt += `     - kind: "roundtable_session"\n`;
    prompt += `       id: "${session.id}"\n`;
    prompt += `2. Include a clear title and summary\n`;
    prompt += `3. Capture key points, decisions, action items, and disagreements\n`;
    prompt += `4. Be concise but thorough — aim for 300-800 words\n`;
    prompt += `5. Write the artifact using file_write to path: ${outputPath}\n\n`;

    prompt += `Do NOT just repeat the transcript. Synthesize, structure, and add value.\n`;

    return prompt;
}

async function main() {
    log.info('Starting artifact synthesis backfill');

    // Get completed roundtables from today with artifact-eligible formats
    const eligibleFormats = Object.keys(ARTIFACT_CONFIGS);

    const sessions = await sql<{
        id: string;
        format: string;
        topic: string;
        participants: string[];
    }[]>`
        SELECT id, format, topic, participants
        FROM ops_roundtable_sessions
        WHERE status = 'completed'
          AND completed_at >= CURRENT_DATE
          AND format = ANY(${eligibleFormats})
          AND id NOT IN (
              SELECT source_id FROM ops_agent_sessions
              WHERE source = 'conversation'
                AND source_id IS NOT NULL
          )
        ORDER BY completed_at ASC
    `;

    if (sessions.length === 0) {
        log.info('No eligible sessions need backfilling');
        await sql.end();
        return;
    }

    log.info('Found eligible roundtables', { count: sessions.length });

    let created = 0;
    for (const session of sessions) {
        const artifact = ARTIFACT_CONFIGS[session.format];
        if (!artifact) continue;

        // Get turns for this session
        const turns = await sql<{ speaker: string; dialogue: string; turn_number: number }[]>`
            SELECT speaker, dialogue, turn_number
            FROM ops_roundtable_turns
            WHERE session_id = ${session.id}
            ORDER BY turn_number ASC
        `;

        if (turns.length < 3) {
            log.debug('Skipping session with insufficient turns', {
                format: session.format,
                sessionId: session.id,
                turns: turns.length,
            });
            continue;
        }

        const prompt = buildSynthesisPrompt(session, turns, artifact);

        const [row] = await sql<[{ id: string }]>`
            INSERT INTO ops_agent_sessions (
                agent_id, prompt, source, source_id,
                timeout_seconds, max_tool_rounds, status
            ) VALUES (
                ${artifact.synthesizer},
                ${prompt},
                'conversation',
                ${session.id},
                180,
                8,
                'pending'
            )
            RETURNING id
        `;

        log.info('Created synthesis session', {
            format: session.format,
            synthesizer: artifact.synthesizer,
            sessionId: row.id,
            turns: turns.length,
            topic: session.topic,
        });
        created++;
    }

    log.info('Backfill complete', { created });
    await sql.end();
}

main().catch(err => {
    log.fatal('Backfill failed', { error: err });
    process.exit(1);
});
