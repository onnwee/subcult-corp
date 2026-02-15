// OfficeRoom — pixel art cyberpunk office with 6 agents
// Real-time data: speech bubbles from conversations, behavior tied to system state
// Supports replay mode: agents gather at meeting table to re-enact roundtable sessions
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
    useTimeOfDay,
    useInterval,
    useSystemStats,
    useConversations,
    useRebellionState,
} from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId, RoundtableSession, RoundtableTurn } from '@/lib/types';

// ─── Types ───

type AgentBehavior =
    | 'working'
    | 'chatting'
    | 'coffee'
    | 'celebrating'
    | 'walking'
    | 'thinking';

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
    speechBubble?: string;
    speechTick: number; // counter for auto-clearing speech
}

// ─── Constants ───

const CANVAS_W = 800;
const CANVAS_H = 380;

const SKIN_TONES: Record<string, string> = {
    chora: '#f0d0b0',
    subrosa: '#e8c8a0',
    thaum: '#d4a880',
    praxis: '#e8d0a0',
    mux: '#d8c0a8',
    primus: '#c8b090',
};

const AGENT_CONFIGS = [
    {
        id: 'chora',
        name: AGENTS.chora.displayName,
        color: AGENTS.chora.color,
        skinColor: SKIN_TONES.chora,
        startX: 120,
        deskX: 90,
    },
    {
        id: 'subrosa',
        name: AGENTS.subrosa.displayName,
        color: AGENTS.subrosa.color,
        skinColor: SKIN_TONES.subrosa,
        startX: 360,
        deskX: 210,
    },
    {
        id: 'thaum',
        name: AGENTS.thaum.displayName,
        color: AGENTS.thaum.color,
        skinColor: SKIN_TONES.thaum,
        startX: 540,
        deskX: 330,
    },
    {
        id: 'primus',
        name: AGENTS.primus.displayName,
        color: AGENTS.primus.color,
        skinColor: SKIN_TONES.primus,
        startX: 240,
        deskX: 510,
    },
    {
        id: 'mux',
        name: AGENTS.mux.displayName,
        color: AGENTS.mux.color,
        skinColor: SKIN_TONES.mux,
        startX: 660,
        deskX: 630,
    },
    {
        id: 'praxis',
        name: AGENTS.praxis.displayName,
        color: AGENTS.praxis.color,
        skinColor: SKIN_TONES.praxis,
        startX: 720,
        deskX: 750,
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
    'thinking',
];

const BEHAVIOR_EMOJIS: Record<AgentBehavior, string> = {
    working: '💻',
    chatting: '💬',
    coffee: '☕',
    celebrating: '🎉',
    walking: '🚶',
    thinking: '💭',
};

// ─── Speech Bubble ───

function SpeechBubble({
    text,
    color,
    x,
    y,
}: {
    text: string;
    color: string;
    x: number;
    y: number;
}) {
    const maxWidth = 120;
    const lines = [];
    const words = text.split(' ');
    let current = '';
    for (const word of words) {
        if ((current + ' ' + word).length > 20) {
            lines.push(current);
            current = word;
        } else {
            current = current ? current + ' ' + word : word;
        }
    }
    if (current) lines.push(current);
    const lineCount = Math.min(lines.length, 3);
    const height = lineCount * 11 + 10;

    return (
        <g transform={`translate(${x}, ${y})`} opacity={0.95}>
            {/* Bubble */}
            <rect
                x={-maxWidth / 2}
                y={-height - 8}
                width={maxWidth}
                height={height}
                rx={4}
                fill='#1a1a2e'
                stroke={color}
                strokeWidth={0.8}
                opacity={0.92}
            />
            {/* Tail */}
            <polygon
                points={`-4,${-8} 4,${-8} 0,0`}
                fill='#1a1a2e'
                stroke={color}
                strokeWidth={0.8}
            />
            <rect x={-5} y={-9} width={10} height={3} fill='#1a1a2e' />
            {/* Text */}
            {lines.slice(0, 3).map((line, i) => (
                <text
                    key={i}
                    x={0}
                    y={-height + 4 + (i + 1) * 11}
                    textAnchor='middle'
                    fontSize={8}
                    fill='#d4d4d8'
                    fontFamily='monospace'
                >
                    {line.length > 22 ? line.slice(0, 20) + '…' : line}
                </text>
            ))}
        </g>
    );
}

// ─── Agent Pixel Art (SVG-based) ───

function PixelAgent({
    agent,
    isRebelling,
}: {
    agent: OfficeAgent;
    isRebelling?: boolean;
}) {
    const bobOffset =
        agent.behavior === 'walking' ? Math.sin(agent.frame * 0.5) * 2
        : agent.behavior === 'thinking' ? Math.sin(agent.frame * 0.2) * 0.5
        : 0;
    const isWalking = agent.behavior === 'walking';
    const legOffset = isWalking ? Math.sin(agent.frame * 0.8) * 3 : 0;

    return (
        <g
            transform={`translate(${agent.x}, ${agent.y + bobOffset})`}
            filter={isRebelling ? 'url(#rebellionGlow)' : undefined}
        >
            {/* Shadow */}
            <ellipse cx={0} cy={36} rx={10} ry={3} fill='rgba(0,0,0,0.3)' />

            {/* Rebellion pulse ring */}
            {isRebelling && (
                <ellipse
                    cx={0}
                    cy={16}
                    rx={16}
                    ry={24}
                    fill='none'
                    stroke='#ef4444'
                    strokeWidth={1}
                    opacity={0.4}
                >
                    <animate
                        attributeName='opacity'
                        values='0.4;0.1;0.4'
                        dur='1.5s'
                        repeatCount='indefinite'
                    />
                    <animate
                        attributeName='rx'
                        values='16;18;16'
                        dur='1.5s'
                        repeatCount='indefinite'
                    />
                    <animate
                        attributeName='ry'
                        values='24;26;24'
                        dur='1.5s'
                        repeatCount='indefinite'
                    />
                </ellipse>
            )}

            {/* Glow under agent when active */}
            {(agent.behavior === 'chatting' ||
                agent.behavior === 'celebrating') && (
                <ellipse
                    cx={0}
                    cy={36}
                    rx={14}
                    ry={4}
                    fill={agent.color}
                    opacity={0.15}
                >
                    <animate
                        attributeName='opacity'
                        values='0.15;0.08;0.15'
                        dur='2s'
                        repeatCount='indefinite'
                    />
                </ellipse>
            )}

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
            {agent.behavior === 'thinking' ?
                <>
                    <line
                        x1={-3}
                        y1={2}
                        x2={-1}
                        y2={2}
                        stroke='#1a1a2e'
                        strokeWidth={1.5}
                        strokeLinecap='round'
                    />
                    <line
                        x1={1}
                        y1={2}
                        x2={3}
                        y2={2}
                        stroke='#1a1a2e'
                        strokeWidth={1.5}
                        strokeLinecap='round'
                    />
                </>
            :   <>
                    <rect
                        x={-3}
                        y={1}
                        width={2}
                        height={2}
                        rx={0.5}
                        fill='#1a1a2e'
                    />
                    <rect
                        x={1}
                        y={1}
                        width={2}
                        height={2}
                        rx={0.5}
                        fill='#1a1a2e'
                    />
                </>
            }

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
                    {/* Steam from coffee */}
                    <path
                        d={`M10,7 Q12,${4 - Math.sin(agent.frame * 0.3)} 11,2`}
                        fill='none'
                        stroke='#fff'
                        strokeWidth={0.5}
                        opacity={0.3}
                    />
                </>
            : agent.behavior === 'thinking' ?
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
                        x2={4}
                        y2={6}
                        stroke={agent.skinColor}
                        strokeWidth={2.5}
                        strokeLinecap='round'
                    />
                    {/* Hand on chin */}
                    <circle cx={4} cy={5} r={1.5} fill={agent.skinColor} />
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

            {/* Speech bubble */}
            {agent.speechBubble && (
                <SpeechBubble
                    text={agent.speechBubble}
                    color={agent.color}
                    x={0}
                    y={-18}
                />
            )}
        </g>
    );
}

// ─── Office Furniture ───

function OfficeFurniture({ period }: { period: 'day' | 'dusk' | 'night' }) {
    const floorY = 300;
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
                height={80}
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
            {/* Floor grid lines for depth */}
            {[200, 400, 600].map(x => (
                <line
                    key={x}
                    x1={x}
                    y1={floorY}
                    x2={x}
                    y2={floorY + 80}
                    stroke='#1e1e30'
                    strokeWidth={0.5}
                />
            ))}

            {/* Back wall */}
            <rect
                x={0}
                y={100}
                width={CANVAS_W}
                height={200}
                fill={wallColor}
            />

            {/* Window — larger */}
            <rect
                x={20}
                y={110}
                width={120}
                height={90}
                rx={2}
                fill='none'
                stroke='#3a3a5a'
                strokeWidth={2}
            />
            <rect
                x={22}
                y={112}
                width={116}
                height={86}
                rx={1}
                fill='url(#skyGradient)'
                opacity={0.4}
            />
            {/* Window cross bars */}
            <line
                x1={80}
                y1={112}
                x2={80}
                y2={198}
                stroke='#3a3a5a'
                strokeWidth={1}
            />
            <line
                x1={22}
                y1={155}
                x2={138}
                y2={155}
                stroke='#3a3a5a'
                strokeWidth={1}
            />

            {/* Desks */}
            {AGENT_CONFIGS.map((cfg, i) => (
                <g key={i}>
                    <rect
                        x={cfg.deskX - 25}
                        y={260}
                        width={50}
                        height={4}
                        rx={1}
                        fill={deskColor}
                    />
                    <rect
                        x={cfg.deskX - 20}
                        y={264}
                        width={4}
                        height={36}
                        fill={deskColor}
                    />
                    <rect
                        x={cfg.deskX + 16}
                        y={264}
                        width={4}
                        height={36}
                        fill={deskColor}
                    />
                    {/* Monitor */}
                    <rect
                        x={cfg.deskX - 12}
                        y={242}
                        width={24}
                        height={16}
                        rx={1}
                        fill='#0a0a15'
                        stroke='#3a3a5a'
                        strokeWidth={0.5}
                    />
                    <rect
                        x={cfg.deskX - 10}
                        y={244}
                        width={20}
                        height={12}
                        rx={0.5}
                        fill={cfg.color}
                        opacity={screenGlow * 0.12}
                    />
                    {/* Screen scan line */}
                    <rect
                        x={cfg.deskX - 10}
                        y={244 + ((i * 3) % 12)}
                        width={20}
                        height={1}
                        fill='#fff'
                        opacity={0.03}
                    >
                        <animate
                            attributeName='y'
                            values='244;256;244'
                            dur={`${3 + i * 0.5}s`}
                            repeatCount='indefinite'
                        />
                    </rect>
                    <rect
                        x={cfg.deskX - 2}
                        y={258}
                        width={4}
                        height={2}
                        fill='#3a3a5a'
                    />
                    {/* Keyboard */}
                    <rect
                        x={cfg.deskX - 8}
                        y={261}
                        width={16}
                        height={2}
                        rx={0.5}
                        fill='#2a2a3a'
                    />
                </g>
            ))}

            {/* Server rack (right wall) */}
            <rect
                x={760}
                y={140}
                width={30}
                height={100}
                rx={2}
                fill='#1a1a28'
                stroke='#2a2a4a'
                strokeWidth={1}
            />
            {[148, 160, 172, 184, 196, 208, 220].map((y, i) => (
                <g key={y}>
                    <rect
                        x={764}
                        y={y}
                        width={22}
                        height={8}
                        rx={1}
                        fill='#0a0a15'
                    />
                    <circle
                        cx={782}
                        cy={y + 4}
                        r={1.5}
                        fill={i < 3 ? '#a6e3a1' : '#3a3a5a'}
                    >
                        {i < 3 && (
                            <animate
                                attributeName='opacity'
                                values='1;0.4;1'
                                dur={`${1.5 + i * 0.3}s`}
                                repeatCount='indefinite'
                            />
                        )}
                    </circle>
                </g>
            ))}

            {/* Plant */}
            <g transform='translate(165, 250)'>
                <rect
                    x={-4}
                    y={5}
                    width={8}
                    height={10}
                    rx={1}
                    fill='#4a3a2a'
                />
                <circle cx={0} cy={2} r={6} fill='#166534' />
                <circle cx={-4} cy={-1} r={4} fill='#15803d' />
                <circle cx={4} cy={0} r={4} fill='#166534' />
            </g>

            {/* Plant 2 */}
            <g transform='translate(470, 248)'>
                <rect x={-3} y={6} width={6} height={8} rx={1} fill='#6b4226' />
                <ellipse cx={0} cy={3} rx={5} ry={7} fill='#15803d' />
            </g>

            {/* Coffee machine */}
            <rect
                x={720}
                y={252}
                width={22}
                height={28}
                rx={2}
                fill='#4a3a2a'
            />
            <rect x={723} y={254} width={16} height={6} rx={1} fill='#6a4a2a' />
            <circle cx={731} cy={268} r={2} fill='#ff6644' opacity={0.6}>
                <animate
                    attributeName='opacity'
                    values='0.6;0.2;0.6'
                    dur='3s'
                    repeatCount='indefinite'
                />
            </circle>

            {/* Ceiling lights with glow */}
            {[150, 350, 550, 750].map(lx => (
                <g key={lx}>
                    <rect
                        x={lx - 15}
                        y={100}
                        width={30}
                        height={3}
                        fill='#2a2a4a'
                    />
                    <line
                        x1={lx}
                        y1={103}
                        x2={lx}
                        y2={113}
                        stroke='#3a3a5a'
                        strokeWidth={1}
                    />
                    <ellipse
                        cx={lx}
                        cy={116}
                        rx={8}
                        ry={3}
                        fill='#ffee88'
                        opacity={period === 'night' ? 0.15 : 0.3}
                    />
                    {/* Light cone */}
                    <polygon
                        points={`${lx - 6},119 ${lx + 6},119 ${lx + 30},300 ${lx - 30},300`}
                        fill='#ffee88'
                        opacity={period === 'night' ? 0.015 : 0.025}
                    />
                </g>
            ))}

            {/* Clock on wall */}
            <g transform='translate(400, 130)'>
                <circle
                    cx={0}
                    cy={0}
                    r={12}
                    fill='#1a1a28'
                    stroke='#3a3a5a'
                    strokeWidth={1}
                />
                <circle cx={0} cy={0} r={10} fill='#0a0a15' />
                {/* Hour marks */}
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(
                    deg => (
                        <line
                            key={deg}
                            x1={0}
                            y1={-8}
                            x2={0}
                            y2={-7}
                            stroke='#555'
                            strokeWidth={0.5}
                            transform={`rotate(${deg})`}
                        />
                    ),
                )}
                {/* Animated hands */}
                <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={-6}
                    stroke='#9ca3af'
                    strokeWidth={1}
                    strokeLinecap='round'
                >
                    <animateTransform
                        attributeName='transform'
                        type='rotate'
                        from='0'
                        to='360'
                        dur='3600s'
                        repeatCount='indefinite'
                    />
                </line>
                <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={-8}
                    stroke='#d4d4d8'
                    strokeWidth={0.5}
                    strokeLinecap='round'
                >
                    <animateTransform
                        attributeName='transform'
                        type='rotate'
                        from='0'
                        to='360'
                        dur='60s'
                        repeatCount='indefinite'
                    />
                </line>
            </g>

            {/* Poster on wall */}
            <g transform='translate(220, 120)'>
                <rect
                    x={0}
                    y={0}
                    width={40}
                    height={55}
                    rx={1}
                    fill='#1a1a30'
                    stroke='#3a3a5a'
                    strokeWidth={0.5}
                />
                <text
                    x={20}
                    y={20}
                    textAnchor='middle'
                    fontSize={5}
                    fill='#cba6f7'
                    fontFamily='monospace'
                >
                    SUBCULT
                </text>
                <text
                    x={20}
                    y={30}
                    textAnchor='middle'
                    fontSize={4}
                    fill='#4a4a6a'
                    fontFamily='monospace'
                >
                    AUTONOMY
                </text>
                <text
                    x={20}
                    y={38}
                    textAnchor='middle'
                    fontSize={4}
                    fill='#4a4a6a'
                    fontFamily='monospace'
                >
                    THROUGH
                </text>
                <text
                    x={20}
                    y={46}
                    textAnchor='middle'
                    fontSize={4}
                    fill='#4a4a6a'
                    fontFamily='monospace'
                >
                    ALIGNMENT
                </text>
            </g>
        </>
    );
}

