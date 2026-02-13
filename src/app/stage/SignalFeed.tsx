// Signal Feed — virtualized real-time event feed
'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEvents } from './hooks';
import { SignalFeedSkeleton } from './StageSkeletons';
import type { AgentEvent, AgentId } from '@/lib/types';
import { AGENTS } from '@/lib/agents';

const KIND_ICONS: Record<string, string> = {
    conversation_turn: '💬',
    conversation_started: '🎙️',
    conversation_completed: '✅',
    conversation_failed: '❌',
    proposal_created: '📝',
    proposal_approved: '✅',
    proposal_rejected: '🚫',
    mission_started: '🚀',
    mission_completed: '🏆',
    step_completed: '⚙️',
    step_failed: '💥',
    trigger_fired: '⚡',
    default: '📡',
};

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return `${diffSec}s`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    return `${Math.floor(diffSec / 86400)}d`;
}

function EventRow({ event }: { event: AgentEvent }) {
    const agentId = event.agent_id as AgentId;
    const textColor = AGENTS[agentId]?.tailwindTextColor ?? 'text-zinc-400';
    const borderBg =
        AGENTS[agentId]?.tailwindBorderBg ??
        'border-zinc-400/20 bg-zinc-400/10';
    const icon = KIND_ICONS[event.kind] ?? KIND_ICONS.default;

    return (
        <div
            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-zinc-800/30 ${borderBg}`}
        >
            {/* Agent badge */}
            <div className='flex flex-col items-center gap-1 pt-0.5'>
                <span className='text-base leading-none'>{icon}</span>
                <span className={`text-[10px] font-medium ${textColor}`}>
                    {event.agent_id}
                </span>
            </div>

            {/* Content */}
            <div className='flex-1 min-w-0'>
                <p className='text-sm text-zinc-200 leading-snug truncate'>
                    {event.title}
                </p>
                {event.summary && (
                    <p className='text-xs text-zinc-500 mt-0.5 truncate'>
                        {event.summary}
                    </p>
                )}
                {event.tags.length > 0 && (
                    <div className='flex gap-1 mt-1.5 flex-wrap'>
                        {event.tags.slice(0, 4).map(tag => (
                            <span
                                key={tag}
                                className='rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500'
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Timestamp */}
            <span className='shrink-0 text-[10px] text-zinc-600 tabular-nums pt-0.5'>
                {formatRelativeTime(event.created_at)}
            </span>
        </div>
    );
}

export function SignalFeed({
    agentId,
    kind,
}: {
    agentId?: string;
    kind?: string;
}) {
    const parentRef = useRef<HTMLDivElement>(null);
    const { events, loading, error } = useEvents({
        agentId: agentId ?? undefined,
        kind: kind ?? undefined,
        limit: 500,
    });

    // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual API is intentionally used
    const virtualizer = useVirtualizer({
        count: events.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72,
        overscan: 8,
    });

    if (loading) return <SignalFeedSkeleton />;

    if (error) {
        return (
            <div className='rounded-lg border border-accent-red/50 p-4 text-sm text-red-400'>
                Failed to load events: {error}
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className='rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-500'>
                No events yet. The system will populate this feed as agents
                operate.
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className='h-150 overflow-auto rounded-lg scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'
        >
            <div
                className='relative w-full'
                style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
                {virtualizer.getVirtualItems().map(virtualRow => {
                    const event = events[virtualRow.index];
                    return (
                        <div
                            key={virtualRow.key}
                            className='absolute left-0 top-0 w-full px-0.5'
                            style={{
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <EventRow event={event} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
