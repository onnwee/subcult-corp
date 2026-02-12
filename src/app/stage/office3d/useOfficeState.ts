// office3d/useOfficeState.ts — combined state management for the 3D office
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSystemStats, useConversations, useInterval } from '../hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId, AgentEvent, Mission } from '@/lib/types';
import {
    DESK_CONFIGS,
    PROPS,
    AGENT_MOVE_SPEED,
    AGENT_ARRIVED_THRESHOLD,
    SPEECH_BUBBLE_DURATION_FRAMES,
    BEHAVIOR_UPDATE_INTERVAL_MIN,
    BEHAVIOR_UPDATE_INTERVAL_MAX,
    type AgentBehavior,
} from './constants';

// ─── Agent 3D State ───
export interface Agent3DState {
    id: AgentId;
    name: string;
    role: string;
    color: string;
    skinColor: string;
    position: [number, number, number];
    targetPosition: [number, number, number];
    behavior: AgentBehavior;
    frame: number;
    speechBubble?: string;
    speechTick: number;
    deskPosition: [number, number, number];
}

// ─── Selected Object ───
export type SelectedObject =
    | { type: 'agent'; agentId: AgentId }
    | { type: 'desk'; agentId: AgentId }
    | { type: 'whiteboard' }
    | { type: 'coffee' }
    | { type: 'server' }
    | { type: 'plant'; index: number }
    | null;

const SKIN_TONES: Record<string, string> = {
    chora: '#f0d0b0', subrosa: '#e8c8a0', thaum: '#d4a880',
    praxis: '#e8d0a0', mux: '#d8c0a8', primus: '#c8b090',
};

function createInitialAgents(): Agent3DState[] {
    return DESK_CONFIGS.map(cfg => {
        const agent = AGENTS[cfg.agentId];
        return {
            id: cfg.agentId,
            name: agent.displayName,
            role: agent.role,
            color: agent.color,
            skinColor: SKIN_TONES[cfg.agentId] ?? '#e8c8a0',
            position: [cfg.position[0], 0.01, cfg.position[2] + 1.2] as [number, number, number],
            targetPosition: [cfg.position[0], 0.01, cfg.position[2] + 1.2] as [number, number, number],
            behavior: 'working' as AgentBehavior,
            frame: 0,
            speechBubble: undefined,
            speechTick: 0,
            deskPosition: cfg.position,
        };
    });
}

