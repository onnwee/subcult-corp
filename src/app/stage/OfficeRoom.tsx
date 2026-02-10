// OfficeRoom — pixel art cyberpunk office with 3 agents
// Visual candy: day/dusk/night sky, agent behavior states, live whiteboard metrics
'use client';

import { useState, useEffect } from 'react';
import { useTimeOfDay, useInterval, useSystemStats } from './hooks';
import { AGENTS } from '@/lib/agents';

// ─── Types ───

type AgentBehavior =
    | 'working'
    | 'chatting'
    | 'coffee'
    | 'celebrating'
    | 'walking';

interface OfficeAgent {
    id: string;
    name: string;
    color: string;
    skinColor: string;
    x: number;
    y: number;
    behavior: AgentBehavior;
    targetX: number;
    frame: number;
}

// ─── Constants ───

const CANVAS_W = 800;
const CANVAS_H = 320;

// Skin tones for visual variety
const SKIN_TONES: Record<string, string> = {
    chora: '#f0d0b0',
    subrosa: '#e8c8a0',
    thaum: '#d4a880',
    praxis: '#e8d0a0',
    mux: '#d8c0a8',
};

const AGENT_CONFIGS = [
    {
        id: 'chora',
        name: AGENTS.chora.displayName,
        color: AGENTS.chora.color,
        skinColor: SKIN_TONES.chora,
        startX: 120,
    },
    {
        id: 'subrosa',
        name: AGENTS.subrosa.displayName,
        color: AGENTS.subrosa.color,
        skinColor: SKIN_TONES.subrosa,
        startX: 360,
    },
    {
        id: 'thaum',
        name: AGENTS.thaum.displayName,
        color: AGENTS.thaum.color,
        skinColor: SKIN_TONES.thaum,
        startX: 540,
    },
    {
        id: 'mux',
        name: AGENTS.mux.displayName,
        color: AGENTS.mux.color,
        skinColor: SKIN_TONES.mux,
        startX: 660,
    },
    {
        id: 'praxis',
        name: AGENTS.praxis.displayName,
        color: AGENTS.praxis.color,
        skinColor: SKIN_TONES.praxis,
        startX: 720,
    },
];

const SKY_COLORS = {
    day: { from: '#1e3a5f', to: '#0f172a' },
    dusk: { from: '#6b2fa0', to: '#1a0a2e' },
    night: { from: '#0a0a1a', to: '#050510' },
};

const BEHAVIORS: AgentBehavior[] = [
    'working',
    'chatting',
    'coffee',
    'celebrating',
    'walking',
];

const BEHAVIOR_EMOJIS: Record<AgentBehavior, string> = {
    working: '💻',
    chatting: '💬',
    coffee: '☕',
    celebrating: '🎉',
    walking: '🚶',
};

// ─── Agent Pixel Art (SVG-based for crispness) ───

