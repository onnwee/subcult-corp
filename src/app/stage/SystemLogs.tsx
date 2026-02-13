// SystemLogs — full system observability dashboard
// Real-time container health, worker activity, error tracking, agent metrics
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useInterval } from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

// ─── Types ───

interface SystemData {
    recentEvents: SystemEvent[];
    sessionStats: SessionStat[];
    errorLog: SystemEvent[];
    eventTimeline: TimelinePoint[];
    agentActivity: AgentActivityRow[];
    memoryStats: MemoryStat[];
    lastHeartbeat: { created_at: string; metadata: Record<string, unknown> } | null;
    recentSessions: SessionRow[];
    serverTime: string;
}

interface SystemEvent {
    id: string;
    agent_id: string;
    kind: string;
    title: string;
    summary?: string;
    tags: string[];
    metadata: Record<string, unknown>;
    created_at: string;
}

interface SessionStat {
    status: string;
    format: string;
    count: number;
    avg_turns: number;
    last_at: string;
}

interface TimelinePoint {
    hour: string;
    count: number;
    agents_active: number;
}

interface AgentActivityRow {
    agent_id: string;
    total_events: number;
    events_last_hour: number;
    last_active: string;
    event_kinds: string[];
}

interface MemoryStat {
    agent_id: string;
    total: number;
    active: number;
}

interface SessionRow {
    id: string;
    format: string;
    topic: string;
    participants: string[];
    status: string;
    turn_count: number;
    metadata: Record<string, unknown>;
    created_at: string;
    started_at?: string;
    completed_at?: string;
}

// ─── Helpers ───

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
}

// ─── Status Indicator ───

function StatusPulse({ status }: { status: 'healthy' | 'warning' | 'error' | 'unknown' }) {
    const colors = {
        healthy: 'bg-accent-green',
        warning: 'bg-accent-yellow',
        error: 'bg-accent-red',
        unknown: 'bg-zinc-600',
    };
    const pingColors = {
        healthy: 'bg-accent-green',
        warning: 'bg-accent-yellow',
        error: 'bg-accent-red',
        unknown: 'bg-zinc-500',
    };

    return (
        <span className='relative flex h-2.5 w-2.5'>
            {status !== 'unknown' && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColors[status]} opacity-75`} />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors[status]}`} />
        </span>
    );
}

// ─── Activity Sparkline (CSS-based mini bar chart) ───
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Sparkline({ data, maxHeight = 24 }: { data: number[]; maxHeight?: number }) {
    const max = Math.max(...data, 1);
    return (
        <div className='flex items-end gap-px h-6'>
            {data.map((val, i) => (
                <div
                    key={i}
                    className='w-1.5 rounded-t-sm bg-accent-green/60 transition-all duration-300'
                    style={{ height: `${Math.max((val / max) * maxHeight, 1)}px` }}
                    title={`${val} events`}
                />
            ))}
        </div>
    );
}

// ─── Container Health Cards ───

