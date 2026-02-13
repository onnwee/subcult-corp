// CostTracker — LLM usage cost dashboard
// Displays total costs, token counts, API calls, and breakdowns by agent/model/context
'use client';

import { useState } from 'react';
import { useCosts, type CostBreakdown } from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

type Period = 'today' | 'week' | 'month' | 'all';
type GroupMode = 'agent' | 'model' | 'context';

// ─── Formatting helpers ───

function formatCost(usd: number): string {
    if (usd >= 1) return `$${usd.toFixed(2)}`;
    if (usd >= 0.01) return `$${usd.toFixed(3)}`;
    if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
    if (usd === 0) return '$0.00';
    return `$${usd.toFixed(6)}`;
}

function formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return String(tokens);
}

function formatCalls(calls: number): string {
    if (calls >= 1_000) return `${(calls / 1_000).toFixed(1)}K`;
    return String(calls);
}

/** Get agent color from AGENTS config or a default */
function getBarColor(key: string, groupMode: GroupMode): string {
    if (groupMode === 'agent') {
        const agent = AGENTS[key as AgentId];
        if (agent) return agent.color;
    }
    // Model/context colors — deterministic hashing
    const MODEL_COLORS: Record<string, string> = {
        'anthropic/claude-haiku-4.5': '#f5a623',
        'anthropic/claude-sonnet-4.5': '#f7c948',
        'google/gemini-2.5-flash': '#4285f4',
        'openai/gpt-4.1-mini': '#10a37f',
        'deepseek/deepseek-v3.2': '#6366f1',
        'qwen/qwen3-235b-a22b': '#ec4899',
        'moonshotai/kimi-k2.5': '#8b5cf6',
    };
    if (groupMode === 'model' && MODEL_COLORS[key]) return MODEL_COLORS[key];

    const CONTEXT_COLORS: Record<string, string> = {
        roundtable: '#b4befe',
        initiative: '#a6e3a1',
        distillation: '#f38ba8',
        topic_generation: '#cba6f7',
        unknown: '#71717a',
    };
    if (groupMode === 'context' && CONTEXT_COLORS[key]) return CONTEXT_COLORS[key];

    // Fallback — hash-based color
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 60%)`;
}

/** Display name for a key */
function displayKey(key: string, groupMode: GroupMode): string {
    if (groupMode === 'agent') {
        const agent = AGENTS[key as AgentId];
        return agent ? agent.displayName : key;
    }
    if (groupMode === 'model') {
        // Strip provider prefix for display
        return key.includes('/') ? key.split('/')[1] : key;
    }
    return key;
}

// ─── Sub-components ───

function SummaryCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
    return (
        <div className="flex-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="text-lg font-semibold text-zinc-100 tabular-nums">{value}</div>
            {subtext && <div className="text-[10px] text-zinc-500 mt-0.5">{subtext}</div>}
        </div>
    );
}

function BarChart({
    items,
    groupMode,
    metric,
}: {
    items: CostBreakdown[];
    groupMode: GroupMode;
    metric: 'cost' | 'tokens' | 'calls';
}) {
    if (items.length === 0) {
        return <div className="text-xs text-zinc-500 py-4 text-center">No data</div>;
    }

    const maxValue = Math.max(...items.map(i => i[metric]), 1);
    const formatter = metric === 'cost' ? formatCost : metric === 'tokens' ? formatTokens : formatCalls;

    return (
        <div className="space-y-2">
            {items.map(item => {
                const pct = (item[metric] / maxValue) * 100;
                const color = getBarColor(item.key, groupMode);
                return (
                    <div key={item.key} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-zinc-400 truncate text-right" title={item.key}>
                            {displayKey(item.key, groupMode)}
                        </div>
                        <div className="flex-1 h-5 bg-zinc-800 rounded-sm overflow-hidden relative">
                            <div
                                className="h-full rounded-sm transition-all duration-500"
                                style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
                            />
                            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-zinc-300 tabular-nums">
                                {formatter(item[metric])}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PeriodSelector({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
    const periods: { key: Period; label: string }[] = [
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'Week' },
        { key: 'month', label: 'Month' },
        { key: 'all', label: 'All' },
    ];

    return (
        <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-0.5 border border-zinc-700/50">
            {periods.map(p => (
                <button
                    key={p.key}
                    onClick={() => onChange(p.key)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        period === p.key
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}

function GroupSelector({ groupMode, onChange }: { groupMode: GroupMode; onChange: (g: GroupMode) => void }) {
    const groups: { key: GroupMode; label: string }[] = [
        { key: 'agent', label: 'By Agent' },
        { key: 'model', label: 'By Model' },
        { key: 'context', label: 'By Context' },
    ];

    return (
        <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-0.5 border border-zinc-700/50">
            {groups.map(g => (
                <button
                    key={g.key}
                    onClick={() => onChange(g.key)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        groupMode === g.key
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                    {g.label}
                </button>
            ))}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3 h-16" />
                ))}
            </div>
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-4 h-48" />
        </div>
    );
}

// ─── Main Component ───

export function CostTracker() {
    const [period, setPeriod] = useState<Period>('all');
    const [groupMode, setGroupMode] = useState<GroupMode>('agent');
    const [metric, setMetric] = useState<'cost' | 'tokens' | 'calls'>('cost');

    const { costs, loading, error, refetch } = useCosts({ period, groupBy: groupMode });

    if (error) {
        return (
            <div className="rounded-lg bg-red-900/20 border border-red-800/50 p-4 text-sm text-red-400">
                Failed to load cost data: {error}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                    <PeriodSelector period={period} onChange={setPeriod} />
                    <GroupSelector groupMode={groupMode} onChange={setGroupMode} />
                </div>
                <button
                    onClick={refetch}
                    className="rounded-md bg-zinc-800 border border-zinc-700/50 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                    disabled={loading}
                >
                    {loading ? '...' : '↻ Refresh'}
                </button>
            </div>

            {loading && !costs ? (
                <LoadingSkeleton />
            ) : costs ? (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <SummaryCard
                            label="Total Cost"
                            value={formatCost(costs.totalCost)}
                            subtext={period !== 'all' ? period : undefined}
                        />
                        <SummaryCard
                            label="Total Tokens"
                            value={formatTokens(costs.totalTokens)}
                        />
                        <SummaryCard
                            label="API Calls"
                            value={formatCalls(costs.totalCalls)}
                        />
                    </div>

                    {/* Breakdown chart */}
                    <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Breakdown
                            </h3>
                            <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-0.5 border border-zinc-700/50">
                                {(['cost', 'tokens', 'calls'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMetric(m)}
                                        className={`rounded-md px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                                            metric === m
                                                ? 'bg-zinc-700 text-zinc-100'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {m === 'cost' ? 'Cost' : m === 'tokens' ? 'Tokens' : 'Calls'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <BarChart items={costs.breakdown} groupMode={groupMode} metric={metric} />
                    </div>

                    {/* Breakdown table — grouped usage by agent/model/context */}
                    {costs.breakdown.length > 0 && (
                        <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/50 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-700/50">
                                        <th className="text-left px-4 py-2 text-zinc-500 font-medium uppercase tracking-wider">
                                            {groupMode === 'agent' ? 'Agent' : groupMode === 'model' ? 'Model' : 'Context'}
                                        </th>
                                        <th className="text-right px-4 py-2 text-zinc-500 font-medium uppercase tracking-wider">Cost</th>
                                        <th className="text-right px-4 py-2 text-zinc-500 font-medium uppercase tracking-wider">Tokens</th>
                                        <th className="text-right px-4 py-2 text-zinc-500 font-medium uppercase tracking-wider">Calls</th>
                                        <th className="text-right px-4 py-2 text-zinc-500 font-medium uppercase tracking-wider">Avg/Call</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {costs.breakdown.map(row => {
                                        const color = getBarColor(row.key, groupMode);
                                        const avgCost = row.calls > 0 ? row.cost / row.calls : 0;
                                        return (
                                            <tr key={row.key} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                                <td className="px-4 py-2">
                                                    <span className="flex items-center gap-2">
                                                        <span
                                                            className="w-2 h-2 rounded-full inline-block"
                                                            style={{ backgroundColor: color }}
                                                        />
                                                        <span className="text-zinc-300">
                                                            {displayKey(row.key, groupMode)}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="text-right px-4 py-2 text-zinc-300 tabular-nums">{formatCost(row.cost)}</td>
                                                <td className="text-right px-4 py-2 text-zinc-400 tabular-nums">{formatTokens(row.tokens)}</td>
                                                <td className="text-right px-4 py-2 text-zinc-400 tabular-nums">{row.calls}</td>
                                                <td className="text-right px-4 py-2 text-zinc-500 tabular-nums">{formatCost(avgCost)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Empty state */}
                    {costs.totalCalls === 0 && (
                        <div className="text-center py-12 text-zinc-500 text-sm">
                            No LLM usage recorded yet.
                            <br />
                            <span className="text-xs">Costs will appear after agents make API calls.</span>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