function PixelAgent({ agent }: { agent: OfficeAgent }) {
    const bobOffset =
        agent.behavior === 'walking' ? Math.sin(agent.frame * 0.5) * 2 : 0;
    const isWalking = agent.behavior === 'walking';
    const legOffset = isWalking ? Math.sin(agent.frame * 0.8) * 3 : 0;

    return (
        <g transform={`translate(${agent.x}, ${agent.y + bobOffset})`}>
            {/* Shadow */}
            <ellipse cx={0} cy={36} rx={10} ry={3} fill='rgba(0,0,0,0.3)' />

            {/* Body */}
            <rect
                x={-6}
                y={8}
                width={12}
                height={16}
                rx={2}
                fill={agent.color}
            />

            {/* Head */}
            <rect
                x={-5}
                y={-2}
                width={10}
                height={10}
                rx={2}
                fill={agent.skinColor}
            />

            {/* Eyes */}
            <rect x={-3} y={1} width={2} height={2} rx={0.5} fill='#1a1a2e' />
            <rect x={1} y={1} width={2} height={2} rx={0.5} fill='#1a1a2e' />

            {/* Hair/hat accent */}
            <rect
                x={-5}
                y={-3}
                width={10}
                height={3}
                rx={1}
                fill={agent.color}
                opacity={0.7}
            />

            {/* Arms */}
            {agent.behavior === 'celebrating' ?
                <>
                    <line
                        x1={-6}
                        y1={12}
                        x2={-12}
                        y2={4}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                    <line
                        x1={6}
                        y1={12}
                        x2={12}
                        y2={4}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                </>
            : agent.behavior === 'coffee' ?
                <>
                    <line
                        x1={-6}
                        y1={12}
                        x2={-10}
                        y2={16}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                    <line
                        x1={6}
                        y1={12}
                        x2={10}
                        y2={10}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                    <rect
                        x={9}
                        y={8}
                        width={4}
                        height={5}
                        rx={1}
                        fill='#8B4513'
                    />
                </>
            :   <>
                    <line
                        x1={-6}
                        y1={12}
                        x2={-10}
                        y2={18}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                    <line
                        x1={6}
                        y1={12}
                        x2={10}
                        y2={18}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                </>
            }

            {/* Legs */}
            <line
                x1={-3}
                y1={24}
                x2={-3 + legOffset}
                y2={34}
                stroke={agent.color}
                strokeWidth={2.5}
                strokeLinecap='round'
                opacity={0.8}
            />
            <line
                x1={3}
                y1={24}
                x2={3 - legOffset}
                y2={34}
                stroke={agent.color}
                strokeWidth={2.5}
                strokeLinecap='round'
                opacity={0.8}
            />

            {/* Behavior indicator */}
            <text x={0} y={-10} textAnchor='middle' fontSize={10}>
                {BEHAVIOR_EMOJIS[agent.behavior]}
            </text>

            {/* Name label */}
            <text
                x={0}
                y={46}
                textAnchor='middle'
                fontSize={8}
                fill={agent.color}
                fontFamily='monospace'
                fontWeight='bold'
            >
                {agent.name}
            </text>
        </g>
    );
}

// ─── Office Furniture ───

function OfficeFurniture({ period }: { period: 'day' | 'dusk' | 'night' }) {
    const floorY = 280;
    const wallColor =
        period === 'night' ? '#12121a'
        : period === 'dusk' ? '#1a1425'
        : '#161625';
    const deskColor = period === 'night' ? '#2a2a3a' : '#333345';
    const screenGlow = period === 'night' ? 0.8 : 0.5;

    return (
        <>
            {/* Floor */}
            <rect
                x={0}
                y={floorY}
                width={CANVAS_W}
                height={40}
                fill='#1a1a2e'
            />
            <line
                x1={0}
                y1={floorY}
                x2={CANVAS_W}
                y2={floorY}
                stroke='#2a2a4a'
                strokeWidth={1}
            />

            {/* Back wall */}
            <rect x={0} y={80} width={CANVAS_W} height={200} fill={wallColor} />

            {/* Window */}
            <rect
                x={30}
                y={100}
                width={100}
                height={80}
                rx={2}
                fill='none'
                stroke='#3a3a5a'
                strokeWidth={2}
            />
            <rect
                x={32}
                y={102}
                width={96}
                height={76}
                rx={1}
                fill={`url(#skyGradient)`}
                opacity={0.4}
            />

            {/* Desks */}
            {[90, 330, 510, 630, 750].map((dx, i) => (
                <g key={i}>
                    <rect
                        x={dx - 25}
                        y={240}
                        width={50}
                        height={4}
                        rx={1}
                        fill={deskColor}
                    />
                    <rect
                        x={dx - 20}
                        y={244}
                        width={4}
                        height={36}
                        fill={deskColor}
                    />
                    <rect
                        x={dx + 16}
                        y={244}
                        width={4}
                        height={36}
                        fill={deskColor}
                    />
                    {/* Monitor */}
                    <rect
                        x={dx - 12}
                        y={222}
                        width={24}
                        height={16}
                        rx={1}
                        fill='#0a0a15'
                        stroke='#3a3a5a'
                        strokeWidth={0.5}
                    />
                    <rect
                        x={dx - 10}
                        y={224}
                        width={20}
                        height={12}
                        rx={0.5}
                        fill='#00ff88'
                        opacity={screenGlow * 0.15}
                    />
                    <rect
                        x={dx - 2}
                        y={238}
                        width={4}
                        height={2}
                        fill='#3a3a5a'
                    />
                </g>
            ))}

            {/* Coffee machine */}
            <rect
                x={720}
                y={235}
                width={20}
                height={25}
                rx={2}
                fill='#4a3a2a'
            />
            <rect x={723} y={237} width={14} height={5} rx={1} fill='#6a4a2a' />
            <circle cx={730} cy={248} r={2} fill='#ff6644' opacity={0.6} />

            {/* Ceiling lights */}
            {[150, 350, 550, 750].map(lx => (
                <g key={lx}>
                    <rect
                        x={lx - 15}
                        y={80}
                        width={30}
                        height={3}
                        fill='#2a2a4a'
                    />
                    <line
                        x1={lx}
                        y1={83}
                        x2={lx}
                        y2={93}
                        stroke='#3a3a5a'
                        strokeWidth={1}
                    />
                    <ellipse
                        cx={lx}
                        cy={96}
                        rx={8}
                        ry={3}
                        fill='#ffee88'
                        opacity={period === 'night' ? 0.15 : 0.3}
                    />
                </g>
            ))}
        </>
    );
}

