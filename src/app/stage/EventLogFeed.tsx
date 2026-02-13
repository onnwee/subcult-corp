// EventLogFeed — detailed chronological event log with expandable metadata
// Displayed under the OfficeRoom in the office view
'use client';
'use no memo';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
    useEventStream,
    useConversations,
    useInterval,
    type ConnectionStatus,
} from './hooks';
import { AGENTS } from '@/lib/agents';
import { TranscriptViewer } from './TranscriptViewer';
import type { AgentEvent, AgentId, RoundtableSession } from '@/lib/types';

// ─── Constants ───

const KIND_ICONS: Record<string, string> = {
    conversation_turn: '💬',
    conversation_started: '🎙️',
    conversation_completed: '✅',
    conversation_failed: '❌',
    proposal_created: '📝',
    proposal_approved: '✅',
    proposal_rejected: '🚫',
    mission_started: '🚀',
    mission_completed: '🏆',
    step_completed: '⚙️',
    step_failed: '💥',
    trigger_fired: '⚡',
    initiative_queued: '🧠',
    memory_stored: '🧬',
    heartbeat: '💓',
    // Agent session event kinds
    agent_session_completed: '🟢',
    agent_session_failed: '🔴',
    skill_execution: '🔧',
    action_run: '▶️',
    cron_run: '⏱️',
    model_fallback: '⚠️',
    alert_sent: '🔔',
    agent_session: '🟢',
    health_check: '🩺',
    health_score: '📊',
    default: '📡',
};

const KIND_LABELS: Record<string, string> = {
    conversation_turn: 'Conversation Turn',
    conversation_started: 'Conversation Started',
    conversation_completed: 'Conversation Completed',
    conversation_failed: 'Conversation Failed',
    proposal_created: 'Proposal Created',
    proposal_approved: 'Proposal Approved',
    proposal_rejected: 'Proposal Rejected',
    mission_started: 'Mission Started',
    mission_completed: 'Mission Completed',
    step_completed: 'Step Completed',
    step_failed: 'Step Failed',
    trigger_fired: 'Trigger Fired',
    initiative_queued: 'Initiative Queued',
    memory_stored: 'Memory Stored',
    heartbeat: 'Heartbeat',
    // Agent session event kinds
    agent_session_completed: 'Session Completed',
    agent_session_failed: 'Session Failed',
    skill_execution: 'Skill Execution',
    action_run: 'Action Run',
    cron_run: 'Cron Run',
    model_fallback: 'Model Fallback',
    alert_sent: 'Alert Sent',
    agent_session: 'Agent Session',
    health_check: 'Health Check',
    health_score: 'Health Score',
};

// ─── Helpers ───

