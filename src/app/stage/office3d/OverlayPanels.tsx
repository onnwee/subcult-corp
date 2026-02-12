// office3d/OverlayPanels.tsx — HTML overlay panels for agent/prop details
'use client';

import { useEffect } from 'react';
import { AGENTS } from '@/lib/agents';
import type { AgentId, AgentEvent, Mission } from '@/lib/types';
import type { SelectedObject, Agent3DState } from './useOfficeState';
import type { SystemStats } from '../hooks';
import { BEHAVIOR_EMOJIS } from './constants';

// ─── Panel container ───
function Panel({
    title,
    onClose,
    children,
    color,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    color?: string;
}) {
    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className='absolute top-4 right-4 w-80 max-h-[70vh] overflow-y-auto z-50 rounded-xl border border-zinc-700/50 bg-zinc-900/95 backdrop-blur-sm shadow-2xl'>
            {/* Header */}
            <div className='flex items-center justify-between px-4 py-3 border-b border-zinc-800'>
                <div className='flex items-center gap-2'>
                    {color && (
                        <div className='w-2 h-2 rounded-full' style={{ backgroundColor: color }} />
                    )}
                    <span className='text-sm font-semibold text-zinc-200'>{title}</span>
                </div>
                <button
                    onClick={onClose}
                    className='text-zinc-500 hover:text-zinc-300 text-lg leading-none px-1'
                >
                    ×
                </button>
            </div>
            {/* Content */}
            <div className='p-4 space-y-3'>
                {children}
            </div>
        </div>
    );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
        <div className='flex justify-between items-center'>
            <span className='text-xs text-zinc-500'>{label}</span>
            <span className={`text-sm font-medium ${color ?? 'text-zinc-200'}`}>{String(value)}</span>
        </div>
    );
}

