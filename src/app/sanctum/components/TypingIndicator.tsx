'use client';

import type { TypingAgent } from '../hooks/useSanctumSocket';

interface TypingIndicatorProps {
    typingAgents: TypingAgent[];
}

export function TypingIndicator({ typingAgents }: TypingIndicatorProps) {
    if (typingAgents.length === 0) return null;

    const label =
        typingAgents.length === 1 ? `${typingAgents[0].displayName} is thinking`
        : typingAgents.length === 2 ?
            `${typingAgents[0].displayName} and ${typingAgents[1].displayName} are thinking`
        :   `${typingAgents[0].displayName} and ${typingAgents.length - 1} others are thinking`;

    return (
        <div className='flex items-center gap-3 px-1 py-2'>
            {/* Colored dots for typing agents */}
            <div className='flex -space-x-1'>
                {typingAgents.slice(0, 4).map(agent => (
                    <div
                        key={agent.agentId}
                        className='w-2.5 h-2.5 rounded-full ring-2 ring-[#0a0a14] animate-pulse'
                        style={{ backgroundColor: agent.color }}
                    />
                ))}
            </div>

            {/* Label */}
            <span className='text-xs text-white/25 italic'>{label}</span>

            {/* Animated dots */}
            <div className='flex gap-0.5'>
                {[0, 1, 2].map(i => (
                    <div
                        key={i}
                        className='w-1 h-1 rounded-full bg-white/20 animate-bounce'
                        style={{
                            animationDelay: `${i * 200}ms`,
                            animationDuration: '800ms',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
