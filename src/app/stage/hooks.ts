// Shared hooks for the Stage dashboard
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
    AgentEvent,
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
