// MemoryArchaeology — archaeological dig visualization
// Displays memory analysis findings: patterns, contradictions, emergence, echoes, drift
'use client';

import { useState, useEffect, useCallback } from 'react';
import { AGENTS } from '@/lib/agents';
import { useArchaeology } from './hooks';
import type { ArchaeologyFinding, ArchaeologyDigEntry } from './hooks';
import type { AgentId } from '@/lib/types';

// ─── Finding type styling ───

const FINDING_TYPE_CONFIG: Record<
    string,
    { color: string; bg: string; border: string; icon: string; label: string }
> = {
    pattern: {
        color: 'text-green-300',
        bg: 'bg-green-500/10',
        border: 'border-green-500/20',
        icon: '🔄',
        label: 'Pattern',
    },
    contradiction: {
        color: 'text-red-300',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        icon: '⚡',
        label: 'Contradiction',
    },
    emergence: {
        color: 'text-purple-300',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        icon: '🌱',
        label: 'Emergence',
    },
    echo: {
        color: 'text-yellow-300',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/20',
        icon: '🔊',
        label: 'Echo',
    },
    drift: {
        color: 'text-cyan-300',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
        icon: '🌊',
        label: 'Drift',
    },
};

function getFindingStyle(findingType: string) {
    return FINDING_TYPE_CONFIG[findingType] ?? FINDING_TYPE_CONFIG.pattern;
}

// ─── Confidence Bar ───

