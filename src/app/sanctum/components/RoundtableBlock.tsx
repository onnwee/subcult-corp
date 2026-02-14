'use client';

import type { SanctumMessage } from '../hooks/useSanctumSocket';
import { AGENT_DATA } from '../lib/agents-client';

interface RoundtableBlockProps {
    /** All messages belonging to this roundtable session (including start/end system msgs + turns). */
    messages: SanctumMessage[];
}

/**
 * Renders a roundtable discussion block with turn-by-turn agent dialogue.
 */
export function RoundtableBlock({ messages }: RoundtableBlockProps) {
    const startMsg = messages.find(m => m.metadata?.roundtableStart);
    const endMsg = messages.find(m => m.metadata?.roundtableEnd);
    const turns = messages.filter(m => m.roundtable && m.role === 'agent');
    const format = (startMsg?.metadata?.format as string) || 'debate';

    return (
        <div className='my-4 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden'>
            {/* Header */}
            <div className='flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]'>
                <span className='text-sm'>🎙️</span>
                <span className='text-xs font-mono tracking-wider text-white/50 uppercase'>
                    Roundtable
                </span>
                <span className='px-2 py-0.5 text-[10px] font-mono text-white/30 bg-white/[0.04] rounded-full border border-white/[0.06] uppercase'>
                    {format}
                </span>
                {endMsg && (
                    <span className='ml-auto text-[10px] text-white/20 font-mono'>
                        {turns.length} turns
                    </span>
                )}
            </div>

            {/* Turns */}
            <div className='divide-y divide-white/[0.03]'>
                {turns.map((turn, i) => {
                    const agent =
                        turn.agentId ? AGENT_DATA[turn.agentId] : null;
                    const color = agent?.color || turn.color || '#888';
                    const turnNumber =
                        (turn.metadata?.turnNumber as number) || i + 1;

                    return (
                        <div
                            key={turn.id}
                            className='flex gap-3 px-4 py-3 animate-fadeIn'
                            style={{
                                animationDelay: `${i * 100}ms`,
                                animationFillMode: 'backwards',
                            }}
                        >
                            {/* Turn number + agent dot */}
                            <div className='shrink-0 flex flex-col items-center gap-1 pt-0.5'>
                                <span className='text-[9px] font-mono text-white/15'>
                                    {String(turnNumber).padStart(2, '0')}
                                </span>
                                <div
                                    className='w-2.5 h-2.5 rounded-full'
                                    style={{ backgroundColor: color }}
                                />
                            </div>

                            {/* Content */}
                            <div className='flex-1 min-w-0'>
                                <div className='flex items-baseline gap-2 mb-1'>
                                    <span
                                        className='text-sm font-medium capitalize'
                                        style={{ color }}
                                    >
                                        {agent?.displayName || turn.agentId}
                                    </span>
                                    <span className='text-[10px] text-white/20 font-mono uppercase'>
                                        {agent?.role || turn.agentRole}
                                    </span>
                                </div>
                                <p className='text-sm text-white/65 whitespace-pre-wrap break-words leading-relaxed'>
                                    {turn.content}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer (when complete) */}
            {endMsg && (
                <div className='px-4 py-2 border-t border-white/[0.04] bg-white/[0.01]'>
                    <span className='text-[10px] text-white/20 font-mono'>
                        {endMsg.content}
                    </span>
                </div>
            )}
        </div>
    );
}
