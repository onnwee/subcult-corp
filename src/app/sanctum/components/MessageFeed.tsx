'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { SanctumMessage, TypingAgent } from '../hooks/useSanctumSocket';
import { AgentMessage } from './AgentMessage';
import { MultiAgentResponse } from './MultiAgentResponse';
import { RoundtableBlock } from './RoundtableBlock';
import { TypingIndicator } from './TypingIndicator';

interface MessageFeedProps {
    messages: SanctumMessage[];
    typingAgents: TypingAgent[];
}

/**
 * Groups consecutive agent messages and roundtable blocks,
 * renders everything in a scrollable container with auto-scroll.
 */
export function MessageFeed({ messages, typingAgents }: MessageFeedProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        const el = bottomRef.current;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, typingAgents.length]);

    // Group messages into render blocks
    const blocks = useMemo(() => groupMessages(messages), [messages]);

    if (messages.length === 0) {
        return (
            <div
                ref={containerRef}
                className='flex-1 overflow-y-auto flex items-center justify-center'
            >
                <div className='text-center space-y-3 max-w-sm'>
                    <div className='text-3xl opacity-20'>⛩</div>
                    <p className='text-sm text-white/20 font-mono'>
                        Enter the Sanctum
                    </p>
                    <p className='text-xs text-white/10'>
                        Speak to the Council. Use{' '}
                        <span className='font-mono'>@agent</span> for direct,{' '}
                        <span className='font-mono'>/roundtable</span> for
                        debate.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className='flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin scrollbar-thumb-white/5'
        >
            {blocks.map((block, i) => {
                if (block.type === 'roundtable') {
                    return (
                        <RoundtableBlock key={i} messages={block.messages} />
                    );
                }
                if (block.type === 'agent-group' && block.messages.length > 1) {
                    return (
                        <MultiAgentResponse key={i} messages={block.messages} />
                    );
                }
                // Single message (user, system, or lone agent)
                return (
                    <AgentMessage
                        key={block.messages[0].id}
                        message={block.messages[0]}
                    />
                );
            })}

            <TypingIndicator typingAgents={typingAgents} />

            <div ref={bottomRef} />
        </div>
    );
}

// ─── Grouping logic ───

interface MessageBlock {
    type: 'single' | 'agent-group' | 'roundtable';
    messages: SanctumMessage[];
}

function groupMessages(messages: SanctumMessage[]): MessageBlock[] {
    const blocks: MessageBlock[] = [];
    let i = 0;

    while (i < messages.length) {
        const msg = messages[i];

        // Roundtable block: collect from start to end
        if (msg.metadata?.roundtableStart) {
            const roundtableMessages: SanctumMessage[] = [msg];
            i++;
            while (i < messages.length) {
                roundtableMessages.push(messages[i]);
                if (messages[i].metadata?.roundtableEnd) {
                    i++;
                    break;
                }
                i++;
            }
            blocks.push({ type: 'roundtable', messages: roundtableMessages });
            continue;
        }

        // Group consecutive agent messages (not user, not system, not roundtable)
        if (msg.role === 'agent' && !msg.roundtable) {
            const group: SanctumMessage[] = [msg];
            i++;
            while (
                i < messages.length &&
                messages[i].role === 'agent' &&
                !messages[i].roundtable &&
                !messages[i].metadata?.roundtableStart
            ) {
                group.push(messages[i]);
                i++;
            }
            blocks.push({
                type: group.length > 1 ? 'agent-group' : 'single',
                messages: group,
            });
            continue;
        }

        // Single message (user or system)
        blocks.push({ type: 'single', messages: [msg] });
        i++;
    }

    return blocks;
}