function HealthGrid({
    lastHeartbeat,
    agentActivity,
    recentSessions,
}: {
    lastHeartbeat: SystemData['lastHeartbeat'];
    agentActivity: AgentActivityRow[];
    recentSessions: SessionRow[];
}) {
    const nowRef = useRef(0);
    useEffect(() => { nowRef.current = Date.now(); });
    // eslint-disable-next-line react-hooks/purity -- Date.now() needed for time-relative display
    if (nowRef.current === 0) nowRef.current = Date.now();
    const now = nowRef.current;

    const heartbeatAge = lastHeartbeat
        ? (now - new Date(lastHeartbeat.created_at).getTime()) / 1000
        : Infinity;
    const heartbeatStatus: 'healthy' | 'warning' | 'error' | 'unknown' =
        heartbeatAge < 120 ? 'healthy' :
        heartbeatAge < 600 ? 'warning' :
        lastHeartbeat ? 'error' : 'unknown';

    const runningSessions = recentSessions.filter(s => s.status === 'running').length;
    const completedRecently = recentSessions.filter(s =>
        s.status === 'completed' && s.completed_at &&
        now - new Date(s.completed_at).getTime() < 3600_000
    ).length;
    const failedRecently = recentSessions.filter(s =>
        s.status === 'failed' &&
        now - new Date(s.created_at).getTime() < 3600_000
    ).length;

    const totalEventsLastHour = agentActivity.reduce((sum, a) => sum + a.events_last_hour, 0);

    const cards = [
        {
            label: 'Heartbeat',
            value: lastHeartbeat ? timeAgo(lastHeartbeat.created_at) : 'Never',
            status: heartbeatStatus,
            detail: heartbeatStatus === 'healthy' ? 'System running' : heartbeatStatus === 'warning' ? 'Stale heartbeat' : 'No heartbeat detected',
        },
        {
            label: 'Workers',
            value: runningSessions > 0 ? `${runningSessions} active` : 'Idle',
            status: (runningSessions > 0 ? 'healthy' : totalEventsLastHour > 0 ? 'healthy' : 'warning') as 'healthy' | 'warning',
            detail: `${completedRecently} completed, ${failedRecently} failed (1h)`,
        },
        {
            label: 'Event Rate',
            value: `${totalEventsLastHour}/hr`,
            status: (totalEventsLastHour > 0 ? 'healthy' : 'warning') as 'healthy' | 'warning',
            detail: `${agentActivity.length} agents active`,
        },
        {
            label: 'Agents Online',
            value: `${agentActivity.filter(a => a.events_last_hour > 0).length}/6`,
            status: (agentActivity.filter(a => a.events_last_hour > 0).length >= 3 ? 'healthy' : 'warning') as 'healthy' | 'warning',
            detail: agentActivity
                .filter(a => a.events_last_hour > 0)
                .map(a => a.agent_id)
                .join(', ') || 'None active',
        },
    ];

    return (
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-2'>
            {cards.map(card => (
                <div key={card.label} className='rounded-lg border border-zinc-800 bg-zinc-900/80 p-3'>
                    <div className='flex items-center gap-2 mb-1'>
                        <StatusPulse status={card.status} />
                        <span className='text-[10px] uppercase tracking-wider text-zinc-500'>
                            {card.label}
                        </span>
                    </div>
                    <div className='text-sm font-semibold text-zinc-100 tabular-nums'>
                        {card.value}
                    </div>
                    <div className='text-[10px] text-zinc-600 mt-0.5'>
                        {card.detail}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Activity Timeline ───

function ActivityTimeline({ data }: { data: TimelinePoint[] }) {
    const maxCount = Math.max(...data.map(d => d.count), 1);

    return (
        <div className='rounded-lg border border-zinc-800 bg-zinc-900/80 p-4'>
            <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-3'>
                Event Volume (24h)
            </div>
            <div className='flex items-end gap-1 h-16'>
                {data.map((point, i) => {
                    const height = Math.max((point.count / maxCount) * 56, 2);
                    const hour = new Date(point.hour).getHours();
                    const isNow = i === data.length - 1;
                    return (
                        <div key={i} className='flex flex-col items-center flex-1 min-w-0'>
                            <div
                                className={`w-full max-w-3 rounded-t transition-all ${isNow ? 'bg-accent-green' : 'bg-accent-green/50'}`}
                                style={{ height: `${height}px` }}
                                title={`${point.count} events, ${point.agents_active} agents at ${hour}:00`}
                            />
                            {(hour % 4 === 0 || isNow) && (
                                <span className='text-[8px] text-zinc-600 mt-1 tabular-nums'>
                                    {hour}h
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            {data.length === 0 && (
                <div className='text-[11px] text-zinc-600 text-center py-4'>
                    No activity data yet
                </div>
            )}
        </div>
    );
}

// ─── Agent Activity Table ───

function AgentActivityTable({
    activity,
    memoryStats,
}: {
    activity: AgentActivityRow[];
    memoryStats: MemoryStat[];
}) {
    const nowRef = useRef(0);
    useEffect(() => { nowRef.current = Date.now(); });
    // eslint-disable-next-line react-hooks/purity -- Date.now() needed for time-relative display
    if (nowRef.current === 0) nowRef.current = Date.now();
    const memoryMap = Object.fromEntries(memoryStats.map(m => [m.agent_id, m]));

    return (
        <div className='rounded-lg border border-zinc-800 bg-zinc-900/80 overflow-hidden'>
            <div className='px-4 py-3 border-b border-zinc-800'>
                <span className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Agent Activity
                </span>
            </div>
            <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                    <thead>
                        <tr className='border-b border-zinc-800/50'>
                            <th className='text-left px-4 py-2 text-zinc-500 font-medium'>Agent</th>
                            <th className='text-right px-3 py-2 text-zinc-500 font-medium'>Events</th>
                            <th className='text-right px-3 py-2 text-zinc-500 font-medium'>Last 1h</th>
                            <th className='text-right px-3 py-2 text-zinc-500 font-medium'>Memories</th>
                            <th className='text-left px-3 py-2 text-zinc-500 font-medium'>Last Active</th>
                            <th className='text-left px-3 py-2 text-zinc-500 font-medium'>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activity.map(row => {
                            const agent = AGENTS[row.agent_id as AgentId];
                            const textColor = agent?.tailwindTextColor ?? 'text-zinc-400';
                            const mem = memoryMap[row.agent_id];
                            const isActive = row.events_last_hour > 0;
                            const lastActiveMs = nowRef.current - new Date(row.last_active).getTime();

                            return (
                                <tr key={row.agent_id} className='border-b border-zinc-800/30 hover:bg-zinc-800/30'>
                                    <td className='px-4 py-2'>
                                        <div className='flex items-center gap-2'>
                                            <div className={`w-2 h-2 rounded-full ${agent?.tailwindBgColor ?? 'bg-zinc-500'}`} />
                                            <span className={`font-semibold ${textColor}`}>
                                                {agent?.displayName ?? row.agent_id}
                                            </span>
                                            <span className='text-[10px] text-zinc-600'>
                                                {agent?.role}
                                            </span>
                                        </div>
                                    </td>
                                    <td className='text-right px-3 py-2 tabular-nums text-zinc-300'>
                                        {row.total_events}
                                    </td>
                                    <td className='text-right px-3 py-2 tabular-nums'>
                                        <span className={isActive ? 'text-accent-green' : 'text-zinc-600'}>
                                            {row.events_last_hour}
                                        </span>
                                    </td>
                                    <td className='text-right px-3 py-2 tabular-nums text-zinc-300'>
                                        {mem ? `${mem.active}/${mem.total}` : '0'}
                                    </td>
                                    <td className='px-3 py-2 text-zinc-500 tabular-nums'>
                                        {timeAgo(row.last_active)}
                                    </td>
                                    <td className='px-3 py-2'>
                                        <div className='flex items-center gap-1.5'>
                                            <StatusPulse status={
                                                isActive ? 'healthy' :
                                                lastActiveMs < 3600_000 ? 'warning' : 'error'
                                            } />
                                            <span className='text-[10px] text-zinc-500'>
                                                {isActive ? 'Active' : lastActiveMs < 3600_000 ? 'Idle' : 'Offline'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {activity.length === 0 && (
                            <tr>
                                <td colSpan={6} className='px-4 py-6 text-center text-zinc-600'>
                                    No agent activity recorded yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Session History ───

function SessionHistory({ sessions }: { sessions: SessionRow[] }) {
    const statusColors: Record<string, string> = {
        pending: 'text-accent-yellow bg-accent-yellow/10',
        running: 'text-accent-blue bg-accent-blue/10',
        completed: 'text-accent-green bg-accent-green/10',
        failed: 'text-accent-red bg-accent-red/10',
    };

    return (
        <div className='rounded-lg border border-zinc-800 bg-zinc-900/80 overflow-hidden'>
            <div className='px-4 py-3 border-b border-zinc-800'>
                <span className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Conversation History
                </span>
            </div>
            <div className='max-h-72 overflow-y-auto'>
                {sessions.map(session => {
                    const duration = session.started_at && session.completed_at
                        ? Math.round((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000)
                        : null;
                    return (
                        <div key={session.id} className='px-4 py-2.5 border-b border-zinc-800/30 hover:bg-zinc-800/20'>
                            <div className='flex items-start justify-between gap-2'>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-center gap-2'>
                                        <span className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${statusColors[session.status] ?? 'text-zinc-400 bg-zinc-800'}`}>
                                            {session.status}
                                        </span>
                                        <span className='text-[10px] text-zinc-500 font-mono uppercase'>
                                            {session.format}
                                        </span>
                                    </div>
                                    <p className='text-xs text-zinc-300 mt-1 truncate'>
                                        {session.topic}
                                    </p>
                                    <div className='flex items-center gap-2 mt-1'>
                                        <span className='text-[10px] text-zinc-600 tabular-nums'>
                                            {session.turn_count} turns
                                        </span>
                                        {duration !== null && (
                                            <>
                                                <span className='text-[10px] text-zinc-700'>&middot;</span>
                                                <span className='text-[10px] text-zinc-600 tabular-nums'>
                                                    {duration}s
                                                </span>
                                            </>
                                        )}
                                        <span className='text-[10px] text-zinc-700'>&middot;</span>
                                        <div className='flex gap-1'>
                                            {session.participants.map(p => {
                                                const a = AGENTS[p as AgentId];
                                                return (
                                                    <span
                                                        key={p}
                                                        className={`text-[9px] font-semibold ${a?.tailwindTextColor ?? 'text-zinc-500'}`}
                                                    >
                                                        {p}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <span className='text-[10px] text-zinc-600 tabular-nums shrink-0'>
                                    {timeAgo(session.created_at)}
                                </span>
                            </div>
                        </div>
                    );
                })}
                {sessions.length === 0 && (
                    <div className='px-4 py-6 text-center text-zinc-600 text-xs'>
                        No conversations yet
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Error Log ───

function ErrorLog({ errors }: { errors: SystemEvent[] }) {
    return (
        <div className='rounded-lg border border-accent-red/30 bg-zinc-900/80 overflow-hidden'>
            <div className='px-4 py-3 border-b border-accent-red/20 flex items-center gap-2'>
                <span className='text-[10px] uppercase tracking-wider text-accent-red/70'>
                    Error Log
                </span>
                <span className='text-[10px] text-zinc-600 tabular-nums'>
                    {errors.length} entries
                </span>
            </div>
            <div className='max-h-56 overflow-y-auto'>
                {errors.map(err => {
                    const agent = AGENTS[err.agent_id as AgentId];
                    return (
                        <div key={err.id} className='px-4 py-2 border-b border-zinc-800/20 hover:bg-accent-red/5'>
                            <div className='flex items-center gap-2'>
                                <span className='text-[10px] text-zinc-600 tabular-nums font-mono'>
                                    {formatTime(err.created_at)}
                                </span>
                                <span className={`text-[10px] font-semibold ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}>
                                    {err.agent_id}
                                </span>
                                <span className='text-[10px] text-accent-red/70 font-mono'>
                                    {err.kind}
                                </span>
                            </div>
                            <p className='text-[11px] text-zinc-400 mt-0.5'>
                                {err.title}
                            </p>
                            {typeof err.metadata?.error === 'string' && (
                                <p className='text-[10px] text-accent-red/50 mt-0.5 font-mono truncate'>
                                    {err.metadata.error}
                                </p>
                            )}
                        </div>
                    );
                })}
                {errors.length === 0 && (
                    <div className='px-4 py-6 text-center text-zinc-600 text-xs'>
                        No errors recorded
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Live Event Stream ───

function LiveStream({ events }: { events: SystemEvent[] }) {
    const kindColors: Record<string, string> = {
        conversation_turn: 'text-accent-blue',
        conversation_started: 'text-accent-sky',
        conversation_completed: 'text-accent-green',
        conversation_failed: 'text-accent-red',
        trigger_fired: 'text-accent-yellow',
        proposal_auto_approved: 'text-accent',
        heartbeat: 'text-zinc-600',
    };

    return (
        <div className='rounded-lg border border-zinc-800 bg-zinc-900/80 overflow-hidden'>
            <div className='px-4 py-3 border-b border-zinc-800 flex items-center gap-2'>
                <span className='relative flex h-2 w-2'>
                    <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75' />
                    <span className='relative inline-flex rounded-full h-2 w-2 bg-accent-green' />
                </span>
                <span className='text-[10px] uppercase tracking-wider text-zinc-500'>
                    Live Stream
                </span>
                <span className='text-[10px] text-zinc-600 tabular-nums'>
                    {events.length} recent
                </span>
            </div>
            <div className='h-80 overflow-y-auto font-mono text-[11px] leading-relaxed'>
                {events.map(event => {
                    const agent = AGENTS[event.agent_id as AgentId];
                    const kindColor = kindColors[event.kind] ?? 'text-zinc-500';
                    return (
                        <div key={event.id} className='px-4 py-1 hover:bg-zinc-800/30 border-b border-zinc-800/10'>
                            <span className='text-zinc-600 tabular-nums'>
                                {formatTime(event.created_at)}
                            </span>
                            {' '}
                            <span className={agent?.tailwindTextColor ?? 'text-zinc-400'}>
                                [{event.agent_id.padEnd(7)}]
                            </span>
                            {' '}
                            <span className={kindColor}>
                                {event.kind}
                            </span>
                            {' '}
                            <span className='text-zinc-400'>
                                {event.title}
                            </span>
                        </div>
                    );
                })}
                {events.length === 0 && (
                    <div className='px-4 py-8 text-center text-zinc-600'>
                        Waiting for events...
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Session Stats Summary ───

function SessionStatsSummary({ stats }: { stats: SessionStat[] }) {
    const byStatus = stats.reduce<Record<string, number>>((acc, s) => {
        acc[s.status] = (acc[s.status] ?? 0) + s.count;
        return acc;
    }, {});

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const successRate = total > 0
        ? Math.round(((byStatus.completed ?? 0) / total) * 100)
        : 0;

    return (
        <div className='rounded-lg border border-zinc-800 bg-zinc-900/80 p-4'>
            <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-3'>
                Conversation Performance
            </div>
            <div className='grid grid-cols-4 gap-3'>
                <div>
                    <div className='text-lg font-bold text-zinc-100 tabular-nums'>{total}</div>
                    <div className='text-[10px] text-zinc-500'>Total</div>
                </div>
                <div>
                    <div className='text-lg font-bold text-accent-green tabular-nums'>{byStatus.completed ?? 0}</div>
                    <div className='text-[10px] text-zinc-500'>Completed</div>
                </div>
                <div>
                    <div className='text-lg font-bold text-accent-red tabular-nums'>{byStatus.failed ?? 0}</div>
                    <div className='text-[10px] text-zinc-500'>Failed</div>
                </div>
                <div>
                    <div className='text-lg font-bold tabular-nums' style={{ color: successRate >= 50 ? '#a6e3a1' : '#f38ba8' }}>
                        {successRate}%
                    </div>
                    <div className='text-[10px] text-zinc-500'>Success</div>
                </div>
            </div>
            {/* Success rate bar */}
            <div className='mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden'>
                <div
                    className='h-full rounded-full bg-linear-to-r from-accent-green to-accent-green transition-all duration-500'
                    style={{ width: `${successRate}%` }}
                />
            </div>
        </div>
    );
}

// ─── Main Component ───

export function SystemLogs() {
    const [data, setData] = useState<SystemData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [, setTick] = useState(0);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/ops/system');
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Poll every 5 seconds
    useInterval(() => { fetchData(); }, 5000);

    // Re-render for relative timestamps
    useInterval(() => setTick(t => t + 1), 10_000);

    if (loading) {
        return (
            <div className='space-y-3 animate-pulse'>
                <div className='grid grid-cols-4 gap-2'>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className='h-20 rounded-lg bg-zinc-800/40' />
                    ))}
                </div>
                <div className='h-24 rounded-lg bg-zinc-800/40' />
                <div className='grid grid-cols-2 gap-3'>
                    <div className='h-64 rounded-lg bg-zinc-800/40' />
                    <div className='h-64 rounded-lg bg-zinc-800/40' />
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className='rounded-xl border border-accent-red/50 bg-accent-red/10 p-4'>
                <p className='text-sm text-accent-red'>
                    Failed to load system data: {error ?? 'Unknown error'}
                </p>
            </div>
        );
    }

    return (
        <div className='space-y-3'>
            {/* Health Grid */}
            <HealthGrid
                lastHeartbeat={data.lastHeartbeat}
                agentActivity={data.agentActivity}
                recentSessions={data.recentSessions}
            />

            {/* Timeline + Stats row */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                <ActivityTimeline data={data.eventTimeline} />
                <SessionStatsSummary stats={data.sessionStats} />
            </div>

            {/* Agent Activity Table */}
            <AgentActivityTable
                activity={data.agentActivity}
                memoryStats={data.memoryStats}
            />

            {/* Live Stream + Error Log side by side */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                <LiveStream events={data.recentEvents} />
                <ErrorLog errors={data.errorLog} />
            </div>

            {/* Session History */}
            <SessionHistory sessions={data.recentSessions} />
        </div>
    );
}
