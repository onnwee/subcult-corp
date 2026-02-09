// Shared hooks for the Stage dashboard
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type {
    AgentEvent,
    Mission,
    MissionStep,
    RoundtableSession,
    RoundtableTurn,
} from '@/lib/types';

// ─── useEvents — fetch + realtime signal feed ───

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

    useEffect(() => {
        let cancelled = false;

        async function fetchEvents() {
            setLoading(true);
            setError(null);

            let q = supabaseBrowser
                .from('ops_agent_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (agentId) q = q.eq('agent_id', agentId);
            if (kind) q = q.eq('kind', kind);

            const { data, error: err } = await q;
            if (cancelled) return;
            if (err) {
                setError(err.message);
            } else {
                setEvents((data as AgentEvent[]) ?? []);
            }
            setLoading(false);
        }

        fetchEvents();

        // Subscribe to realtime inserts
        const channel = supabaseBrowser
            .channel('events-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ops_agent_events',
                },
                payload => {
                    const newEvent = payload.new as AgentEvent;
                    // Apply client-side filter
                    if (agentId && newEvent.agent_id !== agentId) return;
                    if (kind && newEvent.kind !== kind) return;

                    setEvents(prev => [newEvent, ...prev].slice(0, limit));
                },
            )
            .subscribe();

        return () => {
            cancelled = true;
            supabaseBrowser.removeChannel(channel);
        };
    }, [agentId, kind, limit, refreshKey]);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

    return { events, loading, error, refetch };
}

// ─── useMissions — fetch missions with optional status filter ───

export function useMissions(statusFilter?: string) {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function fetchMissions() {
            setLoading(true);
            setError(null);

            let q = supabaseBrowser
                .from('ops_missions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (statusFilter) q = q.eq('status', statusFilter);

            const { data, error: err } = await q;
            if (cancelled) return;
            if (err) {
                setError(err.message);
            } else {
                setMissions((data as Mission[]) ?? []);
            }
            setLoading(false);
        }

        fetchMissions();

        return () => {
            cancelled = true;
        };
    }, [statusFilter, refreshKey]);

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
            const { data } = await supabaseBrowser
                .from('ops_mission_steps')
                .select('*')
                .eq('mission_id', missionId)
                .order('created_at', { ascending: true });
            if (cancelled) return;
            setSteps((data as MissionStep[]) ?? []);
            setLoading(false);
        }

        fetchSteps();

        return () => {
            cancelled = true;
        };
    }, [missionId]);

    // Return empty when no mission selected (avoids setState in effect for null case)
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
            const { data } = await supabaseBrowser
                .from('ops_agent_events')
                .select('*')
                .contains('metadata', { missionId })
                .order('created_at', { ascending: true });
            if (cancelled) return;
            setEvents((data as AgentEvent[]) ?? []);
            setLoading(false);
        }

        fetchEvents();

        return () => {
            cancelled = true;
        };
    }, [missionId]);

    // Return empty when no mission selected (avoids setState in effect for null case)
    return {
        events: missionId ? events : [],
        loading: missionId ? loading : false,
    };
}

// ─── useConversations — fetch roundtable sessions ───

export function useConversations(limit = 10) {
    const [sessions, setSessions] = useState<RoundtableSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabaseBrowser
            .from('ops_roundtable_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit)
            .then(({ data }) => {
                setSessions((data as RoundtableSession[]) ?? []);
                setLoading(false);
            });
    }, [limit]);

    return { sessions, loading };
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
            const { data } = await supabaseBrowser
                .from('ops_roundtable_turns')
                .select('*')
                .eq('session_id', sessionId)
                .order('turn_number', { ascending: true });
            if (cancelled) return;
            setTurns((data as RoundtableTurn[]) ?? []);
            setLoading(false);
        }

        fetchTurns();

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    // Return empty when no session selected (avoids setState in effect for null case)
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
        async function load() {
            const [events, missions, sessions, memories] = await Promise.all([
                supabaseBrowser
                    .from('ops_agent_events')
                    .select('id', { count: 'exact', head: true }),
                supabaseBrowser
                    .from('ops_missions')
                    .select('id', { count: 'exact', head: true })
                    .in('status', ['approved', 'running']),
                supabaseBrowser
                    .from('ops_roundtable_sessions')
                    .select('id', { count: 'exact', head: true }),
                supabaseBrowser
                    .from('ops_agent_memory')
                    .select('agent_id')
                    .is('superseded_by', null),
            ]);

            const memoryCounts: Record<string, number> = {};
            if (memories.data) {
                for (const m of memories.data) {
                    memoryCounts[m.agent_id] =
                        (memoryCounts[m.agent_id] ?? 0) + 1;
                }
            }

            setStats({
                totalEvents: events.count ?? 0,
                activeMissions: missions.count ?? 0,
                totalConversations: sessions.count ?? 0,
                agentMemories: memoryCounts,
            });
            setLoading(false);
        }
        load();
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

// ─── useInterval — for animations ───

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
