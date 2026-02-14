// DreamLog — dreamy visualization of agent dream cycles
// Dark aesthetic with shimmer animations and type-colored badges
'use client';

import { useState } from 'react';
import { AGENTS } from '@/lib/agents';
import { useDreams } from './hooks';
import type { AgentId } from '@/lib/types';

// ─── Dream type styling ───

const DREAM_TYPE_CONFIG: Record<
    string,
    { color: string; bg: string; border: string; icon: string }
> = {
    recombination: {
        color: 'text-blue-300',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        icon: '🔄',
    },
    extrapolation: {
        color: 'text-purple-300',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        icon: '🔮',
    },
    contradiction: {
        color: 'text-orange-300',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20',
        icon: '⚡',
    },
    synthesis: {
        color: 'text-emerald-300',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        icon: '🌿',
    },
};

function getDreamStyle(dreamType: string) {
    return DREAM_TYPE_CONFIG[dreamType] ?? DREAM_TYPE_CONFIG.recombination;
}

// ─── Dream Card ───

function DreamCard({ dream }: { dream: DreamEntry }) {
    const [expanded, setExpanded] = useState(false);
    const agent = AGENTS[dream.agent_id as AgentId];
    const style = getDreamStyle(dream.dream_type);
    const created = new Date(dream.created_at);

    return (
        <div
            className={`group relative rounded-xl border ${style.border} ${style.bg} p-4 transition-all hover:border-opacity-50 backdrop-blur-sm dream-shimmer`}
        >
            {/* Floating shimmer effect */}
            <div className='absolute inset-0 rounded-xl overflow-hidden pointer-events-none'>
                <div className='absolute -inset-full bg-gradient-to-r from-transparent via-white/[0.02] to-transparent dream-shimmer-sweep' />
            </div>

            {/* Header */}
            <div className='flex items-center justify-between mb-3 relative'>
                <div className='flex items-center gap-2'>
                    <span
                        className='text-xs font-bold uppercase tracking-wider'
                        style={{ color: agent?.color ?? '#888' }}
                    >
                        {agent?.displayName ?? dream.agent_id}
                    </span>
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${style.color} ${style.bg} border ${style.border}`}
                    >
                        {style.icon} {dream.dream_type}
                    </span>
                </div>
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

            {/* Dream content */}
            <p className='text-sm text-zinc-300 leading-relaxed italic relative'>
                &quot;{dream.dream_content}&quot;
            </p>

            {/* Source memories (expandable) */}
            {dream.source_memories && dream.source_memories.length > 0 && (
                <div className='mt-3'>
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className='text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors uppercase tracking-wider font-mono flex items-center gap-1'
                    >
                        <svg
                            className={`h-2.5 w-2.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
                            fill='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <polygon points='8,4 18,12 8,20' />
                        </svg>
                        {dream.source_memories.length} source{' '}
                        {dream.source_memories.length === 1 ?
                            'memory'
                        :   'memories'}
                    </button>
                    {expanded && (
                        <div className='mt-2 space-y-1.5 pl-3 border-l border-zinc-700/30'>
                            {dream.source_memories.map(
                                (id: string, i: number) => (
                                    <div
                                        key={id}
                                        className='text-[11px] text-zinc-500 font-mono truncate'
                                    >
                                        {i + 1}. {id.slice(0, 8)}…
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Filter Bar ───

const DREAM_TYPES = [
    'all',
    'recombination',
    'extrapolation',
    'contradiction',
    'synthesis',
] as const;
const AGENTS_LIST = [
    'all',
    'chora',
    'subrosa',
    'thaum',
    'praxis',
    'mux',
] as const;

// ─── Types ───

interface DreamEntry {
    id: string;
    agent_id: string;
    source_memories: string[];
    dream_content: string;
    dream_type: string;
    new_memory_id: string | null;
    created_at: string;
}

// ─── Main Component ───

export function DreamLog() {
    const [agentFilter, setAgentFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    const { dreams, loading, error } = useDreams({
        agentId: agentFilter === 'all' ? undefined : agentFilter,
        dreamType: typeFilter === 'all' ? undefined : typeFilter,
        limit: 50,
    });

    return (
        <div className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div>
                    <h2 className='text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2'>
                        <span className='text-lg'>💭</span>
                        Dream Cycles
                    </h2>
                    <p className='text-[10px] text-zinc-600 mt-0.5'>
                        Subconscious memory recombination — agents dream during
                        quiet hours
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className='flex flex-wrap gap-2'>
                {/* Agent filter */}
                <div className='flex items-center gap-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-0.5'>
                    {AGENTS_LIST.map(a => (
                        <button
                            key={a}
                            onClick={() => setAgentFilter(a)}
                            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors uppercase tracking-wider ${
                                agentFilter === a ?
                                    'bg-zinc-700 text-zinc-100'
                                :   'text-zinc-500 hover:text-zinc-400'
                            }`}
                            style={
                                agentFilter === a && a !== 'all' ?
                                    { color: AGENTS[a as AgentId]?.color }
                                :   undefined
                            }
                        >
                            {a === 'all' ?
                                'All Agents'
                            :   (AGENTS[a as AgentId]?.displayName ?? a)}
                        </button>
                    ))}
                </div>

                {/* Type filter */}
                <div className='flex items-center gap-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-0.5'>
                    {DREAM_TYPES.map(t => {
                        const style = t !== 'all' ? getDreamStyle(t) : null;
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
                                :   `${style?.icon ?? ''} ${t}`}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Dream list */}
            {loading ?
                <DreamLogSkeleton />
            : error ?
                <div className='rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400'>
                    Failed to load dreams: {error}
                </div>
            : dreams.length === 0 ?
                <div className='rounded-xl border border-zinc-700/30 bg-zinc-800/30 p-8 text-center'>
                    <div className='text-2xl mb-2'>🌙</div>
                    <p className='text-xs text-zinc-500'>
                        No dream cycles recorded yet. Dreams occur during quiet
                        hours (midnight–6AM CST).
                    </p>
                </div>
            :   <div className='grid gap-3'>
                    {(dreams as DreamEntry[]).map(dream => (
                        <DreamCard key={dream.id} dream={dream} />
                    ))}
                </div>
            }

            {/* CSS for shimmer effect */}
            <style jsx global>{`
                .dream-shimmer {
                    position: relative;
                    overflow: hidden;
                }
                .dream-shimmer-sweep {
                    animation: dream-sweep 6s ease-in-out infinite;
                }
                @keyframes dream-sweep {
                    0% {
                        transform: translateX(-100%);
                    }
                    50% {
                        transform: translateX(100%);
                    }
                    100% {
                        transform: translateX(-100%);
                    }
                }
            `}</style>
        </div>
    );
}

// ─── Skeleton ───

function DreamLogSkeleton() {
    return (
        <div className='grid gap-3'>
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className='rounded-xl border border-zinc-700/20 bg-zinc-800/20 p-4 space-y-3'
                >
                    <div className='flex items-center gap-2'>
                        <div className='h-3 w-16 rounded bg-zinc-700/40 animate-pulse' />
                        <div className='h-3 w-24 rounded bg-zinc-700/30 animate-pulse' />
                    </div>
                    <div className='space-y-1.5'>
                        <div className='h-3 w-full rounded bg-zinc-700/20 animate-pulse' />
                        <div className='h-3 w-3/4 rounded bg-zinc-700/20 animate-pulse' />
                    </div>
                </div>
            ))}
        </div>
    );
}
