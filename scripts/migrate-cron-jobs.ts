// Migrate OpenClaw cron jobs to native ops_cron_schedules table
// One-time script: npx tsx scripts/migrate-cron-jobs.ts
//
// Inserts predefined cron schedules based on the plan's job list.
// Run after migration 018 has been applied.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 3 });

interface CronJob {
    name: string;
    agent_id: string;
    cron_expression: string;
    prompt: string;
    timeout_seconds: number;
    max_tool_rounds: number;
    model?: string;
}

// Jobs migrated from OpenClaw — prompts rewritten to be explicit per MEMORY.md best practice
const JOBS: CronJob[] = [
    {
        name: 'Morning Research Scan',
        agent_id: 'chora',
        cron_expression: '0 12 * * *', // 7am CT (UTC-5)
        prompt: `Search the web for the top AI and technology news from the last 24 hours. Focus on:
1. New model releases and benchmarks
2. Major product launches or acquisitions
3. Research paper breakthroughs
4. Open source project milestones
5. Regulatory or policy developments

Use web_search for 3-4 queries covering different angles. Summarize the top 5-7 stories with source URLs and a brief analysis of why each matters.`,
        timeout_seconds: 300,
        max_tool_rounds: 10,
    },
    {
        name: 'Social & Market Scanner',
        agent_id: 'chora',
        cron_expression: '0 13,23 * * *', // 8am, 6pm CT
        prompt: `Search the web for trending social media discussions and market signals relevant to AI, technology, and culture. Look for:
1. Viral threads or discussions on AI/tech
2. Market movements in tech stocks or crypto
3. Cultural commentary on technology's impact
4. Emerging memes or narratives about AI

Use web_search for 2-3 targeted queries. Provide a concise signal report.`,
        timeout_seconds: 240,
        max_tool_rounds: 8,
    },
    {
        name: 'Daily Briefing',
        agent_id: 'chora',
        cron_expression: '0 2 * * *', // 9pm CT
        prompt: `Compile a daily briefing from today's research and scanning sessions. Use memory_search to find today's session outputs and synthesize them into:

1. **Top Stories**: 3-5 most important developments
2. **Signals**: Emerging trends or patterns
3. **Action Items**: Things worth tracking or acting on
4. **Outlook**: What to watch tomorrow

Write the briefing to /workspace/briefings/daily-briefing.md using file_write.`,
        timeout_seconds: 300,
        max_tool_rounds: 10,
    },
    {
        name: 'AI & Tech Radar',
        agent_id: 'chora',
        cron_expression: '0 17 * * *', // noon CT
        prompt: `Deep scan for AI and technology developments. Search for:
1. New AI model releases, fine-tuning techniques, or inference optimizations
2. Developer tools, frameworks, or infrastructure updates
3. AI safety and alignment research
4. Edge computing, robotics, or hardware advances

Use web_search with 3-4 specific technical queries. Rate each finding's importance (1-5) and explain relevance.`,
        timeout_seconds: 300,
        max_tool_rounds: 10,
    },
    {
        name: 'Subcult Watch',
        agent_id: 'chora',
        cron_expression: '0 19 * * *', // 2pm CT
        prompt: `Monitor for mentions and developments related to our brand and adjacent projects. Search for:
1. Any mentions of "subcult" in tech/AI contexts
2. Competitor activity in autonomous agent systems
3. Multi-agent framework developments
4. AI orchestration and workflow automation news

Use web_search for 2-3 targeted brand monitoring queries. Report findings with context.`,
        timeout_seconds: 240,
        max_tool_rounds: 8,
    },
    {
        name: 'Weekly Deep Digest',
        agent_id: 'chora',
        cron_expression: '0 23 * * 0', // 6pm CT Sunday
        prompt: `Compile a comprehensive weekly digest. Use memory_search to retrieve this week's daily briefings and session outputs. Synthesize into:

1. **Week in Review**: Major themes and developments
2. **Deep Analysis**: One topic deserving extended treatment
3. **Pattern Watch**: Recurring signals or emerging trends
4. **Strategic Notes**: Implications for our work
5. **Next Week Preview**: What to watch for

Write to /workspace/briefings/weekly-digest.md using file_write.`,
        timeout_seconds: 600,
        max_tool_rounds: 15,
        model: 'anthropic/claude-sonnet-4.5',
    },
    {
        name: 'Agent Dream',
        agent_id: 'thaum',
        cron_expression: '0 8 * * *', // 3am CT
        prompt: `Creative cross-pollination session. Use memory_search to find interesting patterns, contradictions, or unexpected connections across all agents' recent memories.

Then, generate a brief "dream report" — a creative synthesis that:
1. Connects 2-3 seemingly unrelated observations
2. Proposes a novel reframe or metaphor
3. Identifies a question nobody has asked yet
4. Suggests one experimental direction

Keep it under 500 words. This is imagination, not analysis.`,
        timeout_seconds: 300,
        max_tool_rounds: 8,
    },
    {
        name: 'Nightly Synthesis',
        agent_id: 'chora',
        cron_expression: '0 11 * * *', // 6am CT
        prompt: `Memory consolidation run. Use memory_search to review the last 24 hours of agent memories. Look for:

1. Memories that should be updated or superseded
2. Patterns across different agents' observations
3. Lessons learned that should be elevated to strategy-level
4. Contradictions that need resolution

Provide a synthesis report of what you found and any recommended memory updates.`,
        timeout_seconds: 300,
        max_tool_rounds: 10,
    },
    {
        name: 'Federation Roundtable',
        agent_id: 'primus',
        cron_expression: '0 21 * * 5', // 4pm CT Friday
        prompt: `It is time for the weekly federation roundtable. Review the week's agent activities using memory_search, then provide:

1. **Directive**: One strategic priority for next week
2. **Assessment**: How each agent performed this week (brief)
3. **Allocation**: Any role adjustments or focus shifts
4. **Question**: One question for the group to consider

Keep it under 300 words. Speak as Primus — cold, strategic, decisive.`,
        timeout_seconds: 300,
        max_tool_rounds: 8,
    },
    {
        name: 'CVE Security Check',
        agent_id: 'subrosa',
        cron_expression: '30 12 * * *', // 7:30am CT
        prompt: `Security relevance check. Search for:
1. Critical CVEs published in the last 24 hours affecting Node.js, Docker, PostgreSQL, or Linux
2. Supply chain attacks or package compromises in npm/pip
3. AI-specific security threats (prompt injection, model extraction, etc.)

Use web_search for 2-3 security-focused queries. Report only findings with direct relevance to our stack. Rate severity (critical/high/medium/low).`,
        timeout_seconds: 240,
        max_tool_rounds: 8,
    },
    {
        name: 'Calendar Briefing',
        agent_id: 'mux',
        cron_expression: '0 12 * * *', // 7am CT
        prompt: `Check for today's scheduled events and deadlines. Use web_search to check for any major industry events, conferences, or deadlines happening today.

Provide a brief morning calendar-style briefing of what's relevant today.`,
        timeout_seconds: 180,
        max_tool_rounds: 6,
    },
    {
        name: 'Email Triage',
        agent_id: 'mux',
        cron_expression: '0 14 * * *', // 9am CT
        prompt: `Check for any important communications or notifications that need attention. Use web_search to check for service status pages of key dependencies (OpenRouter, GitHub, Vercel, Cloudflare).

Report any outages, maintenance windows, or status changes that affect our infrastructure.`,
        timeout_seconds: 180,
        max_tool_rounds: 6,
    },
];

async function main() {
    console.log(`Migrating ${JOBS.length} cron jobs...`);

    for (const job of JOBS) {
        const [existing] = await sql`
            SELECT id FROM ops_cron_schedules WHERE name = ${job.name}
        `;

        if (existing) {
            console.log(`  SKIP: "${job.name}" (already exists)`);
            continue;
        }

        await sql`
            INSERT INTO ops_cron_schedules ${sql({
                name: job.name,
                agent_id: job.agent_id,
                cron_expression: job.cron_expression,
                timezone: 'America/Chicago',
                prompt: job.prompt,
                timeout_seconds: job.timeout_seconds,
                max_tool_rounds: job.max_tool_rounds,
                model: job.model ?? null,
                enabled: true,
            })}
        `;

        console.log(`  OK: "${job.name}" → ${job.agent_id} (${job.cron_expression})`);
    }

    console.log('Done.');
    await sql.end();
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