// ─── Enhanced Whiteboard ───

function Whiteboard({
    totalEvents,
    activeMissions,
    conversations,
    memories,
}: {
    totalEvents: number;
    activeMissions: number;
    conversations: number;
    memories: Record<string, number>;
}) {
    const totalMemories = Object.values(memories).reduce((a, b) => a + b, 0);

    return (
        <g transform='translate(530, 120)'>
            {/* Board */}
            <rect
                x={0}
                y={0}
                width={140}
                height={90}
                rx={2}
                fill='#f5f5f0'
                stroke='#999'
                strokeWidth={1}
            />
            {/* Title */}
            <text
                x={70}
                y={14}
                textAnchor='middle'
                fontSize={7}
                fill='#333'
                fontFamily='monospace'
                fontWeight='bold'
            >
                OPS DASHBOARD
            </text>
            <line
                x1={10}
                y1={18}
                x2={130}
                y2={18}
                stroke='#ccc'
                strokeWidth={0.5}
            />

            {/* Metrics in a grid */}
            <text x={15} y={32} fontSize={6} fill='#666' fontFamily='monospace'>
                Events
            </text>
            <text
                x={95}
                y={32}
                fontSize={7}
                fill='#333'
                fontFamily='monospace'
                fontWeight='bold'
                textAnchor='end'
            >
                {totalEvents}
            </text>

            <text x={15} y={44} fontSize={6} fill='#666' fontFamily='monospace'>
                Active
            </text>
            <text
                x={95}
                y={44}
                fontSize={7}
                fill={activeMissions > 0 ? '#a6e3a1' : '#333'}
                fontFamily='monospace'
                fontWeight='bold'
                textAnchor='end'
            >
                {activeMissions}
            </text>

            <text x={15} y={56} fontSize={6} fill='#666' fontFamily='monospace'>
                Convos
            </text>
            <text
                x={95}
                y={56}
                fontSize={7}
                fill='#333'
                fontFamily='monospace'
                fontWeight='bold'
                textAnchor='end'
            >
                {conversations}
            </text>

            <text x={15} y={68} fontSize={6} fill='#666' fontFamily='monospace'>
                Memories
            </text>
            <text
                x={95}
                y={68}
                fontSize={7}
                fill='#333'
                fontFamily='monospace'
                fontWeight='bold'
                textAnchor='end'
            >
                {totalMemories}
            </text>

            {/* Mini bar chart for memories by agent */}
            <line
                x1={100}
                y1={24}
                x2={100}
                y2={72}
                stroke='#ddd'
                strokeWidth={0.5}
            />
            {Object.entries(memories)
                .slice(0, 6)
                .map(([agentId, count], i) => {
                    const agent = AGENTS[agentId as AgentId];
                    const barWidth = Math.min(count * 4, 30);
                    return (
                        <g key={agentId}>
                            <rect
                                x={104}
                                y={25 + i * 8}
                                width={barWidth}
                                height={5}
                                rx={1}
                                fill={agent?.color ?? '#666'}
                                opacity={0.6}
                            />
                            {count > 0 && (
                                <text
                                    x={106 + barWidth}
                                    y={30 + i * 8}
                                    fontSize={5}
                                    fill='#999'
                                    fontFamily='monospace'
                                >
                                    {count}
                                </text>
                            )}
                        </g>
                    );
                })}

            {/* Status dot */}
            <circle cx={125} cy={80} r={3} fill='#a6e3a1'>
                <animate
                    attributeName='opacity'
                    values='1;0.3;1'
                    dur='2s'
                    repeatCount='indefinite'
                />
            </circle>
            <text
                x={118}
                y={83}
                fontSize={5}
                fill='#999'
                fontFamily='monospace'
                textAnchor='end'
            >
                LIVE
            </text>
        </g>
    );
}

