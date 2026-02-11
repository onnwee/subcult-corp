// Stage Header — title bar, stats, and view toggle
'use client';

import { useSystemStats, type SystemStats } from './hooks';
import { StatsBarSkeleton } from './StageSkeletons';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

export type ViewMode = 'feed' | 'missions' | 'office' | 'logs';

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className='flex-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3'>
            <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                {label}
            </div>
            <div className='text-lg font-semibold text-zinc-100 tabular-nums'>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
        </div>
    );
}

export function StageHeader({
    view,
    onViewChange,
}: {
    view: ViewMode;
    onViewChange: (v: ViewMode) => void;
}) {
    const { stats, loading } = useSystemStats();

    const views: { key: ViewMode; label: string; icon: string }[] = [
        { key: 'feed', label: 'Signal Feed', icon: '📡' },
        { key: 'missions', label: 'Missions', icon: '🎯' },
        { key: 'office', label: 'Office', icon: '🏢' },
        { key: 'logs', label: 'Cortex', icon: '🧠' },
    ];

    return (
        <header className='space-y-4'>
            {/* Title row */}
            <div className='flex items-center justify-between'>
                <div>
                    <h1 className='text-xl font-bold text-zinc-100 tracking-tight'>
                        SUBCULT OPS
                    </h1>
                    <p className='text-xs text-zinc-500 mt-0.5'>
                        Multi-agent command center
                    </p>
                </div>

                {/* View toggle */}
                <div className='flex gap-1 rounded-lg bg-zinc-800/50 p-1 border border-zinc-700/50'>
                    {views.map(v => (
                        <button
                            key={v.key}
                            onClick={() => onViewChange(v.key)}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                view === v.key ?
                                    'bg-zinc-700 text-zinc-100'
                                :   'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
                            }`}
                        >
                            <span>{v.icon}</span>
                            <span className='hidden sm:inline'>{v.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats bar */}
            {loading ?
                <StatsBarSkeleton />
            : stats ?
                <StatsBar stats={stats} />
            :   null}
        </header>
    );
}

function StatsBar({ stats }: { stats: SystemStats }) {
    return (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3'>
            <StatCard label='Events' value={stats.totalEvents} />
            <StatCard label='Active Missions' value={stats.activeMissions} />
            <StatCard label='Conversations' value={stats.totalConversations} />
            <div className='flex-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3'>
                <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Agent Memories
                </div>
                <div className='flex gap-3 mt-1'>
                    {Object.entries(stats.agentMemories).map(
                        ([agent, count]) => {
                            const agentId = agent as AgentId;
                            const color =
                                AGENTS[agentId]?.tailwindTextColor ??
                                'text-zinc-400';
                            return (
                                <span
                                    key={agent}
                                    className={`text-xs font-medium ${color}`}
                                >
                                    {agent}: {count}
                                </span>
                            );
                        },
                    )}
                    {Object.keys(stats.agentMemories).length === 0 && (
                        <span className='text-xs text-zinc-500'>None yet</span>
                    )}
                </div>
            </div>
        </div>
    );
}