function ConfidenceBar({ confidence }: { confidence: number }) {
    const pct = Math.round(confidence * 100);
    const color =
        pct >= 80 ? 'bg-green-500'
        : pct >= 60 ? 'bg-yellow-500'
        : pct >= 40 ? 'bg-orange-500'
        : 'bg-red-500';

    return (
        <div className='flex items-center gap-2'>
            <div className='flex-1 h-1.5 rounded-full bg-zinc-700/50 overflow-hidden'>
                <div
                    className={`h-full rounded-full ${color} transition-all`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className='text-[10px] text-zinc-500 font-mono w-8 text-right'>
                {pct}%
            </span>
        </div>
    );
}

// ─── Finding Card ───

function FindingCard({ finding }: { finding: ArchaeologyFinding }) {
    const [showEvidence, setShowEvidence] = useState(false);
    const style = getFindingStyle(finding.finding_type);

    return (
        <div
            className={`rounded-lg border ${style.border} ${style.bg} p-3 space-y-2 transition-all`}
        >
            {/* Header */}
            <div className='flex items-start justify-between gap-2'>
                <div className='flex items-center gap-2 flex-1 min-w-0'>
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${style.color} ${style.bg} border ${style.border} shrink-0`}
                    >
                        {style.icon} {style.label}
                    </span>
                    <span className='text-sm text-zinc-200 font-medium truncate'>
                        {finding.title}
                    </span>
                </div>
                <ConfidenceBar confidence={finding.confidence} />
            </div>

            {/* Description */}
            <p className='text-xs text-zinc-400 leading-relaxed'>
                {finding.description}
            </p>

            {/* Related agents */}
            {finding.related_agents.length > 0 && (
                <div className='flex items-center gap-1.5'>
                    {finding.related_agents.map(agentId => {
                        const agent = AGENTS[agentId as AgentId];
                        return (
                            <span
                                key={agentId}
                                className='text-[10px] font-bold uppercase tracking-wider'
                                style={{ color: agent?.color ?? '#888' }}
                            >
                                {agent?.displayName ?? agentId}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Evidence toggle */}
            {finding.evidence.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowEvidence(e => !e)}
                        className='text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors uppercase tracking-wider font-mono flex items-center gap-1'
                    >
                        <svg
                            className={`h-2.5 w-2.5 transition-transform ${showEvidence ? 'rotate-90' : ''}`}
                            fill='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <polygon points='8,4 18,12 8,20' />
                        </svg>
                        {finding.evidence.length} evidence
                        {finding.evidence.length === 1 ? '' : ' items'}
                    </button>
                    {showEvidence && (
                        <div className='mt-2 space-y-2 pl-3 border-l border-zinc-700/30'>
                            {finding.evidence.map((ev, i) => (
                                <div key={i} className='space-y-0.5'>
                                    <p className='text-[11px] text-zinc-300 italic'>
                                        &quot;{ev.excerpt}&quot;
                                    </p>
                                    <p className='text-[10px] text-zinc-500'>
                                        {ev.relevance}
                                    </p>
                                    <p className='text-[9px] text-zinc-600 font-mono'>
                                        memory: {ev.memory_id.slice(0, 8)}…
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Dig Card ───

function DigCard({
    dig,
    isExpanded,
    onToggle,
}: {
    dig: ArchaeologyDigEntry;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const [findings, setFindings] = useState<ArchaeologyFinding[]>([]);
    const [findingsLoading, setFindingsLoading] = useState(false);
    const { fetchFindings } = useArchaeology();
    const agent = AGENTS[dig.agent_id as AgentId];
    const created = new Date(dig.started_at);

    const loadFindings = useCallback(async () => {
        setFindingsLoading(true);
        try {
            const data = await fetchFindings(dig.dig_id);
            setFindings(data);
        } finally {
            setFindingsLoading(false);
        }
    }, [dig.dig_id, fetchFindings]);

    useEffect(() => {
        if (isExpanded && findings.length === 0) {
            loadFindings();
        }
    }, [isExpanded, findings.length, loadFindings]);

    return (
        <div className='rounded-xl border border-zinc-700/30 bg-zinc-800/30 overflow-hidden'>
            {/* Dig header */}
            <button
                onClick={onToggle}
                className='w-full flex items-center justify-between p-4 hover:bg-zinc-700/20 transition-colors text-left'
            >
                <div className='flex items-center gap-3'>
                    <span className='text-lg'>🏛️</span>
                    <div>
                        <div className='flex items-center gap-2'>
                            <span
                                className='text-xs font-bold uppercase tracking-wider'
                                style={{ color: agent?.color ?? '#888' }}
                            >
                                {agent?.displayName ?? dig.agent_id}
                            </span>
                            <span className='text-[10px] text-zinc-600 font-mono'>
                                {created.toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true,
                                })}
                            </span>
                        </div>
                        <div className='flex items-center gap-1.5 mt-1'>
                            {dig.finding_types.map(type => {
                                const style = getFindingStyle(type);
                                return (
                                    <span
                                        key={type}
                                        className={`inline-flex items-center gap-0.5 text-[9px] ${style.color}`}
                                        title={style.label}
                                    >
                                        {style.icon}
                                    </span>
                                );
                            })}
                            <span className='text-[10px] text-zinc-500'>
                                {dig.finding_count} finding
                                {dig.finding_count === 1 ? '' : 's'}
                            </span>
                        </div>
                    </div>
                </div>
                <svg
                    className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
            </button>

            {/* Expanded findings */}
            {isExpanded && (
                <div className='px-4 pb-4 space-y-2 border-t border-zinc-700/20'>
                    {findingsLoading ?
                        <div className='py-4 text-center'>
                            <div className='text-[10px] text-zinc-500 animate-pulse'>
                                Loading findings…
                            </div>
                        </div>
                    : findings.length === 0 ?
                        <div className='py-4 text-center text-[10px] text-zinc-600'>
                            No findings recorded for this dig.
                        </div>
                    :   <div className='pt-3 space-y-2'>
                            {findings.map(finding => (
                                <FindingCard
                                    key={finding.id}
                                    finding={finding}
                                />
                            ))}
                        </div>
                    }
                </div>
            )}
        </div>
    );
}

// ─── Filter chips ───

const FINDING_TYPES = [
    'all',
    'pattern',
    'contradiction',
    'emergence',
    'echo',
    'drift',
] as const;

// ─── Main Component ───

export function MemoryArchaeology() {
    const { digs, loading, error, triggerLoading, triggerDig } =
        useArchaeology();
    const [expandedDig, setExpandedDig] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<string>('all');

    // Filter digs by finding type
    const filteredDigs =
        typeFilter === 'all' ? digs : (
            digs.filter(d => d.finding_types.includes(typeFilter))
        );

    return (
        <div className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div>
                    <h2 className='text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2'>
                        <span className='text-lg'>🏛️</span>
                        Memory Archaeology
                    </h2>
                    <p className='text-[10px] text-zinc-600 mt-0.5'>
                        Deep analysis of collective memory — patterns,
                        contradictions, and drift
                    </p>
                </div>
                <button
                    onClick={() => triggerDig()}
                    disabled={triggerLoading}
                    className='flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                >
                    {triggerLoading ?
                        <>
                            <svg
                                className='h-3 w-3 animate-spin'
                                viewBox='0 0 24 24'
                                fill='none'
                            >
                                <circle
                                    cx='12'
                                    cy='12'
                                    r='10'
                                    stroke='currentColor'
                                    strokeWidth='3'
                                    className='opacity-25'
                                />
                                <path
                                    d='M4 12a8 8 0 018-8'
                                    stroke='currentColor'
                                    strokeWidth='3'
                                    strokeLinecap='round'
                                    className='opacity-75'
                                />
                            </svg>
                            Digging…
                        </>
                    :   <>⛏️ Run New Dig</>}
                </button>
            </div>

            {/* Finding type filter */}
            <div className='flex items-center gap-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-0.5'>
                {FINDING_TYPES.map(t => {
                    const style = t !== 'all' ? getFindingStyle(t) : null;
                    return (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors uppercase tracking-wider ${
                                typeFilter === t ?
                                    `bg-zinc-700 ${style?.color ?? 'text-zinc-100'}`
                                :   'text-zinc-500 hover:text-zinc-400'
                            }`}
                        >
                            {t === 'all' ?
                                'All Types'
                            :   `${style?.icon ?? ''} ${style?.label ?? t}`}
                        </button>
                    );
                })}
            </div>

            {/* Dig list */}
            {loading ?
                <ArchaeologySkeleton />
            : error ?
                <div className='rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400'>
                    Failed to load archaeology data: {error}
                </div>
            : filteredDigs.length === 0 ?
                <div className='rounded-xl border border-zinc-700/30 bg-zinc-800/30 p-8 text-center'>
                    <div className='text-2xl mb-2'>🏛️</div>
                    <p className='text-xs text-zinc-500'>
                        No archaeological digs yet. Chora performs weekly
                        analyses of collective memory.
                    </p>
                </div>
            :   <div className='space-y-2'>
                    {filteredDigs.map(dig => (
                        <DigCard
                            key={dig.dig_id}
                            dig={dig}
                            isExpanded={expandedDig === dig.dig_id}
                            onToggle={() =>
                                setExpandedDig(
                                    expandedDig === dig.dig_id ?
                                        null
                                    :   dig.dig_id,
                                )
                            }
                        />
                    ))}
                </div>
            }
        </div>
    );
}

// ─── Skeleton ───

function ArchaeologySkeleton() {
    return (
        <div className='space-y-2'>
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className='rounded-xl border border-zinc-700/20 bg-zinc-800/20 p-4 space-y-3'
                >
                    <div className='flex items-center gap-2'>
                        <div className='h-4 w-4 rounded bg-zinc-700/40 animate-pulse' />
                        <div className='h-3 w-20 rounded bg-zinc-700/40 animate-pulse' />
                        <div className='h-3 w-32 rounded bg-zinc-700/30 animate-pulse' />
                    </div>
                    <div className='flex items-center gap-1'>
                        <div className='h-3 w-12 rounded bg-zinc-700/20 animate-pulse' />
                        <div className='h-3 w-16 rounded bg-zinc-700/20 animate-pulse' />
                    </div>
                </div>
            ))}
        </div>
    );
}
