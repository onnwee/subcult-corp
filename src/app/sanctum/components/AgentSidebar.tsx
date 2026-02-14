'use client';

import { AGENT_DATA } from '../lib/agents-client';
import type { TypingAgent } from '../hooks/useSanctumSocket';

interface AgentSidebarProps {
    open: boolean;
    typingAgents: TypingAgent[];
    whisperTarget: string | null;
    onWhisper: (agentId: string | null) => void;
}

const agents = Object.values(AGENT_DATA);

export function AgentSidebar({
    open,
    typingAgents,
    whisperTarget,
    onWhisper,
}: AgentSidebarProps) {
    if (!open) return null;

    const typingSet = new Set(typingAgents.map(t => t.agentId));

    return (
        <aside className='w-56 shrink-0 border-r border-white/[0.06] bg-[#0b0b16]/60 overflow-y-auto'>
            <div className='px-4 pt-4 pb-2'>
                <h2 className='text-[10px] font-mono tracking-[0.15em] text-white/30 uppercase'>
                    Council
                </h2>
            </div>

            <ul className='px-2 pb-4 space-y-0.5'>
                {agents.map(agent => {
                    const isTyping = typingSet.has(agent.id);
                    const isWhisper = whisperTarget === agent.id;

                    return (
                        <li key={agent.id}>
                            <button
                                onClick={() =>
                                    onWhisper(isWhisper ? null : agent.id)
                                }
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                                    transition-all duration-200 group text-left
                                    ${
                                        isWhisper ?
                                            'bg-white/[0.06] border border-white/[0.1]'
                                        :   'hover:bg-white/[0.04] border border-transparent'
                                    }
                                `}
                            >
                                {/* Presence dot */}
                                <div className='relative'>
                                    <div
                                        className={`w-2 h-2 rounded-full ${isTyping ? 'animate-pulse' : ''}`}
                                        style={{ backgroundColor: agent.color }}
                                    />
                                    {isTyping && (
                                        <div
                                            className='absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-40'
                                            style={{
                                                backgroundColor: agent.color,
                                            }}
                                        />
                                    )}
                                </div>

                                <div className='flex-1 min-w-0'>
                                    <div className='flex items-center gap-2'>
                                        <span
                                            className='text-sm font-medium capitalize truncate'
                                            style={{
                                                color:
                                                    isWhisper ?
                                                        agent.color
                                                    :   undefined,
                                            }}
                                        >
                                            {agent.displayName}
                                        </span>
                                        {isWhisper && (
                                            <span className='text-[9px] text-white/30'>
                                                🔇
                                            </span>
                                        )}
                                    </div>
                                    <span className='text-[10px] text-white/25 leading-none'>
                                        {agent.role}
                                    </span>
                                </div>

                                {isTyping && <TypingDots color={agent.color} />}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {whisperTarget && (
                <div className='px-4 pb-4'>
                    <button
                        onClick={() => onWhisper(null)}
                        className='w-full py-2 text-[11px] text-white/30 hover:text-white/50 border border-white/[0.06] rounded-md hover:border-white/[0.1] transition-colors'
                    >
                        Exit Whisper
                    </button>
                </div>
            )}
        </aside>
    );
}

function TypingDots({ color }: { color: string }) {
    return (
        <div className='flex gap-0.5'>
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    className='w-1 h-1 rounded-full animate-bounce'
                    style={{
                        backgroundColor: color,
                        animationDelay: `${i * 150}ms`,
                        animationDuration: '600ms',
                    }}
                />
            ))}
        </div>
    );
}