// ─── Whiteboard ───

function Whiteboard({
    totalEvents,
    activeMissions,
    conversations,
}: {
    totalEvents: number;
    activeMissions: number;
    conversations: number;
}) {
    return (
        <g transform='translate(500, 110)'>
            {/* Board */}
            <rect
                x={0}
                y={0}
                width={120}
                height={70}
                rx={2}
                fill='#f5f5f0'
                stroke='#999'
                strokeWidth={1}
            />
            {/* Title */}
            <text
                x={60}
                y={14}
                textAnchor='middle'
                fontSize={7}
                fill='#333'
                fontFamily='monospace'
                fontWeight='bold'
            >
                OPS METRICS
            </text>
            <line
                x1={10}
                y1={18}
                x2={110}
                y2={18}
                stroke='#ccc'
                strokeWidth={0.5}
            />

            {/* Metrics */}
            <text x={15} y={32} fontSize={6} fill='#666' fontFamily='monospace'>
                Events: {totalEvents}
            </text>
            <text x={15} y={44} fontSize={6} fill='#666' fontFamily='monospace'>
                Active: {activeMissions}
            </text>
            <text x={15} y={56} fontSize={6} fill='#666' fontFamily='monospace'>
                Convos: {conversations}
            </text>

            {/* Status dot */}
            <circle cx={105} cy={58} r={3} fill='#22c55e'>
                <animate
                    attributeName='opacity'
                    values='1;0.3;1'
                    dur='2s'
                    repeatCount='indefinite'
                />
            </circle>
        </g>
    );
}

// ─── Stars (night/dusk only) ───

// Pre-generate star positions outside the component (pure, runs once at module load)
const STAR_DATA = Array.from({ length: 30 }, (_, i) => ({
    x: (i * 127 + 53) % 800,
    y: ((i * 71 + 17) % 70) + 5,
    r: ((i * 31) % 12) / 10 + 0.3,
    delay: ((i * 43) % 30) / 10,
}));

