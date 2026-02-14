'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───

export interface SanctumMessage {
    id: string;
    role: 'user' | 'agent' | 'system';
    agentId?: string;
    displayName?: string;
    agentRole?: string;
    color?: string;
    content: string;
    metadata?: Record<string, unknown>;
    crossTalk?: boolean;
    replyTo?: string;
    roundtable?: boolean;
    createdAt?: string;
}

export interface TypingAgent {
    agentId: string;
    displayName: string;
    color: string;
}

interface UseSanctumSocketReturn {
    connected: boolean;
    messages: SanctumMessage[];
    typingAgents: TypingAgent[];
    whisperTarget: string | null;
    conversationId: string | null;
    sendMessage: (text: string) => void;
    requestHistory: () => void;
    setWhisperTarget: (agentId: string | null) => void;
}

// ─── Hook ───

export function useSanctumSocket(): UseSanctumSocketReturn {
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState<SanctumMessage[]>([]);
    const [typingAgents, setTypingAgents] = useState<TypingAgent[]>([]);
    const [whisperTarget, setWhisperTarget] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttempt = useRef(0);
    const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
        new Map(),
    );

    const getWsUrl = useCallback(() => {
        const protocol =
            (
                typeof window !== 'undefined' &&
                window.location.protocol === 'https:'
            ) ?
                'wss'
            :   'ws';
        const host =
            typeof window !== 'undefined' ?
                window.location.hostname
            :   'localhost';
        const port = process.env.NEXT_PUBLIC_SANCTUM_WS_PORT || '3011';
        return `${protocol}://${host}:${port}`;
    }, []);

    // ── Event handler (declared before connect so connect can reference it) ──

    const handleServerEvent = useCallback((event: Record<string, unknown>) => {
        switch (event.type) {
            case 'connected':
                break;

            case 'chat.message': {
                const payload = event.payload as Record<string, unknown>;

                // History response
                if (payload.history && Array.isArray(payload.history)) {
                    setConversationId(payload.conversationId as string);
                    setMessages(
                        (payload.history as Record<string, unknown>[]).map(
                            m => ({
                                id: (m.id as string) || genId(),
                                role: m.role as 'user' | 'agent' | 'system',
                                agentId: m.agentId as string | undefined,
                                displayName: m.displayName as
                                    | string
                                    | undefined,
                                agentRole: m.agentRole as string | undefined,
                                color: m.color as string | undefined,
                                content: m.content as string,
                                metadata: m.metadata as Record<string, unknown>,
                                crossTalk: (
                                    m.metadata as Record<string, unknown>
                                )?.crossTalk as boolean | undefined,
                                replyTo: (m.metadata as Record<string, unknown>)
                                    ?.replyTo as string | undefined,
                                createdAt: m.createdAt as string | undefined,
                            }),
                        ),
                    );
                    return;
                }

                // Single message
                if (payload.conversationId) {
                    setConversationId(payload.conversationId as string);
                }

                const role: SanctumMessage['role'] =
                    (
                        payload.role === 'user' ||
                        payload.role === 'agent' ||
                        payload.role === 'system'
                    ) ?
                        (payload.role as SanctumMessage['role'])
                    : payload.agentId ? 'agent'
                    : 'system';

                const msg: SanctumMessage = {
                    id: genId(),
                    role,
                    agentId: payload.agentId as string | undefined,
                    displayName: payload.displayName as string | undefined,
                    agentRole:
                        role === 'agent' ?
                            (payload.agentRole as string | undefined)
                        :   undefined,
                    color: payload.color as string | undefined,
                    content: payload.content as string,
                    metadata: payload.metadata as Record<string, unknown>,
                    crossTalk: payload.crossTalk as boolean | undefined,
                    replyTo: payload.replyTo as string | undefined,
                };
                setMessages(prev => [...prev, msg]);
                break;
            }

            case 'typing.indicator': {
                const payload = event.payload as Record<string, unknown>;
                const agentId = payload.agentId as string;
                if (!agentId) break;

                if (payload.typing) {
                    setTypingAgents(prev => {
                        if (prev.some(a => a.agentId === agentId)) return prev;
                        return [
                            ...prev,
                            {
                                agentId,
                                displayName:
                                    (payload.displayName as string) || agentId,
                                color: (payload.color as string) || '#888',
                            },
                        ];
                    });

                    // Auto-clear typing after 30s
                    const existingTimeout = typingTimeouts.current.get(agentId);
                    if (existingTimeout) clearTimeout(existingTimeout);
                    typingTimeouts.current.set(
                        agentId,
                        setTimeout(() => {
                            setTypingAgents(prev =>
                                prev.filter(a => a.agentId !== agentId),
                            );
                            typingTimeouts.current.delete(agentId);
                        }, 30_000),
                    );
                } else {
                    setTypingAgents(prev =>
                        prev.filter(a => a.agentId !== agentId),
                    );
                    const timeout = typingTimeouts.current.get(agentId);
                    if (timeout) {
                        clearTimeout(timeout);
                        typingTimeouts.current.delete(agentId);
                    }
                }
                break;
            }

            case 'roundtable.start': {
                const payload = event.payload as Record<string, unknown>;
                setMessages(prev => [
                    ...prev,
                    {
                        id: genId(),
                        role: 'system' as const,
                        content: `🎙️ **ROUNDTABLE** starting: "${payload.topic}"`,
                        metadata: {
                            roundtableStart: true,
                            format: payload.format,
                        },
                    },
                ]);
                break;
            }

            case 'roundtable.turn': {
                const payload = event.payload as Record<string, unknown>;
                setMessages(prev => [
                    ...prev,
                    {
                        id: genId(),
                        role: 'agent' as const,
                        agentId: payload.agentId as string,
                        displayName: payload.displayName as string,
                        agentRole: payload.role as string,
                        color: payload.color as string,
                        content: payload.dialogue as string,
                        roundtable: true,
                        metadata: {
                            turnNumber: payload.turnNumber,
                            sessionId: payload.sessionId,
                        },
                    },
                ]);
                break;
            }

            case 'roundtable.end': {
                const payload = event.payload as Record<string, unknown>;
                setMessages(prev => [
                    ...prev,
                    {
                        id: genId(),
                        role: 'system' as const,
                        content: `🎙️ **ROUNDTABLE** complete — ${payload.turnCount} turns`,
                        metadata: { roundtableEnd: true },
                    },
                ]);
                break;
            }

            case 'presence.update':
                break;

            case 'error': {
                const payload = event.payload as Record<string, unknown>;
                setMessages(prev => [
                    ...prev,
                    {
                        id: genId(),
                        role: 'system' as const,
                        content: `⚠️ ${payload.message || 'An error occurred'}`,
                    },
                ]);
                break;
            }
        }
    }, []);

    // ── Connection (declared after handleServerEvent) ──

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            reconnectAttempt.current = 0;
        };

        ws.onclose = () => {
            setConnected(false);
            const delay = Math.min(
                1000 * Math.pow(2, reconnectAttempt.current),
                30000,
            );
            reconnectAttempt.current++;
            reconnectRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
            // onclose will fire after onerror
        };

        ws.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                handleServerEvent(data);
            } catch {
                // Ignore malformed messages
            }
        };
    }, [getWsUrl, handleServerEvent]);

    // Connect on mount
    useEffect(() => {
        connect();
        return () => {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            wsRef.current?.close();
        };
    }, [connect]);

    // ── Actions ──

    const sendMessage = useCallback(
        (text: string) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
                return;

            // Add user message to local state immediately
            setMessages(prev => [
                ...prev,
                { id: genId(), role: 'user' as const, content: text },
            ]);

            // Prepend whisper prefix if in whisper mode
            const actualMessage =
                whisperTarget ? `/whisper @${whisperTarget} ${text}` : text;

            wsRef.current.send(
                JSON.stringify({
                    type: 'chat.send',
                    id: genId(),
                    payload: {
                        message: actualMessage,
                        userId: 'user', // TODO: auth
                        conversationId,
                    },
                }),
            );
        },
        [whisperTarget, conversationId],
    );

    const requestHistory = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
            return;

        wsRef.current.send(
            JSON.stringify({
                type: 'chat.history',
                id: genId(),
                payload: { userId: 'user' },
            }),
        );
    }, []);

    return {
        connected,
        messages,
        typingAgents,
        whisperTarget,
        conversationId,
        sendMessage,
        requestHistory,
        setWhisperTarget,
    };
}

function genId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
