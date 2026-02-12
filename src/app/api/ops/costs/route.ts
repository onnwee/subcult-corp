// /api/ops/costs — LLM usage cost aggregation endpoint
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Period = 'today' | 'week' | 'month' | 'all';
type GroupBy = 'agent' | 'model' | 'context' | 'none';

function getDateFilter(period: Period): Date | null {
    const now = new Date();
    switch (period) {
        case 'today': {
            const d = new Date(now);
            d.setUTCHours(0, 0, 0, 0);
            return d;
        }
        case 'week':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'month':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'all':
            return null;
    }
}

interface AggRow {
    key: string;
    cost: number;
    tokens: number;
    calls: number;
}

interface TotalRow {
    cost: number;
    tokens: number;
    calls: number;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const period = (searchParams.get('period') ?? 'all') as Period;
        const groupBy = (searchParams.get('group_by') ?? 'none') as GroupBy;

        if (!['today', 'week', 'month', 'all'].includes(period)) {
            return NextResponse.json(
                { error: 'Invalid period. Use: today, week, month, all' },
                { status: 400 },
            );
        }
        if (!['agent', 'model', 'context', 'none'].includes(groupBy)) {
            return NextResponse.json(
                { error: 'Invalid group_by. Use: agent, model, context, none' },
                { status: 400 },
            );
        }

        const dateFilter = getDateFilter(period);

        // Get totals
        const totals = dateFilter
            ? await sql<TotalRow[]>`
                SELECT
                    COALESCE(SUM(cost_usd), 0)::float8 as cost,
                    COALESCE(SUM(total_tokens), 0)::bigint as tokens,
                    COUNT(*)::bigint as calls
                FROM ops_llm_usage
                WHERE created_at >= ${dateFilter}
            `
            : await sql<TotalRow[]>`
                SELECT
                    COALESCE(SUM(cost_usd), 0)::float8 as cost,
                    COALESCE(SUM(total_tokens), 0)::bigint as tokens,
                    COUNT(*)::bigint as calls
                FROM ops_llm_usage
            `;

        const totalRow = totals[0];

        // Get breakdown if grouped
        let breakdown: { key: string; cost: number; tokens: number; calls: number }[] = [];

        if (groupBy !== 'none') {
            const groupColumn =
                groupBy === 'agent' ? 'agent_id'
                : groupBy === 'model' ? 'model'
                : 'context';

            const rows = dateFilter
                ? await sql<AggRow[]>`
                    SELECT
                        COALESCE(${sql(groupColumn)}, 'unknown') as key,
                        COALESCE(SUM(cost_usd), 0)::float8 as cost,
                        COALESCE(SUM(total_tokens), 0)::bigint as tokens,
                        COUNT(*)::bigint as calls
                    FROM ops_llm_usage
                    WHERE created_at >= ${dateFilter}
                    GROUP BY ${sql(groupColumn)}
                    ORDER BY COALESCE(SUM(cost_usd), 0) DESC
                `
                : await sql<AggRow[]>`
                    SELECT
                        COALESCE(${sql(groupColumn)}, 'unknown') as key,
                        COALESCE(SUM(cost_usd), 0)::float8 as cost,
                        COALESCE(SUM(total_tokens), 0)::bigint as tokens,
                        COUNT(*)::bigint as calls
                    FROM ops_llm_usage
                    GROUP BY ${sql(groupColumn)}
                    ORDER BY COALESCE(SUM(cost_usd), 0) DESC
                `;

            breakdown = rows.map(r => ({
                key: r.key,
                cost: r.cost,
                tokens: r.tokens,
                calls: r.calls,
            }));
        }

        return NextResponse.json({
            totalCost: totalRow.cost,
            totalTokens: totalRow.tokens,
            totalCalls: totalRow.calls,
            period,
            groupBy,
            breakdown,
        });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
