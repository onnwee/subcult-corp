// Stage Header — title bar, stats, and view toggle
'use client';

import { useState, useCallback } from 'react';
import {
    useSystemStats,
    type SystemStats,
    type ConnectionStatus,
} from './hooks';
import { StatsBarSkeleton } from './StageSkeletons';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

export type ViewMode =
    | 'feed'
    | 'missions'
    | 'office'
    | 'logs'
    | 'costs'
    | 'memories'
    | 'relationships'
    | 'content'
    | 'governance'
    | 'dreams';

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
    const config: Record<
        ConnectionStatus,
        { color: string; pulse: boolean; label: string; tooltip: string }
    > = {
        connected: {
            color: 'bg-accent-green',
            pulse: false,
            label: 'Live',
            tooltip: 'SSE connection active — real-time updates',
        },
        reconnecting: {
            color: 'bg-accent-yellow',
            pulse: true,
            label: 'Reconnecting...',
            tooltip: 'SSE connection lost — attempting to reconnect',
        },
        polling: {
            color: 'bg-zinc-500',
            pulse: false,
            label: 'Polling',
            tooltip: 'SSE unavailable — using HTTP polling fallback',
        },
    };

    const { color, pulse, label, tooltip } = config[status];

    return (
        <span
            className='flex items-center gap-1.5 cursor-default'
            title={tooltip}
        >
            <span className='relative flex h-2 w-2'>
                {pulse && (
                    <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}
                    />
                )}
                <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${color}`}
                />
            </span>
            <span className='text-[10px] text-zinc-500 font-medium'>
                {label}
            </span>
        </span>
    );
}

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
    connectionStatus,
}: {
    view: ViewMode;
    onViewChange: (v: ViewMode) => void;
    connectionStatus?: ConnectionStatus;
}) {
    const { stats, loading } = useSystemStats();
    const [copied, setCopied] = useState(false);

    const handleShareClick = useCallback((e: React.MouseEvent) => {
        const liveUrl = `${window.location.origin}/live`;

        // Alt-click opens in new tab
        if (e.altKey) {
            window.open(liveUrl, '_blank');
            return;
        }

        navigator.clipboard.writeText(liveUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

    const views: { key: ViewMode; label: string; icon: string }[] = [
        { key: 'feed', label: 'Signal Feed', icon: '📡' },
        { key: 'missions', label: 'Missions', icon: '🎯' },
        { key: 'office', label: 'Office', icon: '🏢' },
        { key: 'logs', label: 'Cortex', icon: '🧠' },
        { key: 'costs', label: 'Costs', icon: '💰' },
        { key: 'memories', label: 'Memories', icon: '🧬' },
        { key: 'relationships', label: 'Graph', icon: '🌐' },
        { key: 'content', label: 'Content', icon: '📝' },
        { key: 'governance', label: 'Governance', icon: '⚖️' },
        { key: 'dreams', label: 'Dreams', icon: '💭' },
    ];

    return (
        <header className='space-y-4'>
            {/* Title row */}
            <div className='flex items-center justify-between'>
                <div>
                    <div className='flex items-center gap-2'>
                        <h1 className='text-xl font-bold text-zinc-100 tracking-tight'>
                            SUBCULT OPS
                        </h1>
                        {connectionStatus && (
                            <ConnectionIndicator status={connectionStatus} />
                        )}
                    </div>
                    <p className='text-xs text-zinc-500 mt-0.5'>
                        Multi-agent command center
                    </p>
                </div>

                {/* Share link button */}
                <button
                    onClick={handleShareClick}
                    className='flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors border border-zinc-700/50'
                    title='Copy /live link (Alt+click to open)'
                >
                    {copied ?
                        <>
                            <svg
                                className='w-3.5 h-3.5 text-accent-green'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    d='M5 13l4 4L19 7'
                                />
                            </svg>
                            <span className='text-accent-green'>Copied!</span>
                        </>
                    :   <>
                            <svg
                                className='w-3.5 h-3.5'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
                                />
                            </svg>
                            <span className='hidden sm:inline'>Share Live</span>
                        </>
                    }
                </button>

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
