// TranscriptViewer — formal meeting minutes / court transcript style
// Designed to be printable — clean monospace layout, no bubbles
'use client';

import { useRef, useEffect, useState } from 'react';
import { useConversationTurns, useTurnStream } from './hooks';
import { useTTS } from './useTTS';
import { AGENTS } from '@/lib/agents';
import type { AgentId, RoundtableSession, RoundtableTurn } from '@/lib/types';
import type { TTSState, TTSControls } from './useTTS';

// ─── Agent voice symbols ───

const VOICE_SYMBOLS: Record<string, string> = {
    chora: '\u{1F300}', // 🌀
    subrosa: '\u{1F339}', // 🌹
    thaum: '\u{2728}', // ✨
    praxis: '\u{1F6E0}', // 🛠️
    mux: '\u{1F5C2}', // 🗂️
    primus: '\u{265B}', // ♛
};

// ─── Helpers ───

function formatFullDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function computeDuration(start?: string, end?: string): string {
    if (!start || !end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min}m ${remSec}s`;
}

// ─── Print handler ───

function handlePrint(el: HTMLElement | null) {
    if (!el) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html><head>
<title>Subcult Ops — Transcript</title>
<style>
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #111; max-width: 72ch; margin: 2em auto; line-height: 1.6; }
    .header { border-bottom: 2px solid #111; padding-bottom: 1em; margin-bottom: 1.5em; }
    .header h1 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.15em; margin: 0; }
    .header h2 { font-size: 13px; margin: 0.5em 0 0; font-weight: normal; }
    .meta { margin: 1em 0; }
    .meta-row { display: flex; gap: 1em; }
    .meta-label { font-weight: bold; min-width: 12ch; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; }
    .meta-value { }
    .participants { margin: 1em 0; padding: 0.8em 0; border-top: 1px solid #999; border-bottom: 1px solid #999; }
    .participants-title { font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; margin-bottom: 0.4em; }
    .participant { margin-left: 2em; }
    .proceedings { margin-top: 1.5em; }
    .proceedings-title { font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; border-bottom: 1px solid #999; padding-bottom: 0.3em; margin-bottom: 1em; }
    .turn { margin-bottom: 1.2em; page-break-inside: avoid; }
    .turn-header { font-weight: bold; }
    .turn-number { }
    .turn-time { color: #666; font-size: 11px; }
    .turn-dialogue { margin-top: 0.2em; margin-left: 2em; }
    .footer { border-top: 2px solid #111; margin-top: 2em; padding-top: 0.8em; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; text-align: center; color: #666; }
    @media print { body { margin: 1cm; } }
</style>
</head><body>`);
    printWindow.document.write(el.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
}

// ─── Single Turn Entry ───

function TurnEntry({
    turn,
    index,
    ttsState,
    ttsControls,
}: {
    turn: RoundtableTurn;
    index: number;
    ttsState?: TTSState;
    ttsControls?: TTSControls;
}) {
    const agentId = turn.speaker as AgentId;
    const agent = AGENTS[agentId];
    const textColor = agent?.tailwindTextColor ?? 'text-zinc-400';
    const symbol = VOICE_SYMBOLS[turn.speaker] ?? '';
    const isSpeaking = ttsState?.activeTurnIndex === index;

    return (
        <div
            className={`turn mb-4 transition-colors rounded-md -mx-2 px-2 py-0.5 ${
                isSpeaking ? 'bg-zinc-800/80 ring-1 ring-zinc-600/50' : ''
            }`}
        >
            <div className='turn-header flex items-baseline gap-2'>
                <span className='turn-number text-[10px] text-zinc-600 font-mono tabular-nums w-6 text-right shrink-0'>
                    {index + 1}.
                </span>
                <span
                    className={`text-xs font-bold uppercase tracking-wide ${textColor}`}
                >
                    {symbol} {agent?.displayName ?? turn.speaker}
                </span>
                <span className='turn-time text-[10px] text-zinc-600 font-mono'>
                    [{formatTime(turn.created_at)}]
                </span>
                {ttsState?.isAvailable && ttsControls && (
                    <button
                        onClick={() =>
                            isSpeaking ?
                                ttsControls.stop()
                            :   ttsControls.playTurn(turn, index)
                        }
                        className={`text-[10px] transition-colors p-0.5 rounded hover:bg-zinc-700/50 ${
                            isSpeaking ?
                                'text-accent-blue animate-pulse'
                            :   'text-zinc-600 hover:text-zinc-400'
                        }`}
                        title={isSpeaking ? 'Stop speaking' : 'Speak this turn'}
                    >
                        {isSpeaking ?
                            <svg className='h-3 w-3' fill='currentColor' viewBox='0 0 24 24'>
                                <rect x='4' y='4' width='6' height='16' rx='1' />
                                <rect x='14' y='4' width='6' height='16' rx='1' />
                            </svg>
                        :   <svg className='h-3 w-3' fill='currentColor' viewBox='0 0 24 24'>
                                <path d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z' />
                            </svg>
                        }
                    </button>
                )}
            </div>
            <p className='turn-dialogue text-sm text-zinc-200 leading-relaxed mt-0.5 ml-8 pl-0.5'>
                {turn.dialogue}
            </p>
        </div>
    );
}

