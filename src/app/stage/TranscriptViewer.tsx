// TranscriptViewer — formal meeting minutes / court transcript style
// Designed to be printable — clean monospace layout, no bubbles
'use client';

import { useRef } from 'react';
import { useConversationTurns } from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId, RoundtableSession, RoundtableTurn } from '@/lib/types';

// ─── Agent voice symbols ───

const VOICE_SYMBOLS: Record<string, string> = {
    chora: '\u{1F300}',    // 🌀
    subrosa: '\u{1F339}',  // 🌹
    thaum: '\u{2728}',     // ✨
    praxis: '\u{1F6E0}',   // 🛠️
    mux: '\u{1F5C2}',      // 🗂️
    primus: '\u{265B}',    // ♛
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

function TurnEntry({ turn, index }: { turn: RoundtableTurn; index: number }) {
    const agentId = turn.speaker as AgentId;
    const agent = AGENTS[agentId];
    const textColor = agent?.tailwindTextColor ?? 'text-zinc-400';
    const symbol = VOICE_SYMBOLS[turn.speaker] ?? '';

    return (
        <div className='turn mb-4'>
            <div className='turn-header flex items-baseline gap-2'>
                <span className='turn-number text-[10px] text-zinc-600 font-mono tabular-nums w-6 text-right shrink-0'>
                    {index + 1}.
                </span>
                <span className={`text-xs font-bold uppercase tracking-wide ${textColor}`}>
                    {symbol} {agent?.displayName ?? turn.speaker}
                </span>
                <span className='turn-time text-[10px] text-zinc-600 font-mono'>
                    [{formatTime(turn.created_at)}]
                </span>
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
}: {
    session: RoundtableSession;
    onClose: () => void;
}) {
    const { turns, loading } = useConversationTurns(session.id);
    const printRef = useRef<HTMLDivElement>(null);

    const formatLabel = session.format.replace(/_/g, ' ').toUpperCase();
    const coordinator = turns.length > 0 ? turns[0].speaker : session.participants[0];
    const coordinatorAgent = AGENTS[coordinator as AgentId];
    const duration = computeDuration(session.started_at ?? session.created_at, session.completed_at);

    return (
        <div className='rounded-xl border border-zinc-700/50 bg-zinc-900/80 overflow-hidden'>
            {/* Toolbar */}
            <div className='flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60'>
                <span className='text-[10px] uppercase tracking-wider text-zinc-500 font-mono'>
                    Transcript
                </span>
                <div className='flex items-center gap-2'>
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
                        <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                            <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Printable document body */}
            <div
                ref={printRef}
                className='max-h-[40rem] overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'
            >
                {loading ? (
                    <TranscriptSkeleton />
                ) : (
                    <div className='px-6 py-5 font-mono'>
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
                                <span className={`meta-value text-xs ${
                                    session.status === 'completed' ? 'text-accent-green'
                                    : session.status === 'failed' ? 'text-accent-red'
                                    : 'text-zinc-300'
                                }`}>
                                    {session.status.toUpperCase()}
                                </span>
                            </div>
                            {coordinatorAgent && (
                                <div className='meta-row flex gap-4'>
                                    <span className='meta-label text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 shrink-0'>
                                        Chair
                                    </span>
                                    <span className={`meta-value text-xs ${coordinatorAgent.tailwindTextColor}`}>
                                        {VOICE_SYMBOLS[coordinator] ?? ''} {coordinatorAgent.displayName} ({coordinatorAgent.role})
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
                                const color = agent?.tailwindTextColor ?? 'text-zinc-400';
                                const symbol = VOICE_SYMBOLS[p] ?? '';
                                return (
                                    <div key={p} className={`participant ml-4 text-xs ${color}`}>
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

                            {turns.length === 0 ? (
                                <p className='text-xs text-zinc-500 italic'>
                                    No turns recorded for this session.
                                </p>
                            ) : (
                                turns.map((turn, i) => (
                                    <TurnEntry key={turn.id} turn={turn} index={i} />
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className='footer border-t border-zinc-700 mt-6 pt-3 text-center'>
                            <span className='text-[9px] uppercase tracking-[0.15em] text-zinc-600'>
                                End of Transcript — Subcult Ops
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
