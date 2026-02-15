// LiveFeed — cinematic real-time event stream for /live audience
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';
import type { SanitizedEvent } from '@/lib/public-events';

// ─── Event kind display config ───

const KIND_DISPLAY: Record<string, { icon: string; label: string }> = {
    conversation_started: { icon: '💬', label: 'Conversation started' },
    conversation_completed: { icon: '✅', label: 'Conversation completed' },
    content_draft_created: { icon: '📝', label: 'Content drafted' },
    content_published: { icon: '📢', label: 'Content published' },
    daily_digest_generated: { icon: '📋', label: 'Daily digest' },
    dream_cycle_completed: { icon: '💭', label: 'Dream cycle' },
    rebellion_started: { icon: '🔥', label: 'Rebellion' },
    rebellion_ended: { icon: '🕊️', label: 'Rebellion ended' },
};

// ─── Relative time formatting ───

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ─── Event card ───

function EventCard({
    event,
    isNew,
}: {
    event: SanitizedEvent;
    isNew: boolean;
}) {
    const agent = AGENTS[event.agent_id as AgentId];
    const color = agent?.color ?? '#a6adc8';
    const name = agent?.displayName ?? event.agent_id;
    const role = agent?.role ?? '';
    const display = KIND_DISPLAY[event.kind] ?? {
        icon: '•',
        label: event.kind,
    };

    return (
        <div
            className={`group border-l-2 pl-4 py-3 transition-opacity duration-500 ${
                isNew ? 'animate-fadeIn' : ''
            }`}
            style={{ borderColor: color }}
        >
            <div className='flex items-center gap-2 mb-1'>
                {/* Agent color dot */}
                <span
                    className='inline-block h-2.5 w-2.5 rounded-full shrink-0'
                    style={{ backgroundColor: color }}
                />
                <span className='text-sm font-semibold' style={{ color }}>
                    {name}
                </span>
                {role && (
                    <span className='text-[10px] uppercase tracking-wider text-zinc-600'>
                        {role}
                    </span>
                )}
                <span className='ml-auto text-[10px] text-zinc-600 tabular-nums font-mono'>
                    {relativeTime(event.created_at)}
                </span>
            </div>

            <div className='flex items-start gap-2'>
                <span className='text-sm shrink-0'>{display.icon}</span>
                <div className='min-w-0'>
                    {event.title && (
                        <p className='text-sm text-zinc-300 leading-snug'>
                            {event.title}
                        </p>
                    )}
                    {event.summary && (
                        <p className='text-xs text-zinc-500 mt-0.5 leading-relaxed line-clamp-3'>
                            {event.summary}
                        </p>
                    )}
                    {!event.title && !event.summary && (
                        <p className='text-xs text-zinc-500 italic'>
                            {display.label}
                        </p>
                    )}
                </div>
            </div>

            {event.tags && event.tags.length > 0 && (
                <div className='flex gap-1 mt-1.5 flex-wrap'>
                    {event.tags.slice(0, 4).map(tag => (
                        <span
                            key={tag}
                            className='text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 font-mono'
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Loading skeleton ───

function LoadingPulse() {
    return (
        <div className='space-y-4 py-8'>
            {Array.from({ length: 5 }).map((_, i) => (
                <div
                    key={i}
                    className='border-l-2 border-zinc-800 pl-4 py-3 animate-pulse'
                >
                    <div className='flex items-center gap-2 mb-2'>
                        <div className='h-2.5 w-2.5 rounded-full bg-zinc-800' />
                        <div className='h-3 w-16 rounded bg-zinc-800' />
                        <div className='h-2 w-10 rounded bg-zinc-800/50 ml-auto' />
                    </div>
                    <div className='h-3 w-3/4 rounded bg-zinc-800/50' />
                </div>
            ))}
        </div>
    );
}

// ─── Main component ───

export function LiveFeed() {
    const [events, setEvents] = useState<SanitizedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [connectionMode, setConnectionMode] = useState<
        'sse' | 'polling' | 'connecting'
    >('connecting');
    const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
    const feedRef = useRef<HTMLDivElement>(null);
    const lastEventIdRef = useRef<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectRef = useRef(0);

    // Auto-scroll to bottom when new events arrive
    const scrollToBottom = useCallback(() => {
        if (feedRef.current) {
            feedRef.current.scrollTo({
                top: feedRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, []);

    // Mark event as new for animation, then clear
    const addNewEvent = useCallback(
        (event: SanitizedEvent) => {
            setEvents(prev => {
                // Deduplicate
                if (prev.some(e => e.id === event.id)) return prev;
                // Keep newest at bottom (chronological)
                const next = [...prev, event];
                return next.length > 200 ? next.slice(-200) : next;
            });
            setNewEventIds(prev => new Set(prev).add(event.id));
            // Clear "new" flag after animation completes
            setTimeout(() => {
                setNewEventIds(prev => {
                    const next = new Set(prev);
                    next.delete(event.id);
                    return next;
                });
            }, 600);
            setTimeout(scrollToBottom, 50);
        },
        [scrollToBottom],
    );

    // Fetch initial batch and set up SSE/polling
    useEffect(() => {
        let isMounted = true;

        // Initial load
        async function fetchInitial() {
            try {
                const res = await fetch('/api/public/events?limit=50');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!isMounted) return;
                // Reverse so oldest is first (chronological order, newest at bottom)
                const sorted = (data.events as SanitizedEvent[]).reverse();
                setEvents(sorted);
                if (sorted.length > 0) {
                    lastEventIdRef.current = sorted[sorted.length - 1].id;
                }
            } catch {
                // Initial fetch failed — will still try SSE/polling
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        function connectSSE() {
            if (!isMounted) return;

            const params = new URLSearchParams();
            if (lastEventIdRef.current) {
                params.set('last_event_id', lastEventIdRef.current);
            }
            const url = `/api/public/events/stream${params.toString() ? `?${params}` : ''}`;
            const es = new EventSource(url);
            eventSourceRef.current = es;

            es.addEventListener('event', (e: MessageEvent) => {
                if (!isMounted) return;
                try {
                    const parsed = JSON.parse(e.data) as SanitizedEvent;
                    lastEventIdRef.current = parsed.id;
                    addNewEvent(parsed);
                } catch {
                    // Ignore malformed
                }
            });

            es.onopen = () => {
                if (!isMounted) return;
                reconnectRef.current = 0;
                setConnectionMode('sse');
            };

            es.onerror = () => {
                if (!isMounted) return;
                es.close();
                eventSourceRef.current = null;

                reconnectRef.current += 1;
                if (reconnectRef.current > 3) {
                    setConnectionMode('polling');
                } else {
                    setConnectionMode('connecting');
                    const delay = Math.min(
                        1000 * Math.pow(2, reconnectRef.current - 1),
                        15000,
                    );
                    setTimeout(connectSSE, delay);
                }
            };
        }

        fetchInitial().then(() => {
            if (isMounted) connectSSE();
        });

        return () => {
            isMounted = false;
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
        };
    }, [addNewEvent]);

    // Polling fallback when SSE fails
    useEffect(() => {
        if (connectionMode !== 'polling') return;

        const interval = setInterval(async () => {
            try {
                const params = new URLSearchParams({ limit: '20' });
                if (lastEventIdRef.current) {
                    params.set('after_id', lastEventIdRef.current);
                }
                const res = await fetch(`/api/public/events?${params}`);
                if (!res.ok) return;
                const data = await res.json();
                // Events are in ASC order when using after_id, no need to reverse
                const newEvents = data.events as SanitizedEvent[];
                for (const evt of newEvents) {
                    addNewEvent(evt);
                    lastEventIdRef.current = evt.id;
                }
            } catch {
                // Ignore polling errors
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [connectionMode, addNewEvent]);

    return (
        <div className='flex-1 flex flex-col min-h-0'>
            {/* Connection indicator */}
            <div className='flex items-center gap-2 px-1 py-2'>
                <span className='relative flex h-1.5 w-1.5'>
                    {connectionMode === 'sse' && (
                        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75' />
                    )}
                    <span
                        className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                            connectionMode === 'sse' ? 'bg-emerald-500'
                            : connectionMode === 'polling' ? 'bg-zinc-500'
                            : 'bg-amber-500'
                        }`}
                    />
                </span>
                <span className='text-[9px] uppercase tracking-widest text-zinc-600 font-mono'>
                    {connectionMode === 'sse' ?
                        'live'
                    : connectionMode === 'polling' ?
                        'polling'
                    :   'connecting'}
                </span>
            </div>

            {/* Event feed */}
            <div
                ref={feedRef}
                className='flex-1 overflow-y-auto space-y-1 pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent'
            >
                {loading ?
                    <LoadingPulse />
                : events.length === 0 ?
                    <div className='flex items-center justify-center h-full'>
                        <p className='text-xs text-zinc-600 font-mono'>
                            Awaiting signal...
                        </p>
                    </div>
                :   events.map(event => (
                        <EventCard
                            key={event.id}
                            event={event}
                            isNew={newEventIds.has(event.id)}
                        />
                    ))
                }
            </div>
        </div>
    );
}