// ─── Agent Panel ───
function AgentPanel({
    agentId,
    agents,
    events,
    missions,
    onClose,
}: {
    agentId: AgentId;
    agents: Agent3DState[];
    events: AgentEvent[];
    missions: Mission[];
    onClose: () => void;
}) {
    const config = AGENTS[agentId];
    const agent3d = agents.find(a => a.id === agentId);
    const agentEvents = events.filter(e => e.agent_id === agentId).slice(0, 5);
    const agentMissions = missions.filter(m => m.created_by === agentId).slice(0, 3);

    return (
        <Panel title={config.displayName} onClose={onClose} color={config.color}>
            {/* Profile */}
            <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                    <span className='text-xs px-2 py-0.5 rounded-full' style={{ backgroundColor: config.color + '22', color: config.color }}>
                        {config.role}
                    </span>
                    {agent3d && (
                        <span className='text-xs text-zinc-500'>
                            {BEHAVIOR_EMOJIS[agent3d.behavior]} {agent3d.behavior}
                        </span>
                    )}
                </div>
                <p className='text-xs text-zinc-400 leading-relaxed'>
                    {config.description}
                </p>
            </div>

            {/* Active Missions */}
            {agentMissions.length > 0 && (
                <div>
                    <h4 className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1'>Active Missions</h4>
                    {agentMissions.map(m => (
                        <div key={m.id} className='flex items-center gap-2 text-xs py-1'>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                m.status === 'running' ? 'bg-accent-green animate-pulse' :
                                m.status === 'approved' ? 'bg-accent-yellow' :
                                'bg-zinc-500'
                            }`} />
                            <span className='text-zinc-300 truncate'>{m.title}</span>
                            <span className='text-zinc-600 ml-auto shrink-0'>{m.status}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Recent Events */}
            {agentEvents.length > 0 && (
                <div>
                    <h4 className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1'>Recent Events</h4>
                    {agentEvents.map(e => (
                        <div key={e.id} className='text-xs py-1 border-b border-zinc-800/50 last:border-0'>
                            <div className='flex items-center gap-1.5'>
                                <span className='text-zinc-500 font-mono text-[10px]'>{e.kind}</span>
                            </div>
                            <span className='text-zinc-400 line-clamp-1'>{e.title}</span>
                        </div>
                    ))}
                </div>
            )}

            {agentMissions.length === 0 && agentEvents.length === 0 && (
                <p className='text-xs text-zinc-600 text-center py-2'>No recent activity</p>
            )}
        </Panel>
    );
}

// ─── Whiteboard Panel ───
function WhiteboardPanel({
    stats,
    onClose,
}: {
    stats: SystemStats | null;
    onClose: () => void;
}) {
    return (
        <Panel title='Ops Dashboard' onClose={onClose} color='#f9e2af'>
            {stats ? (
                <div className='space-y-2'>
                    <StatRow label='Total Events' value={stats.totalEvents.toLocaleString()} />
                    <StatRow label='Active Missions' value={stats.activeMissions} color={stats.activeMissions > 0 ? 'text-accent-green' : undefined} />
                    <StatRow label='Conversations' value={stats.totalConversations} />

                    <div className='pt-2 border-t border-zinc-800'>
                        <h4 className='text-[10px] uppercase tracking-wider text-zinc-500 mb-2'>Agent Memories</h4>
                        {Object.entries(stats.agentMemories).map(([agentId, count]) => {
                            const agent = AGENTS[agentId as AgentId];
                            return (
                                <div key={agentId} className='flex items-center gap-2 mb-1'>
                                    <div className='w-1.5 h-1.5 rounded-full' style={{ backgroundColor: agent?.color ?? '#666' }} />
                                    <span className='text-xs text-zinc-400'>{agent?.displayName ?? agentId}</span>
                                    <div className='flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden'>
                                        <div
                                            className='h-full rounded-full transition-all'
                                            style={{
                                                width: `${Math.min(count * 10, 100)}%`,
                                                backgroundColor: agent?.color ?? '#666',
                                                opacity: 0.6,
                                            }}
                                        />
                                    </div>
                                    <span className='text-[10px] text-zinc-600 tabular-nums'>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <p className='text-xs text-zinc-500 text-center'>Loading...</p>
            )}
        </Panel>
    );
}

// ─── Coffee Panel ───
function CoffeePanel({ agents, onClose }: { agents: Agent3DState[]; onClose: () => void }) {
    const coffeeAgents = agents.filter(a => a.behavior === 'coffee');
    const breakCount = agents.filter(a => a.behavior === 'idle' || a.behavior === 'coffee').length;

    return (
        <Panel title='Break Room' onClose={onClose} color='#fab387'>
            <StatRow label='Agents on Break' value={breakCount} />
            <StatRow label='Getting Coffee' value={coffeeAgents.length} />
            <div className='pt-2 border-t border-zinc-800'>
                <h4 className='text-[10px] uppercase tracking-wider text-zinc-500 mb-2'>Agent Status</h4>
                {agents.map(a => (
                    <div key={a.id} className='flex items-center gap-2 py-0.5'>
                        <div className='w-1.5 h-1.5 rounded-full' style={{ backgroundColor: a.color }} />
                        <span className='text-xs text-zinc-300'>{a.name}</span>
                        <span className='text-[10px] text-zinc-500 ml-auto'>
                            {BEHAVIOR_EMOJIS[a.behavior]} {a.behavior}
                        </span>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

// ─── Server Panel ───
function ServerPanel({ onClose }: { onClose: () => void }) {
    return (
        <Panel title='System Health' onClose={onClose} color='#a6e3a1'>
            <div className='space-y-2'>
                <StatRow label='Status' value='Online' color='text-accent-green' />
                <StatRow label='Database' value='Connected' color='text-accent-green' />
                <StatRow label='API Routes' value='17 active' />
                <StatRow label='Workers' value='3 running' />
                <div className='pt-2 border-t border-zinc-800'>
                    <div className='flex items-center gap-2'>
                        <span className='relative flex h-2 w-2'>
                            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75' />
                            <span className='relative inline-flex rounded-full h-2 w-2 bg-accent-green' />
                        </span>
                        <span className='text-[10px] text-zinc-500'>All systems operational</span>
                    </div>
                </div>
            </div>
        </Panel>
    );
}

// ─── Main Export ───
export function OverlayPanels({
    selected,
    agents,
    stats,
    events,
    missions,
    onClose,
}: {
    selected: SelectedObject;
    agents: Agent3DState[];
    stats: SystemStats | null;
    events: AgentEvent[];
    missions: Mission[];
    onClose: () => void;
}) {
    if (!selected) return null;

    switch (selected.type) {
        case 'agent':
        case 'desk':
            return (
                <AgentPanel
                    agentId={selected.agentId}
                    agents={agents}
                    events={events}
                    missions={missions}
                    onClose={onClose}
                />
            );
        case 'whiteboard':
            return <WhiteboardPanel stats={stats} onClose={onClose} />;
        case 'coffee':
            return <CoffeePanel agents={agents} onClose={onClose} />;
        case 'server':
            return <ServerPanel onClose={onClose} />;
        default:
            return null;
    }
}