function Stars({ period }: { period: 'day' | 'dusk' | 'night' }) {
    const stars = STAR_DATA;

    if (period === 'day') return null;
    const opacity = period === 'night' ? 0.8 : 0.3;

    return (
        <>
            {stars.map((star, i) => (
                <circle
                    key={i}
                    cx={star.x}
                    cy={star.y}
                    r={star.r}
                    fill='white'
                    opacity={opacity}
                >
                    <animate
                        attributeName='opacity'
                        values={`${opacity};${opacity * 0.3};${opacity}`}
                        dur='3s'
                        begin={`${star.delay}s`}
                        repeatCount='indefinite'
                    />
                </circle>
            ))}
        </>
    );
}

// ─── Main Component ───

export function OfficeRoom() {
    const period = useTimeOfDay();
    const { stats } = useSystemStats();
    const sky = SKY_COLORS[period];

    const [agents, setAgents] = useState<OfficeAgent[]>(() =>
        AGENT_CONFIGS.map(cfg => ({
            id: cfg.id,
            name: cfg.name,
            color: cfg.color,
            skinColor: cfg.skinColor,
            x: cfg.startX,
            y: 230,
            behavior: 'working' as AgentBehavior,
            targetX: cfg.startX,
            frame: 0,
        })),
    );

    // Randomize behaviors every 8-15 seconds
    useEffect(() => {
        const interval = setInterval(
            () => {
                setAgents(prev =>
                    prev.map(agent => {
                        const newBehavior =
                            BEHAVIORS[
                                Math.floor(Math.random() * BEHAVIORS.length)
                            ];
                        const newTargetX =
                            newBehavior === 'walking' ?
                                100 + Math.random() * (CANVAS_W - 200)
                            : newBehavior === 'coffee' ? 720
                            : agent.x;

                        return {
                            ...agent,
                            behavior: newBehavior,
                            targetX: newTargetX,
                        };
                    }),
                );
            },
            8000 + Math.random() * 7000,
        );

        return () => clearInterval(interval);
    }, []);

    // Animation loop — move walking agents and increment frame counter
    useInterval(() => {
        setAgents(prev =>
            prev.map(agent => {
                let newX = agent.x;
                if (
                    agent.behavior === 'walking' ||
                    agent.behavior === 'coffee'
                ) {
                    const dx = agent.targetX - agent.x;
                    if (Math.abs(dx) > 2) {
                        newX = agent.x + Math.sign(dx) * 2;
                    }
                }
                return { ...agent, x: newX, frame: agent.frame + 1 };
            }),
        );
    }, 100);

    return (
        <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
            <div className='flex items-center justify-between px-4 py-2 border-b border-zinc-800'>
                <span className='text-xs font-medium text-zinc-400'>
                    🏢 The Office
                </span>
                <span className='text-[10px] text-zinc-600'>
                    {period === 'day' ?
                        '☀️ Day'
                    : period === 'dusk' ?
                        '🌅 Dusk'
                    :   '🌙 Night'}
                </span>
            </div>
            <svg
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                className='w-full'
                style={{ imageRendering: 'pixelated' }}
            >
                <defs>
                    <linearGradient
                        id='skyGradient'
                        x1='0'
                        y1='0'
                        x2='0'
                        y2='1'
                    >
                        <stop offset='0%' stopColor={sky.from} />
                        <stop offset='100%' stopColor={sky.to} />
                    </linearGradient>
                </defs>

                {/* Sky */}
                <rect
                    x={0}
                    y={0}
                    width={CANVAS_W}
                    height={80}
                    fill='url(#skyGradient)'
                />
                <Stars period={period} />

                {/* Office */}
                <OfficeFurniture period={period} />

                {/* Whiteboard */}
                <Whiteboard
                    totalEvents={stats?.totalEvents ?? 0}
                    activeMissions={stats?.activeMissions ?? 0}
                    conversations={stats?.totalConversations ?? 0}
                />

                {/* Agents */}
                {agents.map(agent => (
                    <PixelAgent key={agent.id} agent={agent} />
                ))}
            </svg>
        </div>
    );
}
