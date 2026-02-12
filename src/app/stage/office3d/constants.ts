// office3d/constants.ts — shared constants for the 3D office scene
import type { AgentId } from '@/lib/types';

// ─── Catppuccin Mocha Colors ───
export const COLORS = {
    background: '#11111b',
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b',
    surface0: '#313244',
    surface1: '#45475a',
    surface2: '#585b70',
    overlay0: '#6c7086',
    text: '#cdd6f4',
    subtext: '#a6adc8',
    yellow: '#f9e2af',
    green: '#a6e3a1',
    red: '#f38ba8',
    blue: '#89b4fa',
    lavender: '#b4befe',
    sapphire: '#74c7ec',
    accent: '#cba6f7',
    pink: '#f5c2e7',
    peach: '#fab387',
    sky: '#89dceb',
} as const;

// ─── Agent Colors (matching AGENTS config) ───
export const AGENT_COLORS: Record<AgentId, string> = {
    chora: '#b4befe',
    subrosa: '#f38ba8',
    thaum: '#cba6f7',
    praxis: '#a6e3a1',
    mux: '#74c7ec',
    primus: '#f5c2e7',
};

export const AGENT_SKIN_TONES: Record<AgentId, string> = {
    chora: '#f0d0b0',
    subrosa: '#e8c8a0',
    thaum: '#d4a880',
    praxis: '#e8d0a0',
    mux: '#d8c0a8',
    primus: '#c8b090',
};

// ─── Office Dimensions ───
export const OFFICE = {
    width: 20,
    depth: 10,
    wallHeight: 4,
    floorY: 0,
} as const;

// ─── Desk Positions (isometric grid) ───
export interface DeskConfig {
    agentId: AgentId;
    position: [number, number, number]; // [x, y, z]
}

export const DESK_CONFIGS: DeskConfig[] = [
    { agentId: 'chora',   position: [-7.5, 0, 1] },
    { agentId: 'subrosa', position: [-4.5, 0, 1] },
    { agentId: 'thaum',   position: [-1.5, 0, 1] },
    { agentId: 'primus',  position: [1.5,  0, 1] },
    { agentId: 'mux',     position: [4.5,  0, 1] },
    { agentId: 'praxis',  position: [7.5,  0, 1] },
];

// ─── Prop Positions ───
export const PROPS = {
    coffeeMachine:  [8.5, 0, 3.5] as [number, number, number],
    serverRack:     [9.2, 0, -3.5] as [number, number, number],
    plant1:         [-8.5, 0, 3] as [number, number, number],
    plant2:         [0, 0, 3.5] as [number, number, number],
    whiteboard:     [3, 2.2, -4.7] as [number, number, number],
    poster:         [-5, 2.5, -4.7] as [number, number, number],
    clock:          [0, 3, -4.7] as [number, number, number],
    window:         [-7.5, 2, -4.7] as [number, number, number],
} as const;

// ─── Camera Settings ───
export const CAMERA = {
    position: [15, 15, 15] as [number, number, number],
    zoom: 40,
    near: 0.1,
    far: 100,
} as const;

// ─── Agent Behavior Types ───
export type AgentBehavior = 'idle' | 'working' | 'walking' | 'chatting' | 'coffee' | 'celebrating' | 'thinking';

export const BEHAVIOR_EMOJIS: Record<AgentBehavior, string> = {
    idle: '💤',
    working: '💻',
    chatting: '💬',
    coffee: '☕',
    celebrating: '🎉',
    walking: '🚶',
    thinking: '💭',
};

// ─── Sky Colors by Time of Day ───
export const SKY_COLORS = {
    day:   { top: '#1e3a5f', bottom: '#0f172a' },
    dusk:  { top: '#6b2fa0', bottom: '#1a0a2e' },
    night: { top: '#0a0a1a', bottom: '#050510' },
} as const;
