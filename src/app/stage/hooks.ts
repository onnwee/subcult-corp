// Shared hooks for the Stage dashboard
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
    AgentEvent,
    AgentRelationship,
    MemoryEntry,
    MemoryType,
    Mission,
    MissionStep,
    RoundtableSession,
    RoundtableTurn,
} from '@/lib/types';

// ─── Helper: fetch JSON from internal API ───

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return res.json() as Promise<T>;
}

// ─── useEvents — fetch + polling signal feed ───

export function useEvents(filters?: {
    agentId?: string;
    kind?: string;
    limit?: number;
}) {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const limit = filters?.limit ?? 200;
    const agentId = filters?.agentId;
    const kind = filters?.kind;
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchEvents = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            params.set('limit', String(limit));
            if (agentId) params.set('agent_id', agentId);
            if (kind) params.set('kind', kind);

            const data = await fetchJson<{ events: AgentEvent[] }>(
                `/api/ops/events?${params}`,
            );
            setEvents(data.events);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [agentId, kind, limit]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents, refreshKey]);

    // Poll every 5 seconds
    useInterval(() => {
        fetchEvents();
    }, 5000);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

    return { events, loading, error, refetch };
}

// ─── useMissions — fetch missions with optional status filter ───

export function useMissions(statusFilter?: string) {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchMissions = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            params.set('limit', '50');
            if (statusFilter) params.set('status', statusFilter);

            const data = await fetchJson<{ missions: Mission[] }>(
                `/api/ops/missions?${params}`,
            );
            setMissions(data.missions);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchMissions();
    }, [fetchMissions, refreshKey]);

    // Poll every 10 seconds
    useInterval(() => {
        fetchMissions();
    }, 10000);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

    return { missions, loading, error, refetch };
}

// ─── useMissionSteps — fetch steps for a specific mission ───

export function useMissionSteps(missionId: string | null) {
    const [steps, setSteps] = useState<MissionStep[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!missionId) return;

        let cancelled = false;

        async function fetchSteps() {
            setLoading(true);
            try {
                const data = await fetchJson<{ steps: MissionStep[] }>(
                    `/api/ops/steps?mission_id=${missionId}`,
                );
                if (!cancelled) setSteps(data.steps);
            } catch {
                // ignore
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchSteps();

        return () => {
            cancelled = true;
        };
    }, [missionId]);

    return {
        steps: missionId ? steps : [],
        loading: missionId ? loading : false,
    };
}

// ─── useMissionEvents — fetch events linked to a mission ───

export function useMissionEvents(missionId: string | null) {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!missionId) return;

        let cancelled = false;

        async function fetchEvents() {
            setLoading(true);
            try {
                const data = await fetchJson<{ events: AgentEvent[] }>(
                    `/api/ops/events?mission_id=${missionId}`,
                );
                if (!cancelled) setEvents(data.events);
            } catch {
                // ignore
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchEvents();

        return () => {
            cancelled = true;
        };
    }, [missionId]);

    return {
        events: missionId ? events : [],
        loading: missionId ? loading : false,
    };
}

// ─── useConversations — fetch roundtable sessions ───

