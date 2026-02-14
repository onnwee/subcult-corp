'use client';

import type { SanctumMessage } from '../hooks/useSanctumSocket';

interface AgentMessageProps {
    message: SanctumMessage;
}

export function AgentMessage({ message }: AgentMessageProps) {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    if (isSystem) {
        return (
            <div className='flex justify-center py-2'>
                <div className='px-4 py-2 text-xs text-white/30 bg-white/[0.02] rounded-full border border-white/[0.04] font-mono'>
                    {message.content}
                </div>
            </div>
        );
    }

    if (isUser) {
        return (
            <div className='flex justify-end'>
                <div className='max-w-[70%] px-4 py-3 rounded-2xl rounded-br-sm bg-white/[0.08] border border-white/[0.06]'>
                    <p className='text-sm text-white/85 whitespace-pre-wrap break-words'>
                        {message.content}
                    </p>
                </div>
            </div>
        );
    }

    // Agent message
    const color = message.color || '#888';

    return (
        <div className={`flex gap-3 ${message.crossTalk ? 'ml-8' : ''}`}>
            {/* Color dot avatar */}
            <div className='shrink-0 pt-1'>
                <div
                    className='w-3 h-3 rounded-full ring-2 ring-white/[0.06]'
                    style={{ backgroundColor: color }}
                />
            </div>

            <div className='flex-1 min-w-0'>
                {/* Agent header */}
                <div className='flex items-baseline gap-2 mb-1'>
                    <span
                        className='text-sm font-medium capitalize'
                        style={{ color }}
                    >
                        {message.displayName || message.agentId}
                    </span>
                    {message.agentRole && (
                        <span className='text-[10px] text-white/20 font-mono uppercase'>
                            {message.agentRole}
                        </span>
                    )}
                    {message.crossTalk && message.replyTo && (
                        <span className='text-[10px] text-white/15 italic'>
                            ↩ replying to {message.replyTo}
                        </span>
                    )}
                </div>

                {/* Content */}
                <div className='text-sm text-white/70 whitespace-pre-wrap break-words leading-relaxed'>
                    {message.content}
                </div>

                {/* Timestamp */}
                {message.createdAt && (
                    <div className='mt-1 text-[10px] text-white/15 font-mono'>
                        {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
