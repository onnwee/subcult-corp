// Mission Playback — replay a mission's execution like a video
'use client';

import { useState, useCallback } from 'react';
import { useMissionEvents } from './hooks';
import type { AgentEvent, AgentId } from '@/lib/types';
import { AGENTS } from '@/lib/agents';

const PLAYBACK_SPEED_MS = 2000;

import { useRef, useEffect } from 'react';

/** Timer hook that avoids calling setState synchronously inside useEffect */
function usePlaybackTimer(
    playing: boolean,
    step: number,
    total: number,
    handlers: { onTick: () => void; onEnd: () => void },
) {
    const handlersRef = useRef(handlers);

    useEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        if (!playing || total === 0) return;
        if (step >= total - 1) {
            handlersRef.current.onEnd();
            return;
        }
        const timer = setTimeout(() => {
            handlersRef.current.onTick();
        }, PLAYBACK_SPEED_MS);
        return () => clearTimeout(timer);
    }, [playing, step, total]);
}

function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function Timeline({
    events,
    current,
    onClick,
}: {
    events: AgentEvent[];
    current: number;
    onClick: (idx: number) => void;
}) {
    return (
        <div className='flex items-center gap-0.5 overflow-x-auto pb-2'>
            {events.map((event, i) => {
                const isActive = i === current;
                const isPast = i < current;
                const agentId = event.agent_id as AgentId;
                const agentColor =
                    AGENTS[agentId]?.tailwindTextColor ?? 'text-zinc-500';

                return (
                    <button
                        key={event.id}
                        onClick={() => onClick(i)}
                        className={`group flex flex-col items-center gap-1 px-1`}
                        title={event.title}
                    >
                        {/* Dot */}
                        <div
                            className={`h-3 w-3 rounded-full border-2 transition-all ${
                                isActive ?
                                    'border-accent bg-accent scale-125'
                                : isPast ? 'border-zinc-500 bg-zinc-500'
                                : 'border-zinc-700 bg-transparent group-hover:border-zinc-500'
                            }`}
                        />
                        {/* Step number */}
                        <span
                            className={`text-[9px] ${isActive ? 'text-accent font-bold' : agentColor}`}
                        >
                            {i + 1}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function StepDetail({ event }: { event: AgentEvent }) {
    const agentId = event.agent_id as AgentId;
    const borderColor =
        AGENTS[agentId]?.tailwindBorderBg ?? 'border-zinc-600 bg-zinc-800/50';
    const textColor = AGENTS[agentId]?.tailwindTextColor ?? 'text-zinc-400';

    return (
        <div className={`rounded-lg border p-4 transition-all ${borderColor}`}>
            <div className='flex items-center justify-between mb-2'>
                <span className={`text-xs font-medium ${textColor}`}>
                    {event.agent_id}
                </span>
                <span className='text-[10px] text-zinc-600 tabular-nums'>
                    {formatTime(event.created_at)}
                </span>
            </div>
            <p className='text-sm text-zinc-200'>{event.title}</p>
            {event.summary && (
                <p className='text-xs text-zinc-400 mt-1'>{event.summary}</p>
            )}
            {event.tags.length > 0 && (
                <div className='flex gap-1 mt-2'>
                    {event.tags.map(tag => (
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
    );
}

export function MissionPlayback({
    missionId,
    onClose,
}: {
    missionId: string;
    onClose: () => void;
}) {
    const { events, loading } = useMissionEvents(missionId);
    const [step, setStep] = useState(0);
    const [playing, setPlaying] = useState(false);

    // Playback timer — syncs refs via effects to satisfy React Compiler rules
    usePlaybackTimer(playing, step, events.length, {
        onTick: () => setStep(s => s + 1),
        onEnd: () => setPlaying(false),
    });

    const handlePlayPause = useCallback(() => {
        if (step >= events.length - 1) {
            setStep(0);
            setPlaying(true);
        } else {
            setPlaying(p => !p);
        }
    }, [step, events.length]);

    if (loading) {
        return (
            <div className='rounded-xl border border-zinc-800 bg-zinc-900/80 p-6'>
                <div className='animate-pulse space-y-4'>
                    <div className='h-4 w-32 rounded bg-zinc-700' />
                    <div className='h-20 rounded bg-zinc-800' />
                </div>
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className='rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 text-center'>
                <p className='text-sm text-zinc-500'>
                    No events recorded for this mission.
                </p>
                <button
                    onClick={onClose}
                    className='mt-3 text-xs text-accent hover:text-accent/80'
                >
                    Close
                </button>
            </div>
        );
    }

    return (
        <div className='rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <h3 className='text-sm font-medium text-zinc-200'>
                    Mission Playback
                </h3>
                <button
                    onClick={onClose}
                    className='text-zinc-500 hover:text-zinc-300 transition-colors'
                >
                    <svg
                        className='h-4 w-4'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                    >
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M6 18L18 6M6 6l12 12'
                        />
                    </svg>
                </button>
            </div>

            {/* Timeline */}
            <Timeline events={events} current={step} onClick={setStep} />

            {/* Controls */}
            <div className='flex items-center gap-3'>
                <button
                    onClick={handlePlayPause}
                    className='flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700'
                >
                    {playing ?
                        <svg
                            className='h-4 w-4'
                            fill='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <rect x='6' y='4' width='4' height='16' />
                            <rect x='14' y='4' width='4' height='16' />
                        </svg>
                    :   <svg
                            className='h-4 w-4 ml-0.5'
                            fill='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <polygon points='5,3 19,12 5,21' />
                        </svg>
                    }
                </button>

                <div className='text-xs text-zinc-500 tabular-nums'>
                    {step + 1} / {events.length}
                </div>

                {/* Progress bar */}
                <div className='flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden'>
                    <div
                        className='h-full bg-accent/60 transition-all duration-300'
                        style={{
                            width: `${((step + 1) / events.length) * 100}%`,
                        }}
                    />
                </div>
            </div>

            {/* Current step detail */}
            <StepDetail event={events[step]} />
        </div>
    );
}