export function useConversations(limit = 10) {
    const [sessions, setSessions] = useState<RoundtableSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = useCallback(async () => {
        try {
            const data = await fetchJson<{ sessions: RoundtableSession[] }>(
                `/api/ops/roundtable?limit=${limit}`,
            );
            setSessions(data.sessions);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Poll every 10 seconds
    useInterval(() => {
        fetchSessions();
    }, 10000);

    return { sessions, loading, error };
}

// ─── useConversationTurns — fetch turns for a session ───

export function useConversationTurns(sessionId: string | null) {
    const [turns, setTurns] = useState<RoundtableTurn[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!sessionId) return;

        let cancelled = false;

        async function fetchTurns() {
            setLoading(true);
            try {
                const data = await fetchJson<{ turns: RoundtableTurn[] }>(
                    `/api/ops/turns?session_id=${sessionId}`,
                );
                if (!cancelled) setTurns(data.turns);
            } catch {
                // ignore
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchTurns();

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    return {
        turns: sessionId ? turns : [],
        loading: sessionId ? loading : false,
    };
}

// ─── Connection Status Type ───

export type ConnectionStatus = 'connected' | 'reconnecting' | 'polling';

// ─── useEventStream — SSE-powered real-time event feed ───

export function useEventStream(filters?: {
    agent_id?: string;
    kind?: string;
    limit?: number;
}) {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [connectionStatus, setConnectionStatus] =
        useState<ConnectionStatus>('connected');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const lastEventIdRef = useRef<string | null>(null);
    const maxCap = filters?.limit ?? 500;
    const agentId = filters?.agent_id;
    const kind = filters?.kind;

    // Stable polling fallback
    const pollFallback = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            params.set('limit', String(maxCap));
            if (agentId) params.set('agent_id', agentId);
            if (kind) params.set('kind', kind);
            const data = await fetchJson<{ events: AgentEvent[] }>(
                `/api/ops/events?${params}`,
            );
            setEvents(data.events);
            // Track the newest event ID for SSE continuation
            if (data.events.length > 0) {
                lastEventIdRef.current = data.events[0].id;
            }
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [maxCap, agentId, kind]);

    useEffect(() => {
        let isMounted = true;

        function connect() {
            // Clear any existing reconnect timer to prevent concurrent attempts
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }

            // Build SSE URL with last_event_id from ref if available
            const params = new URLSearchParams();
            if (agentId) params.set('agent_id', agentId);
            if (kind) params.set('kind', kind);

            // Add last_event_id to continue from where we left off
            if (lastEventIdRef.current) {
                params.set('last_event_id', lastEventIdRef.current);
            }

            const url = `/api/ops/events/stream${params.toString() ? `?${params}` : ''}`;

            const es = new EventSource(url);
            eventSourceRef.current = es;

            es.addEventListener('event', (e: MessageEvent) => {
                if (!isMounted) return;
                try {
                    const parsed = JSON.parse(e.data) as AgentEvent;
                    // Update ref with newest event ID
                    lastEventIdRef.current = parsed.id;
                    setEvents(prev => {
                        const next = [parsed, ...prev];
                        return next.length > maxCap ?
                                next.slice(0, maxCap)
                            :   next;
                    });
                    setLoading(false);
                    setError(null);
                } catch {
                    // Ignore malformed data
                }
            });

            es.onopen = () => {
                if (!isMounted) return;
                reconnectAttemptsRef.current = 0;
                setConnectionStatus('connected');
                setLoading(false);
            };

            es.onerror = () => {
                if (!isMounted) return;
                es.close();
                eventSourceRef.current = null;

                reconnectAttemptsRef.current += 1;

                if (reconnectAttemptsRef.current > 3) {
                    // Fall back to polling
                    setConnectionStatus('polling');
                    pollFallback();
                } else {
                    // Exponential backoff: 1s, 2s, 4s
                    setConnectionStatus('reconnecting');
                    const delay = Math.min(
                        1000 * Math.pow(2, reconnectAttemptsRef.current - 1),
                        30000,
                    );
                    // Clear existing timer before scheduling new one
                    if (reconnectTimerRef.current) {
                        clearTimeout(reconnectTimerRef.current);
                    }
                    reconnectTimerRef.current = setTimeout(connect, delay);
                }
            };
        }

        // Initial data load via HTTP first to establish snapshot
        pollFallback()
            .then(() => {
                // Then connect SSE stream to continue from snapshot
                if (isMounted) connect();
            })
            .catch(() => {
                // Initial event fetch failed, connecting SSE anyway
                if (isMounted) connect();
            });

        return () => {
            isMounted = false;
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
        };
    }, [agentId, kind, maxCap, pollFallback]);

    // If in polling mode, keep polling every 5s
    useInterval(
        () => {
            if (connectionStatus === 'polling') pollFallback();
        },
        connectionStatus === 'polling' ? 5000 : null,
    );

    return { events, loading, error, connectionStatus };
}

// ─── useTurnStream — SSE-powered live turn streaming ───

export function useTurnStream(sessionId: string | null) {
    const [turns, setTurns] = useState<RoundtableTurn[]>([]);
    const [isLive, setIsLive] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [loading, setLoading] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        if (!sessionId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- Resetting state when sessionId changes
            setTurns([]);
            setIsLive(false);
            setIsComplete(false);
            return;
        }

        let isMounted = true;
        setLoading(true);

        // First, fetch existing turns via HTTP
        async function fetchExisting() {
            try {
                const data = await fetchJson<{ turns: RoundtableTurn[] }>(
                    `/api/ops/turns?session_id=${sessionId}`,
                );
                if (isMounted) {
                    setTurns(data.turns);
                    setLoading(false);
                }
            } catch {
                if (isMounted) setLoading(false);
            }
        }
        fetchExisting();

        // Then connect SSE for new turns
        const url = `/api/ops/roundtable/stream?session_id=${sessionId}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.addEventListener('turn', (e: MessageEvent) => {
            if (!isMounted) return;
            try {
                const turn = JSON.parse(e.data) as RoundtableTurn;
                setTurns(prev => {
                    // Avoid duplicates — check turn_number
                    if (prev.some(t => t.turn_number === turn.turn_number)) {
                        return prev;
                    }
                    return [...prev, turn].sort(
                        (a, b) => a.turn_number - b.turn_number,
                    );
                });
            } catch {
                // Ignore
            }
        });

        es.addEventListener('session_complete', (e: MessageEvent) => {
            if (!isMounted) return;
            try {
                const data = JSON.parse(e.data);
                setIsComplete(true);
                setIsLive(false);
                // If there's status info, we could use it
                void data;
            } catch {
                setIsComplete(true);
                setIsLive(false);
            }
            es.close();
        });

        es.onopen = () => {
            if (!isMounted) return;
            setIsLive(true);
        };

        es.onerror = () => {
            if (!isMounted) return;
            setIsLive(false);
            es.close();
            // Fall back — turns are already loaded via HTTP fetch above
        };

        return () => {
            isMounted = false;
            es.close();
            eventSourceRef.current = null;
        };
    }, [sessionId]);

    return { turns, isLive, isComplete, loading };
}

// ─── useSystemStats — aggregate counts for the header ───

export interface SystemStats {
    totalEvents: number;
    activeMissions: number;
    totalConversations: number;
    agentMemories: Record<string, number>;
}

export function useSystemStats() {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchJson<{
            totalEvents: number;
            activeMissions: number;
            totalSessions: number;
            memoriesByAgent: Record<string, number>;
        }>('/api/ops/stats')
            .then(data => {
                setStats({
                    totalEvents: data.totalEvents,
                    activeMissions: data.activeMissions,
                    totalConversations: data.totalSessions,
                    agentMemories: data.memoriesByAgent,
                });
            })
            .finally(() => setLoading(false));
    }, []);

    return { stats, loading };
}

// ─── useCosts — fetch LLM cost/usage data ───

export interface CostBreakdown {
    key: string;
    cost: number;
    tokens: number;
    calls: number;
}

export interface CostData {
    totalCost: number;
    totalTokens: number;
    totalCalls: number;
    period: string;
    groupBy: string;
    breakdown: CostBreakdown[];
}

export function useCosts(params?: { period?: string; groupBy?: string }) {
    const [costs, setCosts] = useState<CostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const period = params?.period ?? 'all';
    const groupBy = params?.groupBy ?? 'agent';

    const fetchCosts = useCallback(async () => {
        try {
            const qp = new URLSearchParams();
            qp.set('period', period);
            qp.set('group_by', groupBy);
            const data = await fetchJson<CostData>(`/api/ops/costs?${qp}`);
            setCosts(data);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [period, groupBy]);

    useEffect(() => {
        setLoading(true);
        fetchCosts();
    }, [fetchCosts, refreshKey]);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

    return { costs, loading, error, refetch };
}

// ─── useTimeOfDay — for OfficeRoom sky color ───

export function useTimeOfDay() {
    const [period, setPeriod] = useState<'day' | 'dusk' | 'night'>('day');

    useEffect(() => {
        function update() {
            const hour = new Date().getHours();
            if (hour >= 6 && hour < 17) setPeriod('day');
            else if (hour >= 17 && hour < 20) setPeriod('dusk');
            else setPeriod('night');
        }
        update();
        const interval = setInterval(update, 60_000);
        return () => clearInterval(interval);
    }, []);

    return period;
}

// ─── useMemories — fetch + poll agent memories ───

export interface MemoryFilters {
    agent_id?: string;
    type?: MemoryType | MemoryType[];
    min_confidence?: number;
    tags?: string[];
    search?: string;
    limit?: number;
    offset?: number;
}

export function useMemories(filters?: MemoryFilters) {
    const [memories, setMemories] = useState<MemoryEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const serializedFilters = JSON.stringify(filters ?? {});

    const fetchMemories = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            const f: MemoryFilters = JSON.parse(serializedFilters);

            if (f.agent_id) params.set('agent_id', f.agent_id);
            if (f.type) {
                const types = Array.isArray(f.type) ? f.type.join(',') : f.type;
                params.set('type', types);
            }
            if (f.min_confidence !== undefined)
                params.set('min_confidence', String(f.min_confidence));
            if (f.tags?.length) params.set('tags', f.tags.join(','));
            if (f.search) params.set('search', f.search);
            if (f.limit) params.set('limit', String(f.limit));
            if (f.offset) params.set('offset', String(f.offset));

            const data = await fetchJson<{
                memories: MemoryEntry[];
                total: number;
            }>(`/api/ops/memory?${params}`);
            setMemories(data.memories);
            setTotal(data.total);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [serializedFilters]);

    useEffect(() => {
        setLoading(true);
        fetchMemories();
    }, [fetchMemories]);

    // Poll every 30 seconds
    useInterval(() => {
        fetchMemories();
    }, 30000);

    return { memories, total, loading, error };
}

// ─── useRelationships — fetch + poll agent relationships ───

export function useRelationships() {
    const [relationships, setRelationships] = useState<AgentRelationship[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRelationships = useCallback(async () => {
        try {
            const data = await fetchJson<{
                relationships: AgentRelationship[];
            }>('/api/ops/relationships');
            setRelationships(data.relationships);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRelationships();
    }, [fetchRelationships]);

    // Poll every 30 seconds
    useInterval(() => {
        fetchRelationships();
    }, 30000);

    return { relationships, loading, error };
}

// ─── useDigest — fetch daily digest data ───

export interface DigestHighlight {
    title: string;
    description: string;
    agentId?: string;
    eventId?: string;
}

export interface DigestStats {
    events: number;
    conversations: number;
    missions_succeeded: number;
    missions_failed: number;
    memories: number;
    costs: number;
}

export interface DigestEntry {
    id: string;
    digest_date: string;
    summary: string;
    highlights: DigestHighlight[];
    stats: DigestStats;
    generated_by: string;
    created_at: string;
}

export function useDigest(date?: string) {
    const [digest, setDigest] = useState<DigestEntry | null>(null);
    const [digests, setDigests] = useState<DigestEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchDigest = useCallback(async () => {
        try {
            if (date) {
                const data = await fetchJson<{ digest: DigestEntry }>(
                    `/api/ops/digest?date=${date}`,
                );
                setDigest(data.digest);
                setDigests([]);
            } else {
                const data = await fetchJson<{ digests: DigestEntry[] }>(
                    `/api/ops/digest?limit=7`,
                );
                setDigests(data.digests);
                setDigest(data.digests[0] ?? null);
            }
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        setLoading(true);
        fetchDigest();
    }, [fetchDigest, refreshKey]);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

    return { digest, digests, loading, error, refetch };
}

// ─── useInterval — for animations and polling ───

export function useInterval(callback: () => void, delay: number | null) {
    const savedCallback = useRef(callback);

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (delay === null) return;
        const id = setInterval(() => savedCallback.current(), delay);
        return () => clearInterval(id);
    }, [delay]);
}
