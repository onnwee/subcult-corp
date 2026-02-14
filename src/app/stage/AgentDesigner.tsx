// AgentDesigner — agent design proposals with approval controls and spawn workflow
'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    useAgentProposals,
    type AgentProposalEntry,
    type AgentProposalStatus,
} from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

// ─── Constants ───

const STATUS_TABS: {
    key: AgentProposalStatus | 'all';
    label: string;
    icon: string;
}[] = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'voting', label: 'Voting', icon: '🗳️' },
    { key: 'approved', label: 'Approved', icon: '✅' },
    { key: 'spawned', label: 'Spawned', icon: '🧬' },
    { key: 'rejected', label: 'Rejected', icon: '❌' },
    { key: 'proposed', label: 'Proposed', icon: '📝' },
];

const STATUS_COLORS: Record<AgentProposalStatus, string> = {
    proposed: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    voting: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    spawned: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
};

// ─── Helpers ───

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// ─── VoteBar ───

function VoteBar({
    approvals,
    rejections,
    total,
}: {
    approvals: number;
    rejections: number;
    total: number;
}) {
    const max = Math.max(6, total); // 6 agents baseline

    return (
        <div className='space-y-1'>
            <div className='flex justify-between text-[10px] text-zinc-400'>
                <span>
                    {approvals} approve · {rejections} reject
                </span>
                <span>{total} voted</span>
            </div>
            <div className='h-2 rounded-full bg-zinc-700/50 overflow-hidden flex'>
                {approvals > 0 && (
                    <div
                        className='h-full bg-emerald-500 transition-all'
                        style={{ width: `${(approvals / max) * 100}%` }}
                    />
                )}
                {rejections > 0 && (
                    <div
                        className='h-full bg-rose-500 transition-all'
                        style={{ width: `${(rejections / max) * 100}%` }}
                    />
                )}
            </div>
        </div>
    );
}

// ─── SkillPills ───

function SkillPills({ skills }: { skills: string[] }) {
    return (
        <div className='flex flex-wrap gap-1'>
            {skills.map(skill => (
                <span
                    key={skill}
                    className='text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-zinc-600/30'
                >
                    {skill}
                </span>
            ))}
        </div>
    );
}

// ─── ProposalCard ───

