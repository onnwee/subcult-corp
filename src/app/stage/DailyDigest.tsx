// DailyDigest — collapsible card showing Mux's daily narrative summary
// Phase 6: Daily Digest & Reporting
'use client';

import { useState, useMemo } from 'react';
import { useDigest, type DigestEntry } from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

// ─── Formatting helpers ───

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatShortDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getAgentColor(agentId: string): string {
    const agent = AGENTS[agentId as AgentId];
    return agent?.color ?? '#71717a';
}

function getAgentName(agentId: string): string {
    const agent = AGENTS[agentId as AgentId];
    return agent?.displayName ?? agentId;
}

// ─── Stat Badge ───

function StatBadge({
    label,
    value,
}: {
    label: string;
    value: number | string;
}) {
    return (
        <span className='inline-flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-400 border border-zinc-700/50'>
            <span className='font-medium text-zinc-300'>{value}</span>
            <span>{label}</span>
        </span>
    );
}

// ─── Loading Skeleton ───

function DigestSkeleton() {
    return (
        <div className='rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-4 animate-pulse'>
            <div className='flex items-center gap-2 mb-3'>
                <div className='h-4 w-4 rounded bg-zinc-700' />
                <div className='h-4 w-24 rounded bg-zinc-700' />
                <div className='h-3 w-32 rounded bg-zinc-800 ml-auto' />
            </div>
            <div className='space-y-2'>
                <div className='h-3 w-full rounded bg-zinc-800' />
                <div className='h-3 w-5/6 rounded bg-zinc-800' />
                <div className='h-3 w-4/6 rounded bg-zinc-800' />
            </div>
        </div>
    );
}

// ─── Digest Content ───

function DigestContent({ digest }: { digest: DigestEntry }) {
    const stats = digest.stats;
    const highlights = digest.highlights ?? [];

    return (
        <div className='space-y-3'>
            {/* Stats badges */}
            <div className='flex flex-wrap gap-1.5'>
                {stats.events > 0 && (
                    <StatBadge label='events' value={stats.events} />
                )}
                {stats.conversations > 0 && (
                    <StatBadge
                        label='conversations'
                        value={stats.conversations}
                    />
                )}
                {stats.missions_succeeded > 0 && (
                    <StatBadge
                        label='missions'
                        value={stats.missions_succeeded}
                    />
                )}
                {stats.memories > 0 && (
                    <StatBadge label='memories' value={stats.memories} />
                )}
                {stats.costs > 0 && (
                    <StatBadge
                        label='cost'
                        value={`$${stats.costs.toFixed(4)}`}
                    />
                )}
            </div>

            {/* Summary text */}
            <div className='text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap'>
                {digest.summary}
            </div>

            {/* Highlights */}
            {highlights.length > 0 && (
                <div className='space-y-1.5'>
                    <p className='text-[10px] font-medium text-zinc-500 uppercase tracking-wider'>
                        Highlights
                    </p>
                    <ul className='space-y-1'>
                        {highlights.map((h, i) => (
                            <li
                                key={i}
                                className='flex items-start gap-2 text-[12px] text-zinc-400'
                            >
                                <span
                                    className='mt-1.5 h-1.5 w-1.5 rounded-full shrink-0'
                                    style={{
                                        backgroundColor:
                                            h.agentId ?
                                                getAgentColor(h.agentId)
                                            :   '#71717a',
                                    }}
                                />
                                <span>
                                    {h.agentId && (
                                        <span
                                            className='font-medium mr-1'
                                            style={{
                                                color: getAgentColor(h.agentId),
                                            }}
                                        >
                                            {getAgentName(h.agentId)}:
                                        </span>
                                    )}
                                    {h.title}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───

export function DailyDigest() {
    const [collapsed, setCollapsed] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | undefined>(
        undefined,
    );
    const { digest, digests, loading, error } = useDigest(selectedDate);

    // Build date navigation from available digests
    const availableDates = useMemo(() => {
        if (selectedDate || digests.length === 0) return [];
        return digests.map(d => d.digest_date);
    }, [digests, selectedDate]);

    // Mux's color from agents config
    const muxColor = AGENTS.mux.color;

    if (loading) return <DigestSkeleton />;
    if (error || !digest) {
        return (
            <div className='rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-4'>
                <div className='flex items-center gap-2 text-zinc-500 text-sm'>
                    <span>🗂️</span>
                    <span>
                        No digest available yet. Digests generate daily at 11PM
                        CST.
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className='rounded-lg border border-zinc-800/80 bg-zinc-900/50 overflow-hidden'>
            {/* Header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className='w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-800/30 transition-colors'
            >
                <span className='text-base'>🗂️</span>
                <span
                    className='text-sm font-medium'
                    style={{ color: muxColor }}
                >
                    Mux&apos;s Daily Digest
                </span>
                <span className='text-[11px] text-zinc-500 ml-1'>
                    {formatDate(digest.digest_date)}
                </span>
                <span className='ml-auto text-[10px] text-zinc-600'>
                    {collapsed ? '▸' : '▾'}
                </span>
            </button>

            {/* Collapsible content */}
            {!collapsed && (
                <div className='px-4 pb-4 space-y-3'>
                    {/* Date navigation (only when viewing list, not a specific date) */}
                    {!selectedDate && availableDates.length > 1 && (
                        <div className='flex items-center gap-1 flex-wrap'>
                            {availableDates.map(d => (
                                <button
                                    key={d}
                                    onClick={() =>
                                        setSelectedDate(
                                            d === digest.digest_date ?
                                                undefined
                                            :   d,
                                        )
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                                        d === digest.digest_date ?
                                            'bg-zinc-700 text-zinc-200'
                                        :   'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {formatShortDate(d)}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Back button when viewing specific date */}
                    {selectedDate && (
                        <button
                            onClick={() => setSelectedDate(undefined)}
                            className='text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors'
                        >
                            ← back to latest
                        </button>
                    )}

                    <DigestContent digest={digest} />
                </div>
            )}
        </div>
    );
}
