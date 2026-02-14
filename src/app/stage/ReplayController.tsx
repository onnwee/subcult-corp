// ReplayController — floating playback controls for roundtable replay
// Overlays the OfficeRoom when replaying a session
'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { AGENTS } from '@/lib/agents';
import { useTTS } from './useTTS';
import type { AgentId, RoundtableTurn } from '@/lib/types';

// ─── Constants ───

const SPEED_OPTIONS = [
    { label: '1×', ms: 3000 },
    { label: '2×', ms: 1500 },
    { label: '4×', ms: 750 },
] as const;

// ─── Playback Timer Hook ───

/** Timer that auto-advances turns at the given speed. Uses refs for React Compiler compat. */
function useReplayTimer(
    playing: boolean,
    step: number,
    total: number,
    speedMs: number,
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
        }, speedMs);
        return () => clearTimeout(timer);
    }, [playing, step, total, speedMs]);
}

// ─── Progress Bar ───

function ProgressBar({
    turns,
    currentIndex,
    onClick,
}: {
    turns: RoundtableTurn[];
    currentIndex: number;
    onClick: (idx: number) => void;
}) {
    return (
        <div className='flex items-center gap-0.5 flex-1 min-w-0'>
            {turns.map((turn, i) => {
                const agentId = turn.speaker as AgentId;
                const agent = AGENTS[agentId];
                const isActive = i === currentIndex;
                const isPast = i < currentIndex;

                return (
                    <button
                        key={turn.id}
                        onClick={() => onClick(i)}
                        className='group relative flex-1 h-2 min-w-[4px] transition-all'
                        title={`Turn ${i + 1}: ${agent?.displayName ?? turn.speaker}`}
                    >
                        <div
                            className={`h-full rounded-sm transition-all ${
                                isActive ? 'ring-1 ring-white/50 scale-y-150'
                                : isPast ? 'opacity-80'
                                : 'opacity-30 group-hover:opacity-50'
                            }`}
                            style={{ backgroundColor: agent?.color ?? '#666' }}
                        />
                    </button>
                );
            })}
        </div>
    );
}

// ─── Main Component ───

export function ReplayController({
    turns,
    currentTurnIndex,
    onTurnChange,
    onStop,
}: {
    turns: RoundtableTurn[];
    currentTurnIndex: number;
    onTurnChange: (i: number) => void;
    onStop: () => void;
}) {
    const [playing, setPlaying] = useState(true);
    const [speedIdx, setSpeedIdx] = useState(0);
    const speed = SPEED_OPTIONS[speedIdx];
    const [ttsState, ttsControls] = useTTS();
    const [ttsEnabled, setTTSEnabled] = useState(false);
    const prevTurnRef = useRef(currentTurnIndex);

    // Auto-speak current turn when it changes during replay
    useEffect(() => {
        if (!ttsEnabled || !ttsState.isAvailable) return;
        if (currentTurnIndex === prevTurnRef.current) return;
        prevTurnRef.current = currentTurnIndex;

        // At 4× speed, skip TTS (too fast to be useful)
        if (speedIdx === 2) return;

        const turn = turns[currentTurnIndex];
        if (turn) {
            ttsControls.playTurn(turn, currentTurnIndex);
        }
    }, [currentTurnIndex, ttsEnabled, ttsState.isAvailable, speedIdx, turns, ttsControls]);

    // Stop TTS when replay stops or pauses
    useEffect(() => {
        if (!playing && ttsState.isPlaying) {
            ttsControls.stop();
        }
    }, [playing, ttsState.isPlaying, ttsControls]);

    // Stop TTS on unmount
    useEffect(() => {
        return () => {
            ttsControls.stop();
        };
    }, [ttsControls]);

    // Auto-advance timer
    useReplayTimer(playing, currentTurnIndex, turns.length, speed.ms, {
        onTick: () => onTurnChange(currentTurnIndex + 1),
        onEnd: () => setPlaying(false),
    });

    const handlePlayPause = useCallback(() => {
        if (currentTurnIndex >= turns.length - 1) {
            // Restart from beginning
            onTurnChange(0);
            setPlaying(true);
        } else {
            setPlaying(p => !p);
        }
    }, [currentTurnIndex, turns.length, onTurnChange]);

    const handleSpeedCycle = useCallback(() => {
        setSpeedIdx(i => (i + 1) % SPEED_OPTIONS.length);
    }, []);

    const currentTurn = turns[currentTurnIndex];
    const speakerAgent =
        currentTurn ? AGENTS[currentTurn.speaker as AgentId] : undefined;

    return (
        <div className='rounded-xl border border-zinc-700/50 bg-zinc-800/90 backdrop-blur-sm px-4 py-3 shadow-xl'>
            <div className='flex items-center gap-3'>
                {/* Play/Pause */}
                <button
                    onClick={handlePlayPause}
                    className='flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-zinc-200 transition-colors hover:bg-zinc-600 shrink-0'
                    aria-label={playing ? 'Pause' : 'Play'}
                >
                    {playing ?
                        <svg
                            className='h-3.5 w-3.5'
                            fill='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <rect x='6' y='4' width='4' height='16' />
                            <rect x='14' y='4' width='4' height='16' />
                        </svg>
                    :   <svg
                            className='h-3.5 w-3.5 ml-0.5'
                            fill='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <polygon points='5,3 19,12 5,21' />
                        </svg>
                    }
                </button>

                {/* Turn counter + speaker */}
                <div className='flex items-center gap-2 shrink-0'>
                    <span className='text-xs text-zinc-400 tabular-nums font-mono'>
                        {currentTurnIndex + 1}/{turns.length}
                    </span>
                    {speakerAgent && (
                        <span
                            className='text-[10px] font-semibold uppercase tracking-wide'
                            style={{ color: speakerAgent.color }}
                        >
                            {speakerAgent.displayName}
                        </span>
                    )}
                </div>

                {/* Progress bar */}
                <ProgressBar
                    turns={turns}
                    currentIndex={currentTurnIndex}
                    onClick={onTurnChange}
                />

                {/* TTS toggle */}
                {ttsState.isAvailable && (
                    <button
                        onClick={() => setTTSEnabled(v => !v)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-mono transition-colors shrink-0 flex items-center gap-1 ${
                            ttsEnabled
                                ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
                                : 'border-zinc-600 bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50'
                        }`}
                        title={ttsEnabled ? 'Disable voice narration' : 'Enable voice narration (skipped at 4×)'}
                    >
                        <svg className='h-3 w-3' fill='currentColor' viewBox='0 0 24 24'>
                            <path d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z' />
                        </svg>
                        {ttsEnabled ? 'ON' : 'OFF'}
                    </button>
                )}

                {/* Speed toggle */}
                <button
                    onClick={handleSpeedCycle}
                    className='rounded-md border border-zinc-600 bg-zinc-700/50 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:bg-zinc-600/50 transition-colors shrink-0'
                    title='Cycle playback speed'
                >
                    {speed.label}
                </button>

                {/* Stop/Close */}
                <button
                    onClick={onStop}
                    className='flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors shrink-0'
                    aria-label='Stop replay'
                >
                    <svg
                        className='h-3.5 w-3.5'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            d='M6 18L18 6M6 6l12 12'
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
