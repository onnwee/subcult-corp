// MemoryExplorer — browse, filter, and search agent memories
// Includes timeline, type filters, confidence visualization, search, and lineage view
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    useMemories,
    useArchaeology,
    type MemoryFilters,
    type ArchaeologyFinding,
} from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId, MemoryType, MemoryEntry } from '@/lib/types';

type ExplorerTab = 'memories' | 'archaeology';

// ─── Constants ───

const MEMORY_TYPE_CONFIG: Record<
    MemoryType,
    { icon: string; label: string; color: string; bgColor: string }
> = {
    insight: {
        icon: '💡',
        label: 'Insight',
        color: 'text-accent-yellow',
        bgColor: 'bg-accent-yellow/10 border-accent-yellow/30',
    },
    pattern: {
        icon: '🔄',
        label: 'Pattern',
        color: 'text-accent-blue',
        bgColor: 'bg-accent-blue/10 border-accent-blue/30',
    },
    strategy: {
        icon: '♟️',
        label: 'Strategy',
        color: 'text-accent',
        bgColor: 'bg-accent/10 border-accent/30',
    },
    preference: {
        icon: '⭐',
        label: 'Preference',
        color: 'text-accent-pink',
        bgColor: 'bg-accent-pink/10 border-accent-pink/30',
    },
    lesson: {
        icon: '📖',
        label: 'Lesson',
        color: 'text-accent-green',
        bgColor: 'bg-accent-green/10 border-accent-green/30',
    },
};

const ALL_TYPES: MemoryType[] = [
    'insight',
    'pattern',
    'strategy',
    'preference',
    'lesson',
];

const FINDING_TYPE_BADGE: Record<
    string,
    { icon: string; label: string; color: string }
> = {
    pattern: { icon: '🔄', label: 'Pattern', color: 'text-accent-green' },
    contradiction: {
        icon: '⚡',
        label: 'Contradiction',
        color: 'text-accent-red',
    },
    emergence: { icon: '🌱', label: 'Emergence', color: 'text-purple-400' },
    echo: { icon: '🔊', label: 'Echo', color: 'text-accent-yellow' },
    drift: { icon: '🌊', label: 'Drift', color: 'text-cyan-400' },
};

/** Build a map of memory_id → findings from evidence arrays */
function buildFindingIndex(
    findings: ArchaeologyFinding[],
): Map<string, ArchaeologyFinding[]> {
    const index = new Map<string, ArchaeologyFinding[]>();
    for (const f of findings) {
        for (const ev of f.evidence ?? []) {
            if (!ev.memory_id) continue;
            const list = index.get(ev.memory_id) ?? [];
            list.push(f);
            index.set(ev.memory_id, list);
        }
    }
    return index;
}

// ─── Helpers ───

function formatTimestamp(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

// ─── Confidence Bar ───

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    const color =
        pct >= 80 ? 'bg-accent-green'
        : pct >= 60 ? 'bg-accent-yellow'
        : pct >= 40 ? 'bg-accent-orange'
        : 'bg-accent-red';

    return (
        <div className='flex items-center gap-2'>
            <div className='flex-1 h-1.5 rounded-full bg-zinc-700/50 overflow-hidden'>
                <div
                    className={`h-full rounded-full ${color} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className='text-[10px] text-zinc-500 font-mono tabular-nums w-8 text-right'>
                {pct}%
            </span>
        </div>
    );
}

// ─── Agent Filter Tabs ───

function AgentFilterTabs({
    selected,
    onChange,
}: {
    selected: string | null;
    onChange: (agentId: string | null) => void;
}) {
    const agents = Object.values(AGENTS);

    return (
        <div className='flex gap-1 flex-wrap'>
            <button
                onClick={() => onChange(null)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    selected === null ?
                        'bg-zinc-700 text-zinc-100'
                    :   'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
            >
                All
            </button>
            {agents.map(agent => (
                <button
                    key={agent.id}
                    onClick={() => onChange(agent.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        selected === agent.id ?
                            `bg-zinc-700 ${agent.tailwindTextColor}`
                        :   `${agent.tailwindTextColor}/50 hover:${agent.tailwindTextColor} hover:bg-zinc-800`
                    }`}
                >
                    {agent.displayName}
                </button>
            ))}
        </div>
    );
}