function ProposalCard({
    proposal,
    isExpanded,
    onToggle,
    onAction,
    actionLoading,
}: {
    proposal: AgentProposalEntry;
    isExpanded: boolean;
    onToggle: () => void;
    onAction: (action: string, proposalId: string) => void;
    actionLoading: string | null;
}) {
    const agent = AGENTS[proposal.proposed_by as AgentId];
    const statusColor = STATUS_COLORS[proposal.status];
    const votes = proposal.votes ?? {};
    const voterEntries = Object.entries(votes);
    const personality = proposal.personality;

    const isThisLoading = actionLoading === proposal.id;

    return (
        <div className='rounded-lg bg-zinc-800/60 border border-zinc-700/50 overflow-hidden'>
            {/* Summary row — clickable */}
            <button
                onClick={onToggle}
                className='w-full text-left p-4 hover:bg-zinc-800/80 transition-colors space-y-3'
            >
                {/* Top row: agent name + status badge */}
                <div className='flex items-start justify-between gap-2'>
                    <div className='space-y-1 min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                            {personality?.emoji && (
                                <span className='text-lg'>
                                    {personality.emoji}
                                </span>
                            )}
                            <p className='text-sm font-semibold text-zinc-100'>
                                {proposal.agent_name}
                            </p>
                            <span className='text-[11px] text-zinc-400 font-mono'>
                                {proposal.agent_role}
                            </span>
                        </div>
                        <div className='flex items-center gap-2'>
                            <span className='flex items-center gap-1'>
                                <span
                                    className='inline-block h-2 w-2 rounded-full'
                                    style={{
                                        backgroundColor:
                                            agent?.color ?? '#71717a',
                                    }}
                                />
                                <span
                                    className={`text-[11px] font-medium ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}
                                >
                                    proposed by{' '}
                                    {agent?.displayName ?? proposal.proposed_by}
                                </span>
                            </span>
                            <span className='text-[10px] text-zinc-500'>
                                {timeAgo(proposal.created_at)}
                            </span>
                        </div>
                    </div>
                    <div className='flex flex-col items-end gap-1'>
                        <span
                            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusColor}`}
                        >
                            {proposal.status}
                        </span>
                        {proposal.human_approved === true && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>
                                human approved
                            </span>
                        )}
                        {proposal.human_approved === false && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20'>
                                human rejected
                            </span>
                        )}
                    </div>
                </div>

                {/* Rationale preview */}
                <p className='text-xs text-zinc-400 line-clamp-2 leading-relaxed'>
                    {proposal.rationale}
                </p>

                {/* Vote progress */}
                <VoteBar
                    approvals={proposal.vote_summary.approvals}
                    rejections={proposal.vote_summary.rejections}
                    total={proposal.vote_summary.total}
                />
            </button>

            {/* Expanded details */}
            {isExpanded && (
                <div className='border-t border-zinc-700/50 p-4 space-y-4 bg-zinc-900/30'>
                    {/* Personality */}
                    <div className='space-y-2'>
                        <h4 className='text-[10px] uppercase tracking-wider text-zinc-500'>
                            Personality
                        </h4>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                            <div className='rounded-md bg-zinc-800/80 p-2 space-y-1'>
                                <span className='text-[10px] text-zinc-500'>
                                    Tone
                                </span>
                                <p className='text-xs text-zinc-300'>
                                    {personality?.tone ?? 'not specified'}
                                </p>
                            </div>
                            <div className='rounded-md bg-zinc-800/80 p-2 space-y-1'>
                                <span className='text-[10px] text-zinc-500'>
                                    Speaking Style
                                </span>
                                <p className='text-xs text-zinc-300'>
                                    {personality?.speaking_style ??
                                        'not specified'}
                                </p>
                            </div>
                        </div>
                        {personality?.traits &&
                            personality.traits.length > 0 && (
                                <div className='space-y-1'>
                                    <span className='text-[10px] text-zinc-500'>
                                        Traits
                                    </span>
                                    <div className='flex flex-wrap gap-1'>
                                        {personality.traits.map(trait => (
                                            <span
                                                key={trait}
                                                className='text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20'
                                            >
                                                {trait}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                    </div>

                    {/* Skills */}
                    {proposal.skills && proposal.skills.length > 0 && (
                        <div className='space-y-2'>
                            <h4 className='text-[10px] uppercase tracking-wider text-zinc-500'>
                                Skills ({proposal.skills.length})
                            </h4>
                            <SkillPills skills={proposal.skills} />
                        </div>
                    )}

                    {/* Full rationale */}
                    <div className='space-y-1'>
                        <h4 className='text-[10px] uppercase tracking-wider text-zinc-500'>
                            Rationale
                        </h4>
                        <p className='text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap'>
                            {proposal.rationale}
                        </p>
                    </div>

                    {/* Votes */}
                    {voterEntries.length > 0 && (
                        <div className='space-y-2'>
                            <h4 className='text-[10px] uppercase tracking-wider text-zinc-500'>
                                Votes ({voterEntries.length})
                            </h4>
                            <div className='space-y-1.5'>
                                {voterEntries.map(([agentId, v]) => {
                                    const voterAgent =
                                        AGENTS[agentId as AgentId];
                                    const isApprove = v.vote === 'approve';
                                    return (
                                        <div
                                            key={agentId}
                                            className='flex items-start gap-2 text-xs'
                                        >
                                            <span className='flex items-center gap-1 shrink-0 min-w-[80px]'>
                                                <span
                                                    className='inline-block h-1.5 w-1.5 rounded-full'
                                                    style={{
                                                        backgroundColor:
                                                            voterAgent?.color ??
                                                            '#71717a',
                                                    }}
                                                />
                                                <span
                                                    className={
                                                        voterAgent?.tailwindTextColor ??
                                                        'text-zinc-400'
                                                    }
                                                >
                                                    {voterAgent?.displayName ??
                                                        agentId}
                                                </span>
                                            </span>
                                            <span
                                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                    isApprove ?
                                                        'bg-emerald-500/20 text-emerald-300'
                                                    :   'bg-rose-500/20 text-rose-300'
                                                }`}
                                            >
                                                {v.vote}
                                            </span>
                                            <span className='text-zinc-400 leading-relaxed'>
                                                {v.reasoning}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Spawned timestamp */}
                    {proposal.spawned_at && (
                        <div className='pt-1'>
                            <span className='text-[10px] text-zinc-500'>
                                Spawned:{' '}
                                <span className='text-violet-300'>
                                    {new Date(
                                        proposal.spawned_at,
                                    ).toLocaleString()}
                                </span>
                            </span>
                        </div>
                    )}

                    {/* Action buttons */}
                    {proposal.status === 'approved' &&
                        proposal.human_approved === null && (
                            <div className='flex gap-2 pt-2 border-t border-zinc-700/30'>
                                <button
                                    onClick={() =>
                                        onAction('approve', proposal.id)
                                    }
                                    disabled={isThisLoading}
                                    className='flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-50'
                                >
                                    ✓ Approve for Spawning
                                </button>
                                <button
                                    onClick={() =>
                                        onAction('reject', proposal.id)
                                    }
                                    disabled={isThisLoading}
                                    className='flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-colors disabled:opacity-50'
                                >
                                    ✗ Reject
                                </button>
                            </div>
                        )}

                    {proposal.status === 'approved' &&
                        proposal.human_approved === true && (
                            <div className='flex gap-2 pt-2 border-t border-zinc-700/30'>
                                <button
                                    onClick={() =>
                                        onAction('spawn', proposal.id)
                                    }
                                    disabled={isThisLoading}
                                    className='flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors disabled:opacity-50'
                                >
                                    {isThisLoading ?
                                        '⏳ Spawning...'
                                    :   '🧬 Spawn Agent'}
                                </button>
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}

// ─── AgentDesigner ───

export function AgentDesigner() {
    const [activeTab, setActiveTab] = useState<AgentProposalStatus | 'all'>(
        'all',
    );
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    const statusFilter = activeTab === 'all' ? undefined : activeTab;
    const { proposals, loading, error, refetch } = useAgentProposals({
        status: statusFilter,
        limit: 100,
    });

    const handleAction = useCallback(
        async (action: string, proposalId: string) => {
            setActionLoading(proposalId);
            setActionMessage(null);

            try {
                const res = await fetch('/api/ops/agent-proposals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action,
                        proposal_id: proposalId,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    setActionMessage({
                        type: 'error',
                        text: data.error ?? 'Action failed',
                    });
                } else {
                    setActionMessage({
                        type: 'success',
                        text:
                            data.message ??
                            `Action "${action}" completed successfully`,
                    });
                    refetch();
                }
            } catch (err) {
                setActionMessage({
                    type: 'error',
                    text: (err as Error).message,
                });
            } finally {
                setActionLoading(null);
            }
        },
        [refetch],
    );

    // Sort: voting first, then approved, then by date
    const sorted = useMemo(() => {
        const statusPriority: Record<AgentProposalStatus, number> = {
            voting: 0,
            approved: 1,
            proposed: 2,
            spawned: 3,
            rejected: 4,
        };

        return [...proposals].sort((a, b) => {
            const pa = statusPriority[a.status] ?? 5;
            const pb = statusPriority[b.status] ?? 5;
            if (pa !== pb) return pa - pb;
            return (
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
        });
    }, [proposals]);

    // Stats
    const votingCount = proposals.filter(p => p.status === 'voting').length;
    const approvedCount = proposals.filter(p => p.status === 'approved').length;
    const spawnedCount = proposals.filter(p => p.status === 'spawned').length;

    return (
        <section className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div>
                    <h2 className='text-lg font-semibold text-zinc-100'>
                        🧬 Agent Designer
                    </h2>
                    <p className='text-xs text-zinc-500 mt-0.5'>
                        Agent-proposed new members for the collective
                    </p>
                </div>
                <div className='flex gap-3 text-xs text-zinc-400'>
                    <span>
                        <span className='text-amber-400 font-medium'>
                            {votingCount}
                        </span>{' '}
                        voting
                    </span>
                    <span>
                        <span className='text-emerald-400 font-medium'>
                            {approvedCount}
                        </span>{' '}
                        approved
                    </span>
                    <span>
                        <span className='text-violet-400 font-medium'>
                            {spawnedCount}
                        </span>{' '}
                        spawned
                    </span>
                </div>
            </div>

            {/* Action message */}
            {actionMessage && (
                <div
                    className={`rounded-lg p-3 text-xs border ${
                        actionMessage.type === 'success' ?
                            'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        :   'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                >
                    {actionMessage.text}
                    <button
                        onClick={() => setActionMessage(null)}
                        className='ml-2 text-zinc-500 hover:text-zinc-300'
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Filter tabs */}
            <div className='flex gap-1 rounded-lg bg-zinc-800/50 p-1 border border-zinc-700/50 w-fit'>
                {STATUS_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            activeTab === tab.key ?
                                'bg-zinc-700 text-zinc-100'
                            :   'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
                        }`}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading && proposals.length === 0 ?
                <div className='space-y-3'>
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className='rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-4 animate-pulse h-28'
                        />
                    ))}
                </div>
            : error ?
                <div className='rounded-lg bg-rose-500/10 border border-rose-500/30 p-4 text-xs text-rose-300'>
                    Failed to load proposals: {error}
                </div>
            : sorted.length === 0 ?
                <div className='rounded-lg bg-zinc-800/30 border border-zinc-700/30 p-8 text-center'>
                    <p className='text-sm text-zinc-500'>
                        No agent proposals
                        {activeTab !== 'all' ?
                            ` with status "${activeTab}"`
                        :   ''}
                        .
                    </p>
                    <p className='text-xs text-zinc-600 mt-1'>
                        Thaum will propose new agents during monthly design
                        reviews.
                    </p>
                </div>
            :   <div className='space-y-3'>
                    {sorted.map(proposal => (
                        <ProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            isExpanded={expandedId === proposal.id}
                            onToggle={() =>
                                setExpandedId(
                                    expandedId === proposal.id ?
                                        null
                                    :   proposal.id,
                                )
                            }
                            onAction={handleAction}
                            actionLoading={actionLoading}
                        />
                    ))}
                </div>
            }
        </section>
    );
}
