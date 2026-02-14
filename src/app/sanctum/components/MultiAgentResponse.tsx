'use client';

import type { SanctumMessage } from '../hooks/useSanctumSocket';
import { AgentMessage } from './AgentMessage';

interface MultiAgentResponseProps {
    messages: SanctumMessage[];
}

/**
 * Groups multiple agent responses visually with a threaded left border
 * and staggered fade-in animation.
 */
export function MultiAgentResponse({ messages }: MultiAgentResponseProps) {
    if (messages.length <= 1) {
        return messages[0] ? <AgentMessage message={messages[0]} /> : null;
    }

    return (
        <div className='relative pl-4 space-y-3'>
            {/* Threading line */}
            <div className='absolute left-1.5 top-2 bottom-2 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent' />

            {messages.map((msg, i) => (
                <div
                    key={msg.id}
                    className='animate-fadeIn'
                    style={{
                        animationDelay: `${i * 200}ms`,
                        animationFillMode: 'backwards',
                    }}
                >
                    <AgentMessage message={msg} />
                </div>
            ))}
        </div>
    );
}