// ─── Type Filter Chips ───

function TypeFilterChips({
    selected,
    onChange,
}: {
    selected: Set<MemoryType>;
    onChange: (types: Set<MemoryType>) => void;
}) {
    const toggleType = (type: MemoryType) => {
        const next = new Set(selected);
        if (next.has(type)) {
            next.delete(type);
        } else {
            next.add(type);
        }
        onChange(next);
    };

    return (
        <div className='flex gap-1 flex-wrap'>
            {ALL_TYPES.map(type => {
                const cfg = MEMORY_TYPE_CONFIG[type];
                const active = selected.has(type);
                return (
                    <button
                        key={type}
                        onClick={() => toggleType(type)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                            active ?
                                cfg.bgColor + ' ' + cfg.color
                            :   'border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                        }`}
                    >
                        {cfg.icon} {cfg.label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Confidence Slider ───

function ConfidenceSlider({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className='flex items-center gap-2'>
            <span className='text-[10px] text-zinc-500 shrink-0'>
                Min confidence:
            </span>
            <input
                type='range'
                min={0}
                max={100}
                value={value * 100}
                onChange={e => onChange(Number(e.target.value) / 100)}
                className='flex-1 h-1 accent-accent bg-zinc-700 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent'
            />
            <span className='text-[10px] text-zinc-400 font-mono tabular-nums w-8 text-right'>
                {Math.round(value * 100)}%
            </span>
        </div>
    );
}

// ─── Search Input ───

function SearchInput({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className='relative'>
            <svg
                className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}
            >
                <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                />
            </svg>
            <input
                type='text'
                placeholder='Search memory content...'
                value={value}
                onChange={e => onChange(e.target.value)}
                className='w-full rounded-md bg-zinc-800/80 border border-zinc-700/50 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/50'
            />
        </div>
    );
}

// ─── Memory Card ───

// ─── Finding Badges (shown on memory cards) ───

function FindingBadges({
    findings,
    onNavigate,
}: {
    findings: ArchaeologyFinding[];
    onNavigate?: (finding: ArchaeologyFinding) => void;
}) {
    // Group by type and count
    const grouped = useMemo(() => {
        const counts: Record<
            string,
            { count: number; items: ArchaeologyFinding[] }
        > = {};
        for (const f of findings) {
            if (!counts[f.finding_type])
                counts[f.finding_type] = { count: 0, items: [] };
            counts[f.finding_type].count++;
            counts[f.finding_type].items.push(f);
        }
        return counts;
    }, [findings]);

    if (findings.length === 0) return null;

    return (
        <div className='flex gap-1 flex-wrap mt-1.5'>
            <span className='text-[9px] text-zinc-500 mr-0.5 self-center'>
                🏛️
            </span>
            {Object.entries(grouped).map(([type, { count, items }]) => {
                const cfg = FINDING_TYPE_BADGE[type] ?? {
                    icon: '📋',
                    label: type,
                    color: 'text-zinc-400',
                };
                return (
                    <button
                        key={type}
                        onClick={e => {
                            e.stopPropagation();
                            if (onNavigate && items[0]) onNavigate(items[0]);
                        }}
                        className={`rounded-full border border-zinc-700/50 px-1.5 py-0.5 text-[10px] font-medium ${cfg.color} hover:bg-zinc-700/50 transition-colors`}
                        title={`${count} ${cfg.label} finding${count > 1 ? 's' : ''}`}
                    >
                        {cfg.icon} {count}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Archaeology Insights Panel ───

function ArchaeologyInsightsPanel() {
    const { digs, loading, error, triggerLoading, fetchFindings, triggerDig } =
        useArchaeology({ limit: 10 });
    const [expandedDig, setExpandedDig] = useState<string | null>(null);
    const [digFindings, setDigFindings] = useState<
        Record<string, ArchaeologyFinding[]>
    >({});

    const handleExpandDig = useCallback(
        async (digId: string) => {
            if (expandedDig === digId) {
                setExpandedDig(null);
                return;
            }
            setExpandedDig(digId);
            if (!digFindings[digId]) {
                const findings = await fetchFindings(digId);
                setDigFindings(prev => ({ ...prev, [digId]: findings }));
            }
        },
        [expandedDig, digFindings, fetchFindings],
    );

    if (loading) {
        return (
            <div className='p-4 space-y-3'>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className='h-16 rounded-lg bg-zinc-800/40 animate-pulse'
                    />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className='p-4'>
                <p className='text-sm text-accent-red'>
                    Failed to load archaeology data: {error}
                </p>
            </div>
        );
    }

    if (digs.length === 0) {
        return (
            <div className='p-8 text-center'>
                <div className='text-3xl mb-2'>🏛️</div>
                <p className='text-sm text-zinc-500 mb-3'>
                    No archaeology digs have been performed yet.
                </p>
                <button
                    onClick={() => triggerDig()}
                    disabled={triggerLoading}
                    className='rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50'
                >
                    {triggerLoading ? 'Starting dig...' : 'Run First Dig'}
                </button>
            </div>
        );
    }

    return (
        <div className='h-128 overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'>
            <div className='px-3 py-2 space-y-2'>
                {/* Trigger button */}
                <div className='flex justify-end mb-1'>
                    <button
                        onClick={() => triggerDig()}
                        disabled={triggerLoading}
                        className='rounded-md bg-zinc-800 border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50'
                    >
                        {triggerLoading ? '⏳ Running...' : '🏛️ New Dig'}
                    </button>
                </div>

                {digs.map(dig => {
                    const isExpanded = expandedDig === dig.dig_id;
                    const findings = digFindings[dig.dig_id] ?? [];
                    const agent = AGENTS[dig.agent_id as AgentId];

                    return (
                        <div
                            key={dig.dig_id}
                            className={`rounded-lg border transition-all ${
                                isExpanded ?
                                    'border-zinc-600 bg-zinc-800/60'
                                :   'border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50'
                            }`}
                        >
                            <div
                                className='flex items-center gap-3 p-3 cursor-pointer'
                                onClick={() => handleExpandDig(dig.dig_id)}
                            >
                                <span className='text-sm'>🏛️</span>
                                <div className='flex-1 min-w-0'>
                                    <div className='flex items-center gap-2'>
                                        <span
                                            className={`text-xs font-medium ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}
                                        >
                                            {agent?.displayName ?? dig.agent_id}
                                        </span>
                                        <span className='text-[10px] text-zinc-600'>
                                            {formatRelativeTime(dig.started_at)}
                                        </span>
                                    </div>
                                    <div className='flex gap-1.5 mt-1'>
                                        {dig.finding_types.map(type => {
                                            const cfg = FINDING_TYPE_BADGE[
                                                type
                                            ] ?? {
                                                icon: '📋',
                                                color: 'text-zinc-500',
                                            };
                                            return (
                                                <span
                                                    key={type}
                                                    className={`text-[10px] ${cfg.color}`}
                                                >
                                                    {cfg.icon}
                                                </span>
                                            );
                                        })}
                                        <span className='text-[10px] text-zinc-600'>
                                            {dig.finding_count} finding
                                            {dig.finding_count !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>
                                <svg
                                    className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    fill='none'
                                    viewBox='0 0 24 24'
                                    stroke='currentColor'
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        d='M19 9l-7 7-7-7'
                                    />
                                </svg>
                            </div>

                            {isExpanded && (
                                <div className='px-3 pb-3 space-y-1.5'>
                                    {findings.length === 0 ?
                                        <div className='py-2 text-center'>
                                            <div className='h-4 w-32 mx-auto rounded bg-zinc-800/50 animate-pulse' />
                                        </div>
                                    :   findings.map(f => {
                                            const cfg = FINDING_TYPE_BADGE[
                                                f.finding_type
                                            ] ?? {
                                                icon: '📋',
                                                label: f.finding_type,
                                                color: 'text-zinc-400',
                                            };
                                            return (
                                                <div
                                                    key={f.id}
                                                    className='rounded-md bg-zinc-900/80 border border-zinc-700/30 px-3 py-2'
                                                >
                                                    <div className='flex items-start gap-2'>
                                                        <span className='text-sm shrink-0'>
                                                            {cfg.icon}
                                                        </span>
                                                        <div className='flex-1 min-w-0'>
                                                            <div className='flex items-center gap-2 mb-0.5'>
                                                                <span
                                                                    className={`text-[10px] font-medium ${cfg.color}`}
                                                                >
                                                                    {cfg.label}
                                                                </span>
                                                                <span className='text-[10px] text-zinc-600 font-mono'>
                                                                    {Math.round(
                                                                        f.confidence *
                                                                            100,
                                                                    )}
                                                                    %
                                                                </span>
                                                            </div>
                                                            <p className='text-xs text-zinc-200 font-medium leading-snug'>
                                                                {f.title}
                                                            </p>
                                                            <p className='text-[11px] text-zinc-400 leading-relaxed mt-0.5'>
                                                                {f.description}
                                                            </p>
                                                            {f.evidence.length >
                                                                0 && (
                                                                <div className='mt-1.5 text-[10px] text-zinc-500'>
                                                                    Based on{' '}
                                                                    {
                                                                        f
                                                                            .evidence
                                                                            .length
                                                                    }{' '}
                                                                    memor
                                                                    {(
                                                                        f
                                                                            .evidence
                                                                            .length ===
                                                                        1
                                                                    ) ?
                                                                        'y'
                                                                    :   'ies'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Memory Card ───

function MemoryCard({
    memory,
    isExpanded,
    onToggle,
    findings,
}: {
    memory: MemoryEntry;
    isExpanded: boolean;
    onToggle: () => void;
    findings?: ArchaeologyFinding[];
}) {
    const agentId = memory.agent_id as AgentId;
    const agent = AGENTS[agentId];
    const typeCfg = MEMORY_TYPE_CONFIG[memory.type];
    const textColor = agent?.tailwindTextColor ?? 'text-zinc-400';

    return (
        <div
            className={`rounded-lg border transition-all ${
                isExpanded ?
                    'border-zinc-600 bg-zinc-800/60'
                :   'border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50'
            }`}
        >
            {/* Header row */}
            <div
                className='flex items-start gap-3 p-3 cursor-pointer'
                onClick={onToggle}
            >
                {/* Timestamp */}
                <div className='shrink-0 w-14 text-right'>
                    <div className='text-[11px] text-zinc-400 font-mono tabular-nums'>
                        {formatTimestamp(memory.created_at)}
                    </div>
                    <div className='text-[9px] text-zinc-600 font-mono'>
                        {formatDate(memory.created_at)}
                    </div>
                </div>

                {/* Agent dot + icon */}
                <div className='flex flex-col items-center gap-0.5 shrink-0 w-10'>
                    <span className='text-sm'>{typeCfg.icon}</span>
                    <span
                        className={`text-[9px] font-semibold ${textColor} uppercase tracking-wide`}
                    >
                        {memory.agent_id}
                    </span>
                </div>

                {/* Content */}
                <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-1'>
                        <span
                            className={`text-[10px] rounded-full border px-1.5 py-0.5 font-medium ${typeCfg.bgColor} ${typeCfg.color}`}
                        >
                            {typeCfg.label}
                        </span>
                        <span className='text-[10px] text-zinc-600'>
                            {formatRelativeTime(memory.created_at)}
                        </span>
                    </div>
                    <p
                        className={`text-sm text-zinc-200 leading-snug ${
                            !isExpanded ? 'line-clamp-2' : ''
                        }`}
                    >
                        {memory.content}
                    </p>

                    {/* Confidence bar */}
                    <div className='mt-2 max-w-48'>
                        <ConfidenceBar value={Number(memory.confidence)} />
                    </div>

                    {/* Tags */}
                    {memory.tags?.length > 0 && (
                        <div className='flex gap-1 mt-1.5 flex-wrap'>
                            {memory.tags.map(tag => (
                                <span
                                    key={tag}
                                    className='rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-500 font-mono'
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Archaeology finding badges */}
                    {findings && findings.length > 0 && (
                        <FindingBadges findings={findings} />
                    )}
                </div>

                {/* Expand chevron */}
                <div className='shrink-0 pt-0.5'>
                    <svg
                        className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                        }`}
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            d='M19 9l-7 7-7-7'
                        />
                    </svg>
                </div>
            </div>

            {/* Expanded detail panel — lineage + metadata */}
            {isExpanded && (
                <div className='px-3 pb-3 space-y-2'>
                    <div className='rounded-md bg-zinc-900/80 border border-zinc-700/30 px-3 py-2'>
                        <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5'>
                            Memory Details
                        </div>
                        <div className='space-y-1.5 text-[11px]'>
                            <div className='flex gap-2'>
                                <span className='text-zinc-500 shrink-0 w-24'>
                                    ID:
                                </span>
                                <span className='text-zinc-400 font-mono text-[10px] break-all'>
                                    {memory.id}
                                </span>
                            </div>
                            <div className='flex gap-2'>
                                <span className='text-zinc-500 shrink-0 w-24'>
                                    Confidence:
                                </span>
                                <span className='text-zinc-300'>
                                    {Math.round(
                                        Number(memory.confidence) * 100,
                                    )}
                                    %
                                </span>
                            </div>
                            <div className='flex gap-2'>
                                <span className='text-zinc-500 shrink-0 w-24'>
                                    Type:
                                </span>
                                <span className={typeCfg.color}>
                                    {typeCfg.icon} {typeCfg.label}
                                </span>
                            </div>
                            {memory.source_trace_id && (
                                <div className='flex gap-2'>
                                    <span className='text-zinc-500 shrink-0 w-24'>
                                        Source:
                                    </span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard
                                                .writeText(
                                                    memory.source_trace_id!,
                                                )
                                                .catch(() => {
                                                    // Fallback: select the text for manual copy if clipboard API fails
                                                    // In non-secure contexts, just ignore the error silently
                                                });
                                        }}
                                        className='text-accent-blue hover:text-accent-blue/80 font-mono text-[10px] break-all text-left underline decoration-dotted'
                                        title='Click to copy trace ID'
                                    >
                                        {memory.source_trace_id}
                                    </button>
                                </div>
                            )}
                            {memory.superseded_by && (
                                <div className='flex gap-2'>
                                    <span className='text-zinc-500 shrink-0 w-24'>
                                        Superseded by:
                                    </span>
                                    <span className='text-accent-yellow font-mono text-[10px]'>
                                        {memory.superseded_by}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Full content (selectable) */}
                    <div className='rounded-md bg-zinc-900/80 border border-zinc-700/30 px-3 py-2 select-text cursor-text'>
                        <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1'>
                            Full Content
                        </div>
                        <p className='text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap'>
                            {memory.content}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Memory Stats Summary ───

function MemoryStats({ memories }: { memories: MemoryEntry[] }) {
    const stats = useMemo(() => {
        const byType: Record<string, number> = {};
        const byAgent: Record<string, number> = {};
        let totalConfidence = 0;

        for (const m of memories) {
            byType[m.type] = (byType[m.type] ?? 0) + 1;
            byAgent[m.agent_id] = (byAgent[m.agent_id] ?? 0) + 1;
            totalConfidence += Number(m.confidence);
        }

        return {
            byType,
            byAgent,
            avgConfidence:
                memories.length > 0 ? totalConfidence / memories.length : 0,
        };
    }, [memories]);

    return (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Total
                </div>
                <div className='text-lg font-semibold text-zinc-100 tabular-nums'>
                    {memories.length}
                </div>
            </div>
            <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Avg Confidence
                </div>
                <div className='text-lg font-semibold text-zinc-100 tabular-nums'>
                    {Math.round(stats.avgConfidence * 100)}%
                </div>
            </div>
            <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Types
                </div>
                <div className='flex gap-1.5 mt-1 flex-wrap'>
                    {ALL_TYPES.map(type => {
                        const count = stats.byType[type] ?? 0;
                        if (count === 0) return null;
                        const cfg = MEMORY_TYPE_CONFIG[type];
                        return (
                            <span
                                key={type}
                                className={`text-[10px] ${cfg.color}`}
                            >
                                {cfg.icon}
                                {count}
                            </span>
                        );
                    })}
                </div>
            </div>
            <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Agents
                </div>
                <div className='flex gap-1.5 mt-1 flex-wrap'>
                    {Object.entries(stats.byAgent).map(([id, count]) => {
                        const agent = AGENTS[id as AgentId];
                        return (
                            <span
                                key={id}
                                className={`text-[10px] font-medium ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}
                            >
                                {id}:{count}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───

export function MemoryExplorer() {
    // Tab + filter state
    const [activeTab, setActiveTab] = useState<ExplorerTab>('memories');
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [selectedTypes, setSelectedTypes] = useState<Set<MemoryType>>(
        new Set(),
    );
    const [minConfidence, setMinConfidence] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Debounced search
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(value);
        }, 300);
    }, []);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, []);

    // Build filters
    const filters: MemoryFilters = useMemo(
        () => ({
            agent_id: selectedAgent ?? undefined,
            type:
                selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
            min_confidence: minConfidence > 0 ? minConfidence : undefined,
            search: debouncedSearch || undefined,
            limit: 200,
        }),
        [selectedAgent, selectedTypes, minConfidence, debouncedSearch],
    );

    const { memories, total, loading, error } = useMemories(filters);

    // Archaeology: fetch latest findings to build badge index
    const { digs: latestDigs } = useArchaeology({ limit: 5 });
    const [allFindings, setAllFindings] = useState<ArchaeologyFinding[]>([]);

    // Fetch findings from recent digs to build the index
    useEffect(() => {
        let cancelled = false;
        async function loadFindings() {
            if (latestDigs.length === 0) return;
            const results: ArchaeologyFinding[] = [];
            for (const dig of latestDigs.slice(0, 3)) {
                try {
                    const res = await fetch(
                        `/api/ops/archaeology?dig_id=${dig.dig_id}`,
                    );
                    if (!res.ok) {
                        // Skip non-OK responses; keep behavior of ignoring individual errors
                        continue;
                    }
                    let data: { findings?: ArchaeologyFinding[] };
                    try {
                        data = await res.json();
                    } catch {
                        // Skip responses that are not valid JSON
                        continue;
                    }
                    if (!cancelled && data && Array.isArray(data.findings)) {
                        results.push(...data.findings);
                    }
                } catch {
                    /* ignore individual fetch errors */
                }
            }
            if (!cancelled) setAllFindings(results);
        }
        loadFindings();
        return () => {
            cancelled = true;
        };
    }, [latestDigs]);

    const findingIndex = useMemo(
        () => buildFindingIndex(allFindings),
        [allFindings],
    );

    const toggleExpanded = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Group memories by date for timeline view
    const groupedMemories = useMemo(() => {
        const groups: { date: string; memories: MemoryEntry[] }[] = [];
        let currentDate = '';

        for (const m of memories) {
            const date = formatDate(m.created_at);
            if (date !== currentDate) {
                currentDate = date;
                groups.push({ date, memories: [m] });
            } else {
                groups[groups.length - 1].memories.push(m);
            }
        }

        return groups;
    }, [memories]);

    if (error) {
        return (
            <div className='rounded-xl border border-accent-red/50 bg-accent-red/10 p-4'>
                <p className='text-sm text-accent-red'>
                    Failed to load memories: {error}
                </p>
            </div>
        );
    }

    return (
        <div className='space-y-4'>
            {/* Stats summary */}
            {!loading && <MemoryStats memories={memories} />}

            {/* Explorer panel */}
            <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
                {/* Header */}
                <div className='px-4 py-3 border-b border-zinc-800'>
                    <div className='flex items-center justify-between mb-3'>
                        <div className='flex items-center gap-2'>
                            <span className='text-xs font-medium text-zinc-400'>
                                🧬 Memory Explorer
                            </span>
                            <span className='text-[10px] text-zinc-600 tabular-nums'>
                                {total} total
                            </span>
                        </div>
                        {/* Tab switcher */}
                        <div className='flex gap-0.5 rounded-md bg-zinc-800/80 p-0.5'>
                            <button
                                onClick={() => setActiveTab('memories')}
                                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    activeTab === 'memories' ?
                                        'bg-zinc-700 text-zinc-100'
                                    :   'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Memories
                            </button>
                            <button
                                onClick={() => setActiveTab('archaeology')}
                                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    activeTab === 'archaeology' ?
                                        'bg-zinc-700 text-zinc-100'
                                    :   'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                🏛️ Archaeology
                            </button>
                        </div>
                    </div>

                    {/* Filters (only shown on memories tab) */}
                    {activeTab === 'memories' && (
                        <div className='space-y-2'>
                            <AgentFilterTabs
                                selected={selectedAgent}
                                onChange={setSelectedAgent}
                            />
                            <TypeFilterChips
                                selected={selectedTypes}
                                onChange={setSelectedTypes}
                            />
                            <div className='flex gap-3 items-end'>
                                <div className='flex-1'>
                                    <SearchInput
                                        value={searchQuery}
                                        onChange={handleSearchChange}
                                    />
                                </div>
                                <div className='flex-1'>
                                    <ConfidenceSlider
                                        value={minConfidence}
                                        onChange={setMinConfidence}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Archaeology tab */}
                {activeTab === 'archaeology' && <ArchaeologyInsightsPanel />}

                {/* Memory timeline (only on memories tab) */}
                {activeTab === 'memories' &&
                    (loading ?
                        <div className='p-4 space-y-3'>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div
                                    key={i}
                                    className='h-20 rounded-lg bg-zinc-800/40 animate-pulse'
                                />
                            ))}
                        </div>
                    : memories.length === 0 ?
                        <div className='p-8 text-center text-sm text-zinc-500'>
                            No memories match the current filters. Adjust
                            filters or wait for agents to form new memories.
                        </div>
                    :   <div className='h-128 overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'>
                            <div className='px-3 py-2 space-y-4'>
                                {groupedMemories.map(group => (
                                    <div key={group.date}>
                                        {/* Date separator */}
                                        <div className='flex items-center gap-2 mb-2'>
                                            <div className='h-px flex-1 bg-zinc-800' />
                                            <span className='text-[10px] text-zinc-600 font-mono shrink-0'>
                                                {group.date}
                                            </span>
                                            <div className='h-px flex-1 bg-zinc-800' />
                                        </div>

                                        {/* Memory cards */}
                                        <div className='space-y-1.5'>
                                            {group.memories.map(memory => (
                                                <MemoryCard
                                                    key={memory.id}
                                                    memory={memory}
                                                    isExpanded={expandedIds.has(
                                                        memory.id,
                                                    )}
                                                    onToggle={() =>
                                                        toggleExpanded(
                                                            memory.id,
                                                        )
                                                    }
                                                    findings={findingIndex.get(
                                                        memory.id,
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>)}
            </div>
        </div>
    );
}
