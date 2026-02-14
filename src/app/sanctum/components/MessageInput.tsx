'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AGENT_DATA } from '../lib/agents-client';

interface MessageInputProps {
    onSend: (text: string) => void;
    connected: boolean;
    whisperTarget: string | null;
}

const COMMANDS = [
    { cmd: '/roundtable', desc: 'Start a roundtable debate' },
    { cmd: '/whisper', desc: 'Private message to one agent' },
    { cmd: '/reset', desc: 'Reset conversation' },
    { cmd: '/help', desc: 'Show available commands' },
];

const agentNames = Object.values(AGENT_DATA).map(a => a.id);

export function MessageInput({
    onSend,
    connected,
    whisperTarget,
}: MessageInputProps) {
    const [text, setText] = useState('');
    const [showMentions, setShowMentions] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [text]);

    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed || !connected) return;
        onSend(trimmed);
        setText('');
        setShowMentions(false);
        setShowCommands(false);
    }, [text, connected, onSend]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Enter sends, Shift+Enter is newline
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();

                // If autocomplete is visible, do nothing (let user click)
                if (showMentions || showCommands) {
                    return;
                }

                handleSend();
            }
        },
        [handleSend, showMentions, showCommands],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = e.target.value;
            setText(val);

            // Check for @ mention trigger
            const lastAt = val.lastIndexOf('@');
            if (lastAt >= 0) {
                const afterAt = val.slice(lastAt + 1);
                const spaceAfter = afterAt.indexOf(' ');
                if (spaceAfter === -1) {
                    // Still typing @mention
                    setMentionFilter(afterAt.toLowerCase());
                    setShowMentions(true);
                    setShowCommands(false);
                    return;
                }
            }
            setShowMentions(false);

            // Check for / command trigger
            if (val.startsWith('/') && !val.includes(' ')) {
                setShowCommands(true);
                setShowMentions(false);
            } else {
                setShowCommands(false);
            }
        },
        [],
    );

    const insertMention = useCallback(
        (agentId: string) => {
            const lastAt = text.lastIndexOf('@');
            if (lastAt >= 0) {
                setText(text.slice(0, lastAt) + `@${agentId} `);
            } else {
                setText(text + `@${agentId} `);
            }
            setShowMentions(false);
            textareaRef.current?.focus();
        },
        [text],
    );

    const insertCommand = useCallback((cmd: string) => {
        setText(cmd + ' ');
        setShowCommands(false);
        textareaRef.current?.focus();
    }, []);

    const filteredAgents = agentNames.filter(name =>
        name.toLowerCase().startsWith(mentionFilter),
    );

    const filteredCommands = COMMANDS.filter(c =>
        c.cmd.startsWith(text.trim()),
    );

    const placeholder =
        whisperTarget ?
            `Whisper to ${whisperTarget}...`
        :   'Speak to the Council... (@agent for direct, /roundtable for debate)';

    return (
        <div className='relative px-4 pb-4 pt-2'>
            {/* @mention autocomplete */}
            {showMentions && filteredAgents.length > 0 && (
                <div className='absolute bottom-full left-4 right-4 mb-1 bg-[#14141f] border border-white/[0.08] rounded-lg shadow-xl overflow-hidden z-10'>
                    {filteredAgents.map(id => {
                        const agent = AGENT_DATA[id];
                        return (
                            <button
                                key={id}
                                onMouseDown={e => {
                                    e.preventDefault();
                                    insertMention(id);
                                }}
                                className='w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors'
                            >
                                <div
                                    className='w-2 h-2 rounded-full'
                                    style={{ backgroundColor: agent.color }}
                                />
                                <span className='text-sm text-white/70 capitalize'>
                                    {agent.displayName}
                                </span>
                                <span className='text-[10px] text-white/25 ml-auto'>
                                    {agent.role}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* / command palette */}
            {showCommands && filteredCommands.length > 0 && (
                <div className='absolute bottom-full left-4 right-4 mb-1 bg-[#14141f] border border-white/[0.08] rounded-lg shadow-xl overflow-hidden z-10'>
                    {filteredCommands.map(c => (
                        <button
                            key={c.cmd}
                            onMouseDown={e => {
                                e.preventDefault();
                                insertCommand(c.cmd);
                            }}
                            className='w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors'
                        >
                            <span className='text-sm text-white/70 font-mono'>
                                {c.cmd}
                            </span>
                            <span className='text-[10px] text-white/25 ml-auto'>
                                {c.desc}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Input area */}
            <div className='flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 focus-within:border-white/[0.15] transition-colors'>
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    rows={1}
                    disabled={!connected}
                    className='flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none resize-none leading-relaxed max-h-40 disabled:opacity-40'
                />
                <button
                    onClick={handleSend}
                    disabled={!connected || !text.trim()}
                    className='shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-20 disabled:hover:bg-white/[0.06] transition-colors'
                    aria-label='Send message'
                >
                    <svg
                        className='w-4 h-4 text-white/60'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            d='M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5'
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