// ─── Loading Skeleton ───

function TranscriptSkeleton() {
    return (
        <div className='px-6 py-4 space-y-4'>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className='space-y-1'>
                    <div className='h-3 w-40 rounded bg-zinc-800/60 animate-pulse' />
                    <div className='h-4 w-full rounded bg-zinc-800/40 animate-pulse ml-8' />
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ───

export function TranscriptViewer({
    session,
    onClose,
    onStartReplay,
}: {
    session: RoundtableSession;
    onClose: () => void;
    onStartReplay?: (session: RoundtableSession, turns: RoundtableTurn[]) => void;
}) {
    const isRunning =
        session.status === 'running' || session.status === 'pending';

    // For running sessions, use SSE streaming
    const {
        turns: streamTurns,
        isLive,
        loading: streamLoading,
    } = useTurnStream(isRunning ? session.id : null);

    // For completed/failed sessions, use one-time fetch
    const { turns: fetchedTurns, loading: fetchLoading } = useConversationTurns(
        isRunning ? null : session.id,
    );

    const turns = isRunning ? streamTurns : fetchedTurns;
    const loading = isRunning ? streamLoading : fetchLoading;

    const printRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [ttsState, ttsControls] = useTTS();
    const [autoSpeak, setAutoSpeak] = useState(false);
    const prevTurnCountRef = useRef(turns.length);

    const formatLabel = session.format.replace(/_/g, ' ').toUpperCase();
    const coordinator =
        turns.length > 0 ? turns[0].speaker : session.participants[0];
    const coordinatorAgent = AGENTS[coordinator as AgentId];
    const duration = computeDuration(
        session.started_at ?? session.created_at,
        session.completed_at,
    );

    // Auto-scroll to bottom when new turns arrive during live streaming
    useEffect(() => {
        if (isLive && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isLive, turns.length]);

    // Stop TTS when component unmounts or session changes
    useEffect(() => {
        return () => {
            ttsControls.stop();
        };
    }, [session.id, ttsControls]);

    // Auto-speak new turns as they arrive via SSE
    useEffect(() => {
        if (!autoSpeak || !isLive || !ttsState.isAvailable) return;
        if (turns.length > prevTurnCountRef.current) {
            const newTurn = turns[turns.length - 1];
            ttsControls.playTurn(newTurn, turns.length - 1);
        }
        prevTurnCountRef.current = turns.length;
    }, [turns.length, autoSpeak, isLive, ttsState.isAvailable, turns, ttsControls]);

    return (
        <div className='rounded-xl border border-zinc-700/50 bg-zinc-900/80 overflow-hidden'>
            {/* Toolbar */}
            <div className='flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60'>
                <div className='flex items-center gap-2'>
                    <span className='text-[10px] uppercase tracking-wider text-zinc-500 font-mono'>
                        Transcript
                    </span>
                    {isLive && (
                        <span className='flex items-center gap-1.5 rounded-full bg-accent-green/15 border border-accent-green/30 px-2 py-0.5'>
                            <span className='relative flex h-1.5 w-1.5'>
                                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75' />
                                <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-green' />
                            </span>
                            <span className='text-[9px] font-semibold text-accent-green uppercase tracking-wider'>
                                Live
                            </span>
                        </span>
                    )}
                    {isLive && ttsState.isAvailable && (
                        <button
                            onClick={() => setAutoSpeak(s => !s)}
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider border transition-colors ${
                                autoSpeak
                                    ? 'bg-accent-blue/15 border-accent-blue/30 text-accent-blue'
                                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-400'
                            }`}
                            title={autoSpeak ? 'Disable auto-speak for new turns' : 'Auto-speak new turns as they arrive'}
                        >
                            <svg className='h-2.5 w-2.5' fill='currentColor' viewBox='0 0 24 24'>
                                <path d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z' />
                            </svg>
                            Auto
                        </button>
                    )}
                </div>
                <div className='flex items-center gap-2'>
                    {onStartReplay && session.status === 'completed' && turns.length > 0 && (
                        <button
                            onClick={() => onStartReplay(session, turns)}
                            className='text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors px-2 py-1 rounded hover:bg-zinc-800 font-mono uppercase tracking-wider flex items-center gap-1'
                            title='Watch animated replay in the office'
                        >
                            <svg className='h-3 w-3' fill='currentColor' viewBox='0 0 24 24'>
                                <polygon points='5,3 19,12 5,21' />
                            </svg>
                            Replay
                        </button>
                    )}
                    {ttsState.isAvailable && turns.length > 0 && (
                        ttsState.isPlaying ?
                            <button
                                onClick={ttsControls.stop}
                                className='text-[10px] text-accent-red hover:text-accent-red/80 transition-colors px-2 py-1 rounded hover:bg-zinc-800 font-mono uppercase tracking-wider flex items-center gap-1'
                                title='Stop speaking'
                            >
                                <svg className='h-3 w-3' fill='currentColor' viewBox='0 0 24 24'>
                                    <rect x='4' y='4' width='16' height='16' rx='2' />
                                </svg>
                                Stop
                            </button>
                        :   <button
                                onClick={() => ttsControls.playAll(turns)}
                                className='text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-800 font-mono uppercase tracking-wider flex items-center gap-1'
                                title='Read all turns aloud'
                            >
                                <svg className='h-3 w-3' fill='currentColor' viewBox='0 0 24 24'>
                                    <path d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z' />
                                </svg>
                                Play All
                            </button>
                    )}
                    {ttsState.needsUnlock && (
                        <button
                            onClick={ttsControls.unlock}
                            className='text-[10px] text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800 font-mono uppercase tracking-wider animate-pulse'
                            title='Click to enable audio playback'
                        >
                            🔇 Enable Audio
                        </button>
                    )}
                    <button
                        onClick={() => handlePrint(printRef.current)}
                        className='text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800 font-mono uppercase tracking-wider'
                        title='Print transcript'
                    >
                        Print
                    </button>
                    <button
                        onClick={onClose}
                        className='text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-zinc-800'
                        aria-label='Close transcript'
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

            {/* Printable document body */}
            <div
                ref={el => {
                    printRef.current = el;
                    scrollRef.current = el;
                }}
                className='max-h-[40rem] overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'
            >
                {loading ?
                    <TranscriptSkeleton />
                :   <div className='px-6 py-5 font-mono'>
                        {/* Document header */}
                        <div className='header border-b border-zinc-700 pb-4 mb-5'>
                            <h1 className='text-xs font-bold uppercase tracking-[0.2em] text-zinc-400'>
                                Subcult Ops — Roundtable Minutes
                            </h1>
                            <h2 className='text-sm text-zinc-200 mt-2 leading-snug'>
                                {session.topic}
                            </h2>
                        </div>

                        {/* Session metadata */}
                        <div className='meta space-y-1.5 mb-5'>
                            <div className='meta-row flex gap-4'>
                                <span className='meta-label text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 shrink-0'>
                                    Format
                                </span>
                                <span className='meta-value text-xs text-zinc-300'>
                                    {formatLabel}
                                </span>
                            </div>
                            <div className='meta-row flex gap-4'>
                                <span className='meta-label text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 shrink-0'>
                                    Date
                                </span>
                                <span className='meta-value text-xs text-zinc-300'>
                                    {formatFullDateTime(session.created_at)}
                                </span>
                            </div>
                            <div className='meta-row flex gap-4'>
                                <span className='meta-label text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 shrink-0'>
                                    Duration
                                </span>
                                <span className='meta-value text-xs text-zinc-300'>
                                    {duration} — {session.turn_count} turns
                                </span>
                            </div>
                            <div className='meta-row flex gap-4'>
                                <span className='meta-label text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 shrink-0'>
                                    Status
                                </span>
                                <span
                                    className={`meta-value text-xs ${
                                        session.status === 'completed' ?
                                            'text-accent-green'
                                        : session.status === 'failed' ?
                                            'text-accent-red'
                                        :   'text-zinc-300'
                                    }`}
                                >
                                    {session.status.toUpperCase()}
                                </span>
                            </div>
                            {coordinatorAgent && (
                                <div className='meta-row flex gap-4'>
                                    <span className='meta-label text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 shrink-0'>
                                        Chair
                                    </span>
                                    <span
                                        className={`meta-value text-xs ${coordinatorAgent.tailwindTextColor}`}
                                    >
                                        {VOICE_SYMBOLS[coordinator] ?? ''}{' '}
                                        {coordinatorAgent.displayName} (
                                        {coordinatorAgent.role})
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Participants */}
                        <div className='participants border-y border-zinc-700/60 py-3 mb-5'>
                            <div className='participants-title text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2'>
                                Present
                            </div>
                            {session.participants.map(p => {
                                const agent = AGENTS[p as AgentId];
                                const color =
                                    agent?.tailwindTextColor ?? 'text-zinc-400';
                                const symbol = VOICE_SYMBOLS[p] ?? '';
                                return (
                                    <div
                                        key={p}
                                        className={`participant ml-4 text-xs ${color}`}
                                    >
                                        {symbol} {agent?.displayName ?? p}
                                        {agent?.role ? ` — ${agent.role}` : ''}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Proceedings */}
                        <div className='proceedings'>
                            <div className='proceedings-title text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-700/60 pb-1.5 mb-4'>
                                Proceedings
                            </div>

                            {turns.length === 0 ?
                                <p className='text-xs text-zinc-500 italic'>
                                    No turns recorded for this session.
                                </p>
                            :   turns.map((turn, i) => (
                                    <TurnEntry
                                        key={turn.id}
                                        turn={turn}
                                        index={i}
                                        ttsState={ttsState}
                                        ttsControls={ttsControls}
                                    />
                                ))
                            }
                        </div>

                        {/* Footer */}
                        <div className='footer border-t border-zinc-700 mt-6 pt-3 text-center'>
                            <span className='text-[9px] uppercase tracking-[0.15em] text-zinc-600'>
                                End of Transcript — Subcult Ops
                            </span>
                        </div>
                    </div>
                }
            </div>
        </div>
    );
}