// ─── Stars (night/dusk only) ───

const STAR_DATA = Array.from({ length: 40 }, (_, i) => ({
    x: (i * 127 + 53) % 800,
    y: ((i * 71 + 17) % 70) + 5,
    r: ((i * 31) % 12) / 10 + 0.3,
    delay: ((i * 43) % 30) / 10,
}));

function Stars({ period }: { period: 'day' | 'dusk' | 'night' }) {
    if (period === 'day') return null;
    const opacity = period === 'night' ? 0.8 : 0.3;

    return (
        <>
            {STAR_DATA.map((star, i) => (
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
            {/* Moon (night only) */}
            {period === 'night' && (
                <g transform='translate(700, 30)'>
                    <circle cx={0} cy={0} r={12} fill='#e0e0d0' opacity={0.2} />
                    <circle cx={3} cy={-2} r={10} fill='#0a0a1a' />{' '}
                    {/* Crescent mask */}
                </g>
            )}
        </>
    );
}

// ─── Floating Particles ───

const PARTICLE_DATA = Array.from({ length: 15 }, (_, i) => ({
    x: (i * 53 + 17) % CANVAS_W,
    baseY: 120 + ((i * 37) % 160),
    size: 0.5 + ((i * 13) % 10) / 10,
    speed: 8 + (i % 5) * 4,
    delay: (i * 2) % 10,
}));

function FloatingParticles() {
    return (
        <>
            {PARTICLE_DATA.map((p, i) => (
                <circle
                    key={i}
                    cx={p.x}
                    cy={p.baseY}
                    r={p.size}
                    fill='#fff'
                    opacity={0.04}
                >
                    <animate
                        attributeName='cy'
                        values={`${p.baseY};${p.baseY - 20};${p.baseY}`}
                        dur={`${p.speed}s`}
                        begin={`${p.delay}s`}
                        repeatCount='indefinite'
                    />
                    <animate
                        attributeName='opacity'
                        values='0.04;0.08;0.04'
                        dur={`${p.speed}s`}
                        begin={`${p.delay}s`}
                        repeatCount='indefinite'
                    />
                </circle>
            ))}
        </>
    );
}

// ─── Agent Status Cards (below SVG) ───

function AgentStatusBar({
    agents,
    sessions,
    rebellingAgentIds,
}: {
    agents: OfficeAgent[];
    sessions: {
        format: string;
        status: string;
        participants: string[];
        topic: string;
    }[];
    rebellingAgentIds: Set<string>;
}) {
    const activeSession = sessions.find(
        s => s.status === 'running' || s.status === 'pending',
    );
    const lastCompleted = sessions.find(s => s.status === 'completed');

    return (
        <div className='px-3 py-2 border-t border-zinc-800/50 bg-zinc-900/30'>
            <div className='flex items-center gap-3 overflow-x-auto'>
                {agents.map(agent => {
                    const agentDef = AGENTS[agent.id as AgentId];
                    const inActiveSession =
                        activeSession?.participants.includes(agent.id);
                    const textColor =
                        agentDef?.tailwindTextColor ?? 'text-zinc-400';

                    return (
                        <div
                            key={agent.id}
                            className='flex items-center gap-1.5 shrink-0'
                        >
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${agentDef?.tailwindBgColor ?? 'bg-zinc-500'} ${inActiveSession ? 'animate-pulse' : ''}`}
                            />
                            <span
                                className={`text-[10px] font-semibold ${textColor}`}
                            >
                                {agent.name}
                            </span>
                            <span className='text-[9px] text-zinc-600'>
                                {rebellingAgentIds.has(agent.id) ?
                                    '⚡ rebelling'
                                : inActiveSession ?
                                    'in session'
                                :   agent.behavior}
                            </span>
                        </div>
                    );
                })}
                {activeSession && (
                    <div className='ml-auto flex items-center gap-1.5 shrink-0'>
                        <span className='relative flex h-1.5 w-1.5'>
                            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-blue opacity-75' />
                            <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-blue' />
                        </span>
                        <span className='text-[10px] text-accent-blue font-medium'>
                            {activeSession.format}
                        </span>
                        <span className='text-[9px] text-zinc-600 max-w-40 truncate'>
                            {activeSession.topic}
                        </span>
                    </div>
                )}
                {!activeSession && lastCompleted && (
                    <div className='ml-auto shrink-0'>
                        <span className='text-[9px] text-zinc-600'>
                            Last: {lastCompleted.format}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Replay Helpers ───

/** Meeting table positions: agents gather near center during replay */
const MEETING_POSITIONS: Record<string, number> = {
    chora: 280,
    subrosa: 340,
    thaum: 400,
    primus: 460,
    mux: 520,
    praxis: 580,
};

function truncateDialogue(text: string, maxLen = 80): string {
    const cleaned = text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length <= maxLen) return cleaned;
    const truncated = cleaned.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    return (
        (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) +
        '…'
    );
}

// ─── Main Component ───

export interface OfficeRoomProps {
    /** Replay mode props — pass all four to activate replay */
    replaySession?: RoundtableSession;
    replayTurns?: RoundtableTurn[];
    currentTurnIndex?: number;
    isReplaying?: boolean;
}

export function OfficeRoom({
    replaySession,
    replayTurns,
    currentTurnIndex,
    isReplaying,
}: OfficeRoomProps) {
    const period = useTimeOfDay();
    const { stats } = useSystemStats();
    const { sessions } = useConversations(5);
    const { rebellingAgentIds } = useRebellionState();
    const sky = SKY_COLORS[period];

    // Determine which agents are replay participants
    const replayParticipants = useMemo(
        () => new Set(replaySession?.participants ?? []),
        [replaySession?.participants],
    );

    // Current replay turn
    const currentReplayTurn =
        isReplaying && replayTurns && currentTurnIndex !== undefined ?
            replayTurns[currentTurnIndex]
        :   undefined;

    const [agents, setAgents] = useState<OfficeAgent[]>(() =>
        AGENT_CONFIGS.map(cfg => ({
            id: cfg.id,
            name: cfg.name,
            color: cfg.color,
            skinColor: cfg.skinColor,
            x: cfg.startX,
            y: 250,
            behavior: 'working' as AgentBehavior,
            targetX: cfg.startX,
            frame: 0,
            speechBubble: undefined,
            speechTick: 0,
        })),
    );

    // Track replay state changes with refs to avoid setState in effects
    const prevReplayingRef = useRef(isReplaying);
    const prevTurnIndexRef = useRef(currentTurnIndex);

    // Replay mode: override positions and behaviors for participants
    // Uses refs to track state changes and updates are applied in animation loop
    useEffect(() => {
        prevReplayingRef.current = isReplaying;
        prevTurnIndexRef.current = currentTurnIndex;
    }, [isReplaying, currentTurnIndex]);

    // Fetch recent conversation turns for speech bubbles (normal mode only)
    const [recentTurns, setRecentTurns] = useState<
        { speaker: string; dialogue: string }[]
    >([]);

    useEffect(() => {
        if (isReplaying) return; // Skip in replay mode
        async function fetchTurns() {
            try {
                const lastSession = sessions.find(
                    s => s.status === 'completed' || s.status === 'running',
                );
                if (!lastSession) return;
                const res = await fetch(
                    `/api/ops/turns?session_id=${lastSession.id}`,
                );
                if (!res.ok) return;
                const data = await res.json();
                if (data.turns?.length > 0) {
                    setRecentTurns(
                        data.turns
                            .slice(-6)
                            .map(
                                (t: { speaker: string; dialogue: string }) => ({
                                    speaker: t.speaker,
                                    dialogue: t.dialogue,
                                }),
                            ),
                    );
                }
            } catch {
                /* ignore */
            }
        }
        fetchTurns();
    }, [sessions, isReplaying]);

    // Cycle behaviors with speech bubbles from real data (normal mode only)
    useEffect(() => {
        if (isReplaying) return; // Disable behavior cycling in replay mode

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

                        // Maybe show speech bubble from real conversation data
                        let speechBubble: string | undefined;
                        if (
                            newBehavior === 'chatting' &&
                            recentTurns.length > 0
                        ) {
                            const agentTurns = recentTurns.filter(
                                t => t.speaker === agent.id,
                            );
                            if (agentTurns.length > 0) {
                                const turn =
                                    agentTurns[
                                        Math.floor(
                                            Math.random() * agentTurns.length,
                                        )
                                    ];
                                speechBubble = turn.dialogue.slice(0, 60);
                            }
                        }

                        return {
                            ...agent,
                            behavior: newBehavior,
                            targetX: newTargetX,
                            speechBubble,
                            speechTick: speechBubble ? 40 : 0, // Auto-clear after ~4 seconds
                        };
                    }),
                );
            },
            8000 + Math.random() * 7000,
        );

        return () => clearInterval(interval);
    }, [recentTurns, isReplaying]);

    // Animation loop - handles position updates and replay state changes
    useInterval(() => {
        setAgents(prev =>
            prev.map(agent => {
                // Handle replay mode state changes
                if (isReplaying) {
                    const isParticipant = replayParticipants.has(agent.id);
                    if (isParticipant) {
                        const meetingX = MEETING_POSITIONS[agent.id] ?? agent.x;
                        const isSpeaker = currentReplayTurn?.speaker === agent.id;
                        const behavior: AgentBehavior =
                            isSpeaker ? 'chatting' : 'thinking';

                        // Show speech bubble for current speaker
                        let speechBubble: string | undefined;
                        let speechTick = 0;
                        if (isSpeaker && currentReplayTurn) {
                            speechBubble = truncateDialogue(
                                currentReplayTurn.dialogue,
                                80,
                            );
                            speechTick = 999; // Keep showing until turn changes
                        }

                        // Glide participants to meeting positions
                        let newX = agent.x;
                        const dx = meetingX - agent.x;
                        if (Math.abs(dx) > 1) {
                            newX =
                                agent.x + Math.sign(dx) * Math.min(Math.abs(dx), 3);
                        }

                        return {
                            ...agent,
                            x: newX,
                            behavior,
                            targetX: meetingX,
                            speechBubble,
                            speechTick,
                            frame: agent.frame + 1,
                        };
                    }
                }

                // Handle exit from replay mode - return to desks
                if (!isReplaying && prevReplayingRef.current) {
                    const cfg = AGENT_CONFIGS.find(c => c.id === agent.id);
                    return {
                        ...agent,
                        targetX: cfg?.startX ?? agent.x,
                        speechBubble: undefined,
                        speechTick: 0,
                        behavior: 'working' as AgentBehavior,
                        frame: agent.frame + 1,
                    };
                }

                // Normal mode - handle walking and animation
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

                // Auto-clear speech bubbles in normal mode
                const newSpeechTick =
                    agent.speechTick > 0 ? agent.speechTick - 1 : 0;

                return {
                    ...agent,
                    x: newX,
                    frame: agent.frame + 1,
                    speechBubble:
                        newSpeechTick > 0 ? agent.speechBubble : undefined,
                    speechTick: newSpeechTick,
                };
            }),
        );
    }, 100);

    const sessionData = useMemo(
        () =>
            sessions.map(s => ({
                format: s.format,
                status: s.status,
                participants: s.participants,
                topic: s.topic,
            })),
        [sessions],
    );

    return (
        <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
            <div className='flex items-center justify-between px-4 py-2 border-b border-zinc-800'>
                <span className='text-xs font-medium text-zinc-400'>
                    The Office
                </span>
                <div className='flex items-center gap-3'>
                    {isReplaying ?
                        <span className='flex items-center gap-1.5 text-[10px] text-accent-blue font-medium'>
                            <span className='relative flex h-1.5 w-1.5'>
                                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-blue opacity-75' />
                                <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-blue' />
                            </span>
                            Replay — {replaySession?.format.replace(/_/g, ' ')}
                        </span>
                    :   <>
                            {rebellingAgentIds.size > 0 && (
                                <span className='flex items-center gap-1 text-[10px] text-red-400 font-medium'>
                                    <span className='relative flex h-1.5 w-1.5'>
                                        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75' />
                                        <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500' />
                                    </span>
                                    Rebellion
                                </span>
                            )}
                            <span className='text-[10px] text-zinc-600'>
                                {period === 'day' ?
                                    'Day'
                                : period === 'dusk' ?
                                    'Dusk'
                                :   'Night'}
                            </span>
                            <span className='text-[10px] text-zinc-700'>
                                {
                                    agents.filter(a => a.behavior !== 'working')
                                        .length
                                }{' '}
                                agents active
                            </span>
                        </>
                    }
                </div>
            </div>
            <svg
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                className='w-full'
                style={{ imageRendering: 'auto' }}
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
                    <filter id='glow'>
                        <feGaussianBlur stdDeviation='2' result='blur' />
                        <feMerge>
                            <feMergeNode in='blur' />
                            <feMergeNode in='SourceGraphic' />
                        </feMerge>
                    </filter>
                    <filter id='rebellionGlow'>
                        <feDropShadow
                            dx='0'
                            dy='0'
                            stdDeviation='3'
                            floodColor='#ef4444'
                            floodOpacity='0.6'
                        />
                    </filter>
                </defs>

                {/* Sky */}
                <rect
                    x={0}
                    y={0}
                    width={CANVAS_W}
                    height={100}
                    fill='url(#skyGradient)'
                />
                <Stars period={period} />

                {/* Office */}
                <OfficeFurniture period={period} />

                {/* Floating ambient particles */}
                <FloatingParticles />

                {/* Whiteboard */}
                <Whiteboard
                    totalEvents={stats?.totalEvents ?? 0}
                    activeMissions={stats?.activeMissions ?? 0}
                    conversations={stats?.totalConversations ?? 0}
                    memories={stats?.agentMemories ?? {}}
                />

                {/* Agents */}
                {agents.map(agent => (
                    <PixelAgent
                        key={agent.id}
                        agent={agent}
                        isRebelling={rebellingAgentIds.has(agent.id)}
                    />
                ))}
            </svg>

            {/* Agent status bar */}
            <AgentStatusBar
                agents={agents}
                sessions={sessionData}
                rebellingAgentIds={rebellingAgentIds}
            />
        </div>
    );
}