export function useOfficeState() {
    const { stats } = useSystemStats();
    const { sessions } = useConversations(5);
    const [agents, setAgents] = useState<Agent3DState[]>(createInitialAgents);
    const [selected, setSelected] = useState<SelectedObject>(null);
    const [draggingAgent, setDraggingAgent] = useState<AgentId | null>(null);
    const [hoveredObject, setHoveredObject] = useState<string | null>(null);
    const [recentEvents, setRecentEvents] = useState<AgentEvent[]>([]);
    const [activeMissions, setActiveMissions] = useState<Mission[]>([]);

    // Fetch recent events for behavior derivation
    useEffect(() => {
        async function fetchEvents() {
            try {
                const res = await fetch('/api/ops/events?limit=30');
                if (!res.ok) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to fetch events:', res.statusText);
                    return;
                }
                const data = await res.json();
                setRecentEvents(data.events ?? []);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Error fetching events:', err);
            }
        }
        fetchEvents();
    }, []);

    // Fetch active missions
    useEffect(() => {
        async function fetchMissions() {
            try {
                const res = await fetch('/api/ops/missions?status=running&limit=20');
                if (!res.ok) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to fetch missions:', res.statusText);
                    return;
                }
                const data = await res.json();
                setActiveMissions(data.missions ?? []);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Error fetching missions:', err);
            }
        }
        fetchMissions();
    }, []);

    // Fetch recent conversation turns for speech bubbles
    const [recentTurns, setRecentTurns] = useState<{ speaker: string; dialogue: string }[]>([]);
    useEffect(() => {
        async function fetchTurns() {
            try {
                const lastSession = sessions.find(s => s.status === 'completed' || s.status === 'running');
                if (!lastSession) return;
                const res = await fetch(`/api/ops/turns?session_id=${lastSession.id}`);
                if (!res.ok) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to fetch turns:', res.statusText);
                    return;
                }
                const data = await res.json();
                if (data.turns?.length > 0) {
                    setRecentTurns(data.turns.slice(-6).map((t: { speaker: string; dialogue: string }) => ({
                        speaker: t.speaker,
                        dialogue: t.dialogue,
                    })));
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Error fetching turns:', err);
            }
        }
        fetchTurns();
    }, [sessions]);

    // Derive behavior from real data (deterministic fallback to 'idle')
    const deriveBehavior = useCallback((agentId: AgentId): AgentBehavior => {
        // Check if agent has active mission
        const hasMission = activeMissions.some(m => m.created_by === agentId);
        if (hasMission) return 'working';

        // Check recent events
        const agentEvents = recentEvents.filter(e => e.agent_id === agentId);
        if (agentEvents.length > 0) {
            const latest = agentEvents[0];
            if (latest.kind.startsWith('conversation_') || latest.kind === 'roundtable_turn') return 'chatting';
            if (latest.kind === 'mission_completed' || latest.kind === 'step_completed') return 'celebrating';
            if (latest.kind.includes('analysis') || latest.kind.includes('research')) return 'thinking';
        }

        // Deterministic fallback to idle when no activity data
        return 'idle';
    }, [activeMissions, recentEvents]);

    // Cycle behaviors periodically
    useEffect(() => {
        const interval = setInterval(() => {
            setAgents(prev =>
                prev.map(agent => {
                    if (draggingAgent === agent.id) return agent;

                    const newBehavior = deriveBehavior(agent.id);
                    let targetPosition = [...agent.deskPosition] as [number, number, number];
                    targetPosition[1] = 0.01;
                    targetPosition[2] = agent.deskPosition[2] + 1.2;

                    if (newBehavior === 'walking') {
                        targetPosition = [
                            -8 + Math.random() * 16,
                            0.01,
                            -2 + Math.random() * 6,
                        ];
                    } else if (newBehavior === 'coffee') {
                        targetPosition = [PROPS.coffeeMachine[0] - 0.5, 0.01, PROPS.coffeeMachine[2] + 1];
                    }

                    // Speech bubble from real conversation data
                    let speechBubble: string | undefined;
                    if (newBehavior === 'chatting' && recentTurns.length > 0) {
                        const agentTurns = recentTurns.filter(t => t.speaker === agent.id);
                        if (agentTurns.length > 0) {
                            const turn = agentTurns[Math.floor(Math.random() * agentTurns.length)];
                            speechBubble = turn.dialogue.slice(0, 60);
                        }
                    }

                    return {
                        ...agent,
                        behavior: newBehavior,
                        targetPosition,
                        speechBubble,
                        speechTick: speechBubble ? SPEECH_BUBBLE_DURATION_FRAMES : 0,
                    };
                }),
            );
        }, BEHAVIOR_UPDATE_INTERVAL_MIN + Math.random() * (BEHAVIOR_UPDATE_INTERVAL_MAX - BEHAVIOR_UPDATE_INTERVAL_MIN));

        return () => clearInterval(interval);
    }, [deriveBehavior, draggingAgent, recentTurns]);

    // Animation tick — move agents toward targets
    useInterval(() => {
        setAgents(prev =>
            prev.map(agent => {
                if (draggingAgent === agent.id) return { ...agent, frame: agent.frame + 1 };

                const dx = agent.targetPosition[0] - agent.position[0];
                const dz = agent.targetPosition[2] - agent.position[2];
                const dist = Math.sqrt(dx * dx + dz * dz);

                let newPosition = agent.position;
                if (dist > AGENT_ARRIVED_THRESHOLD) {
                    newPosition = [
                        agent.position[0] + (dx / dist) * Math.min(AGENT_MOVE_SPEED, dist),
                        0.01,
                        agent.position[2] + (dz / dist) * Math.min(AGENT_MOVE_SPEED, dist),
                    ];
                }

                const newSpeechTick = agent.speechTick > 0 ? agent.speechTick - 1 : 0;

                return {
                    ...agent,
                    position: newPosition,
                    frame: agent.frame + 1,
                    speechBubble: newSpeechTick > 0 ? agent.speechBubble : undefined,
                    speechTick: newSpeechTick,
                };
            }),
        );
    }, 50);

    // Move agent during drag
    const moveAgent = useCallback((agentId: AgentId, x: number, z: number) => {
        setAgents(prev =>
            prev.map(agent =>
                agent.id === agentId
                    ? { ...agent, position: [x, 0.01, z], targetPosition: [x, 0.01, z] }
                    : agent,
            ),
        );
    }, []);

    const sessionData = useMemo(() =>
        sessions.map(s => ({
            id: s.id,
            format: s.format,
            status: s.status,
            participants: s.participants,
            topic: s.topic,
        })),
    [sessions]);

    return {
        agents,
        stats,
        sessions: sessionData,
        selected,
        setSelected,
        draggingAgent,
        setDraggingAgent,
        hoveredObject,
        setHoveredObject,
        moveAgent,
        recentEvents,
        activeMissions,
    };
}