function formatTimestamp(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

function getKindSeverity(
    kind: string,
): 'info' | 'success' | 'warning' | 'error' {
    if (kind.includes('failed') || kind.includes('rejected')) return 'error';
    if (kind === 'model_fallback' || kind === 'alert_sent') return 'warning';
    if (kind === 'health_score') return 'info';
    if (kind.includes('completed') || kind.includes('approved'))
        return 'success';
    if (kind.includes('fired') || kind.includes('started')) return 'warning';
    return 'info';
}

const SEVERITY_COLORS = {
    info: 'border-zinc-700/50 bg-zinc-800/30',
    success: 'border-accent-green/40 bg-accent-green/10',
    warning: 'border-accent-yellow/40 bg-accent-yellow/10',
    error: 'border-accent-red/40 bg-accent-red/10',
};

const SEVERITY_DOT = {
    info: 'bg-zinc-500',
    success: 'bg-accent-green',
    warning: 'bg-accent-yellow',
    error: 'bg-accent-red',
};

// ─── Metadata Viewer ───

function MetadataViewer({ data }: { data: Record<string, unknown> }) {
    if (Object.keys(data).length === 0) return null;

    return (
        <div className='rounded-md bg-zinc-900/80 border border-zinc-700/30 px-3 py-2 select-text cursor-text'>
            <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1'>
                Metadata
            </div>
            <pre className='text-[11px] text-zinc-400 font-mono whitespace-pre-wrap wrap-break-word leading-relaxed'>
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    );
}

// ─── Single Event Row ───

function DetailedEventRow({
    event,
    isExpanded,
    onToggle,
    sessionAction,
}: {
    event: AgentEvent;
    isExpanded: boolean;
    onToggle: () => void;
    sessionAction?: { label: string; onClick: () => void };
}) {
    const agentId = event.agent_id as AgentId;
    const agent = AGENTS[agentId];
    const textColor = agent?.tailwindTextColor ?? 'text-zinc-400';
    const icon = KIND_ICONS[event.kind] ?? KIND_ICONS.default;
    const severity = getKindSeverity(event.kind);
    const kindLabel = KIND_LABELS[event.kind] ?? event.kind;
    const hasMetadata =
        event.metadata && Object.keys(event.metadata).length > 0;

    return (
        <div
            className={`rounded-lg border transition-all ${SEVERITY_COLORS[severity]}`}
        >
            {/* Clickable header — toggles expand/collapse */}
            <div
                className='flex items-start gap-3 p-3 cursor-pointer hover:bg-zinc-800/40'
                onClick={onToggle}
            >
                {/* Timestamp column */}
                <div className='shrink-0 w-13 text-right'>
                    <div className='text-[11px] text-zinc-400 font-mono tabular-nums'>
                        {formatTimestamp(event.created_at)}
                    </div>
                    <div className='text-[9px] text-zinc-600 font-mono'>
                        {formatDate(event.created_at)}
                    </div>
                </div>

                {/* Severity dot */}
                <div className='pt-1.5 shrink-0'>
                    <div
                        className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`}
                    />
                </div>

                {/* Icon + Agent badge */}
                <div className='flex flex-col items-center gap-0.5 shrink-0 w-10'>
                    <span className='text-sm leading-none'>{icon}</span>
                    <span
                        className={`text-[9px] font-semibold ${textColor} uppercase tracking-wide`}
                    >
                        {event.agent_id}
                    </span>
                </div>

                {/* Content */}
                <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2'>
                        <span className='text-[10px] rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-500 font-mono'>
                            {kindLabel}
                        </span>
                        <span className='text-[10px] text-zinc-600'>
                            {formatRelativeTime(event.created_at)}
                        </span>
                    </div>
                    <p className='text-sm text-zinc-200 leading-snug mt-1'>
                        {event.title}
                    </p>
                    {event.summary && (
                        <p className='text-xs text-zinc-500 mt-0.5 leading-relaxed'>
                            {event.summary}
                        </p>
                    )}
                    {event.tags?.length > 0 && (
                        <div className='flex gap-1 mt-1.5 flex-wrap'>
                            {event.tags.map(tag => (
                                <span
                                    key={tag}
                                    className='rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-500 font-mono'
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                    {sessionAction && (
                        <button
                            onClick={e => {
                                e.stopPropagation();
                                sessionAction.onClick();
                            }}
                            className='mt-1.5 text-[10px] font-mono text-accent hover:text-accent/80 transition-colors'
                        >
                            {sessionAction.label}
                        </button>
                    )}
                </div>

                {/* Expand chevron */}
                {hasMetadata && (
                    <div className='shrink-0 pt-0.5'>
                        <svg
                            className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                d='M19 9l-7 7-7-7'
                            />
                        </svg>
                    </div>
                )}
            </div>

            {/* Expanded metadata — isolated from toggle, allows text selection & copy */}
            {isExpanded && hasMetadata && (
                <div className='px-3 pb-3'>
                    <MetadataViewer data={event.metadata} />
                </div>
            )}
        </div>
    );
}

// ─── Conversation Session Card ───

function SessionCard({
    session,
    isSelected,
    onSelect,
}: {
    session: RoundtableSession;
    isSelected: boolean;
    onSelect: () => void;
}) {
    const statusColors = {
        pending:
            'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/30',
        running: 'text-accent-blue bg-accent-blue/10 border-accent-blue/30',
        completed:
            'text-accent-green bg-accent-green/10 border-accent-green/30',
        failed: 'text-accent-red bg-accent-red/10 border-accent-red/30',
    };

    const statusIcons = {
        pending: '\u23F3',
        running: '\uD83D\uDD04',
        completed: '\u2705',
        failed: '\u274C',
    };

    return (
        <div
            onClick={onSelect}
            className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                isSelected ?
                    'border-zinc-600 bg-zinc-800/60 ring-1 ring-zinc-600/50'
                :   'border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-600/50'
            }`}
        >
            <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                        <span className='text-sm'>
                            {statusIcons[session.status]}
                        </span>
                        <span className='text-xs font-medium text-zinc-200 truncate'>
                            {session.topic}
                        </span>
                    </div>
                    <div className='flex items-center gap-2 mt-1.5'>
                        <span className='text-[10px] text-zinc-500 font-mono uppercase'>
                            {session.format}
                        </span>
                        <span className='text-[10px] text-zinc-600'>
                            &middot;
                        </span>
                        <span className='text-[10px] text-zinc-500'>
                            {session.turn_count} turns
                        </span>
                        <span className='text-[10px] text-zinc-600'>
                            &middot;
                        </span>
                        <div className='flex gap-1'>
                            {session.participants.map(p => {
                                const agent = AGENTS[p as AgentId];
                                return (
                                    <span
                                        key={p}
                                        className={`text-[9px] font-semibold ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}
                                    >
                                        {p}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className='shrink-0 text-right'>
                    <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColors[session.status]}`}
                    >
                        {session.status}
                    </span>
                    <div className='text-[9px] text-zinc-600 mt-1 font-mono'>
                        {formatRelativeTime(session.created_at)}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Filter Bar ───

type FeedTab = 'all' | 'conversations' | 'missions' | 'system' | 'sessions';

const TAB_FILTERS: Record<FeedTab, string[] | null> = {
    all: null,
    conversations: [
        'conversation_turn',
        'conversation_started',
        'conversation_completed',
        'conversation_failed',
    ],
    missions: [
        'mission_started',
        'mission_completed',
        'mission_failed',
        'mission_succeeded',
        'step_completed',
        'step_failed',
        'proposal_created',
        'proposal_approved',
        'proposal_auto_approved',
        'proposal_rejected',
        'trigger_fired',
    ],
    system: [
        'trigger_fired',
        'initiative_queued',
        'memory_stored',
        'memory_consolidated',
        'heartbeat',
        'health_check',
    ],
    sessions: [
        'agent_session_completed',
        'agent_session_failed',
        'cron_run',
        'model_fallback',
        'alert_sent',
        'agent_session',
        'health_check',
        'health_score',
        'action_run',
    ],
};

function FeedTabs({
    active,
    onChange,
}: {
    active: FeedTab;
    onChange: (tab: FeedTab) => void;
}) {
    const tabs: { key: FeedTab; label: string; icon: string }[] = [
        { key: 'all', label: 'All', icon: '📋' },
        { key: 'conversations', label: 'Conversations', icon: '💬' },
        { key: 'missions', label: 'Missions', icon: '🎯' },
        { key: 'system', label: 'System', icon: '⚙️' },
        { key: 'sessions', label: 'Sessions', icon: '🤖' },
    ];

    return (
        <div className='flex gap-1 rounded-lg bg-zinc-800/50 p-1 border border-zinc-700/50'>
            {tabs.map(t => (
                <button
                    key={t.key}
                    onClick={() => onChange(t.key)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        active === t.key ?
                            'bg-zinc-700 text-zinc-100'
                        :   'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                    <span className='text-xs'>{t.icon}</span>
                    <span>{t.label}</span>
                </button>
            ))}
        </div>
    );
}

// ─── Live Indicator ───

function LiveDot() {
    return (
        <span className='relative flex h-2 w-2'>
            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75' />
            <span className='relative inline-flex rounded-full h-2 w-2 bg-accent-green' />
        </span>
    );
}

// ─── Main Component ───

// Kinds that reference a session and can show transcripts
const CONVERSATION_EVENT_KINDS = new Set([
    'conversation_started',
    'conversation_completed',
    'conversation_failed',
]);

export function EventLogFeed({
    onConnectionStatusAction,
}: { onConnectionStatusAction?: (status: ConnectionStatus) => void } = {}) {
    const [activeTab, setActiveTab] = useState<FeedTab>('all');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [showSessions, setShowSessions] = useState(true);
    const [selectedSession, setSelectedSession] =
        useState<RoundtableSession | null>(null);
    const [transcriptEventId, setTranscriptEventId] = useState<string | null>(
        null,
    );

    const { events, loading, error, connectionStatus } = useEventStream({
        limit: 500,
    });

    // Propagate connection status to parent
    useEffect(() => {
        onConnectionStatusAction?.(connectionStatus);
    }, [connectionStatus, onConnectionStatusAction]);
    const { sessions, loading: sessionsLoading } = useConversations(10);

    // Build session lookup by ID for inline transcripts
    const sessionMap = useMemo(() => {
        const map = new Map<string, RoundtableSession>();
        for (const s of sessions) map.set(s.id, s);
        return map;
    }, [sessions]);

    // Force re-render for relative timestamps
    const [, setTick] = useState(0);
    useInterval(() => setTick(t => t + 1), 10_000);

    const filteredEvents = useMemo(() => {
        const allowedKinds = TAB_FILTERS[activeTab];
        if (!allowedKinds) return events;
        return events.filter(e => allowedKinds.includes(e.kind));
    }, [events, activeTab]);

    const toggleExpanded = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    if (loading) {
        return (
            <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 p-4'>
                <div className='space-y-3'>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className='h-16 rounded-lg bg-zinc-800/40 animate-pulse'
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className='rounded-xl border border-accent-red/50 bg-accent-red/10 p-4'>
                <p className='text-sm text-accent-red'>
                    Failed to load event log: {error}
                </p>
            </div>
        );
    }

    return (
        <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
            {/* Header */}
            <div className='flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800'>
                <div className='flex items-center gap-2'>
                    <span className='text-xs font-medium text-zinc-400'>
                        📊 Event Log
                    </span>
                    <LiveDot />
                    <span className='text-[10px] text-zinc-600 tabular-nums'>
                        {filteredEvents.length} events
                    </span>
                </div>
                <div className='flex items-center gap-2'>
                    <FeedTabs active={activeTab} onChange={setActiveTab} />
                    <button
                        onClick={() => setShowSessions(s => !s)}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors border ${
                            showSessions ?
                                'border-zinc-600 bg-zinc-700 text-zinc-200'
                            :   'border-zinc-700/50 text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        🎙️ Sessions
                    </button>
                </div>
            </div>

            {/* Recent Sessions (collapsible) */}
            {showSessions && (
                <div className='px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/30'>
                    <div className='flex items-center justify-between mb-2'>
                        <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                            Recent Roundtables
                        </div>
                        {selectedSession && (
                            <span className='text-[10px] text-zinc-600'>
                                Click a session to read transcript
                            </span>
                        )}
                    </div>
                    {sessionsLoading ?
                        <div className='h-12 rounded-lg bg-zinc-800/40 animate-pulse' />
                    : sessions.length === 0 ?
                        <p className='text-[11px] text-zinc-600'>
                            No roundtable sessions yet
                        </p>
                    :   <div className='space-y-2'>
                            {sessions.map(s => (
                                <div key={s.id}>
                                    <SessionCard
                                        session={s}
                                        isSelected={
                                            selectedSession?.id === s.id
                                        }
                                        onSelect={() =>
                                            setSelectedSession(prev =>
                                                prev?.id === s.id ? null : s,
                                            )
                                        }
                                    />
                                    {selectedSession?.id === s.id && (
                                        <div className='mt-2'>
                                            <TranscriptViewer
                                                session={selectedSession}
                                                onClose={() =>
                                                    setSelectedSession(null)
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    }
                </div>
            )}

            {/* Event list */}
            {filteredEvents.length === 0 ?
                <div className='p-8 text-center text-sm text-zinc-500'>
                    No events matching this filter. The system will populate
                    this feed as agents operate.
                </div>
            :   <div className='h-125 overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'>
                    <div className='space-y-1.5 px-3 py-2'>
                        {filteredEvents.map(event => {
                            const sessionId =
                                CONVERSATION_EVENT_KINDS.has(event.kind) ?
                                    (event.metadata?.sessionId as
                                        | string
                                        | undefined)
                                :   undefined;
                            const matchedSession =
                                sessionId ?
                                    sessionMap.get(sessionId)
                                :   undefined;
                            const showingTranscript =
                                transcriptEventId === event.id &&
                                matchedSession;

                            return (
                                <div key={event.id}>
                                    <DetailedEventRow
                                        event={event}
                                        isExpanded={expandedIds.has(event.id)}
                                        onToggle={() =>
                                            toggleExpanded(event.id)
                                        }
                                        sessionAction={
                                            matchedSession ?
                                                {
                                                    label:
                                                        showingTranscript ?
                                                            'Hide Transcript'
                                                        :   'View Transcript',
                                                    onClick: () =>
                                                        setTranscriptEventId(
                                                            prev =>
                                                                (
                                                                    prev ===
                                                                    event.id
                                                                ) ?
                                                                    null
                                                                :   event.id,
                                                        ),
                                                }
                                            :   undefined
                                        }
                                    />
                                    {showingTranscript && (
                                        <div className='mt-1.5 ml-4'>
                                            <TranscriptViewer
                                                session={matchedSession}
                                                onClose={() =>
                                                    setTranscriptEventId(null)
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            }
        </div>
    );
}
