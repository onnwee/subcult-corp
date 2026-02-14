// GovernancePanel — proposal cards with vote progress and debate links
'use client';

import { useState, useMemo } from 'react';
import {
    useGovernance,
    type GovernanceProposalEntry,
    type GovernanceProposalStatus,
} from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

// ─── Constants ───

const STATUS_TABS: {
    key: GovernanceProposalStatus | 'all';
    label: string;
    icon: string;
}[] = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'voting', label: 'Voting', icon: '🗳️' },
    { key: 'accepted', label: 'Accepted', icon: '✅' },
    { key: 'rejected', label: 'Rejected', icon: '❌' },
    { key: 'proposed', label: 'Proposed', icon: '📝' },
];

const STATUS_COLORS: Record<GovernanceProposalStatus, string> = {
    proposed: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    voting: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    accepted: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
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

function jsonPreview(value: Record<string, unknown> | null): string {
    if (!value) return 'null';
    const text = JSON.stringify(value);
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
}

// ─── VoteBar ───

function VoteBar({
    approvals,
    rejections,
    required,
}: {
    approvals: number;
    rejections: number;
    required: number;
}) {
    const total = Math.max(required, approvals + rejections);

    return (
        <div className='space-y-1'>
            <div className='flex justify-between text-[10px] text-zinc-400'>
                <span>
                    {approvals} approve · {rejections} reject
                </span>
                <span>{required} required</span>
            </div>
            <div className='h-2 rounded-full bg-zinc-700/50 overflow-hidden flex'>
                {approvals > 0 && (
                    <div
                        className='h-full bg-emerald-500 transition-all'
                        style={{ width: `${(approvals / total) * 100}%` }}
                    />
                )}
                {rejections > 0 && (
                    <div
                        className='h-full bg-rose-500 transition-all'
                        style={{ width: `${(rejections / total) * 100}%` }}
                    />
                )}
            </div>
        </div>
    );
}

// ─── ProposalCard ───

function ProposalCard({
    proposal,
    isExpanded,
    onToggle,
}: {
    proposal: GovernanceProposalEntry;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const agent = AGENTS[proposal.proposer as AgentId];
    const statusColor = STATUS_COLORS[proposal.status];
    const votes = proposal.votes ?? {};
    const voterEntries = Object.entries(votes);

    return (
        <div className='rounded-lg bg-zinc-800/60 border border-zinc-700/50 overflow-hidden'>
            {/* Summary row — clickable */}
            <button
                onClick={onToggle}
                className='w-full text-left p-4 hover:bg-zinc-800/80 transition-colors space-y-3'
            >
                {/* Top row: policy key + status badge */}
                <div className='flex items-start justify-between gap-2'>
                    <div className='space-y-1 min-w-0 flex-1'>
                        <p className='text-sm font-mono font-semibold text-zinc-100 truncate'>
                            {proposal.policy_key}
                        </p>
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
                                    {agent?.displayName ?? proposal.proposer}
                                </span>
                            </span>
                            <span className='text-[10px] text-zinc-500'>
                                {timeAgo(proposal.created_at)}
                            </span>
                        </div>
                    </div>
                    <span
                        className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusColor}`}
                    >
                        {proposal.status}
                    </span>
                </div>

                {/* Rationale preview */}
                <p className='text-xs text-zinc-400 line-clamp-2 leading-relaxed'>
                    {proposal.rationale}
                </p>

                {/* Vote progress */}
                <VoteBar
                    approvals={proposal.vote_summary.approvals}
                    rejections={proposal.vote_summary.rejections}
                    required={proposal.vote_summary.required}
                />
            </button>

            {/* Expanded details */}
            {isExpanded && (
                <div className='border-t border-zinc-700/50 p-4 space-y-4 bg-zinc-900/30'>
                    {/* Policy diff */}
                    <div className='space-y-2'>
                        <h4 className='text-[10px] uppercase tracking-wider text-zinc-500'>
                            Proposed Change
                        </h4>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                            <div className='rounded-md bg-zinc-800/80 p-2 space-y-1'>
                                <span className='text-[10px] text-zinc-500'>
                                    Current
                                </span>
                                <p className='text-xs font-mono text-rose-300 break-all'>
                                    {jsonPreview(proposal.current_value)}
                                </p>
                            </div>
                            <div className='rounded-md bg-zinc-800/80 p-2 space-y-1'>
                                <span className='text-[10px] text-zinc-500'>
                                    Proposed
                                </span>
                                <p className='text-xs font-mono text-emerald-300 break-all'>
                                    {jsonPreview(proposal.proposed_value)}
                                </p>
                            </div>
                        </div>
                    </div>

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
                                                {v.reason}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Debate session link */}
                    {proposal.debate_session_id && (
                        <div className='pt-1'>
                            <span className='text-[10px] text-zinc-500'>
                                Debate session:{' '}
                                <span className='font-mono text-accent-sapphire'>
                                    {proposal.debate_session_id.slice(0, 8)}…
                                </span>
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── GovernancePanel ───

export function GovernancePanel() {
    const [activeTab, setActiveTab] = useState<
        GovernanceProposalStatus | 'all'
    >('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const statusFilter = activeTab === 'all' ? undefined : activeTab;
    const { proposals, loading, error } = useGovernance({
        status: statusFilter,
        limit: 100,
    });

    // Sort: voting first, then by date
    const sorted = useMemo(() => {
        return [...proposals].sort((a, b) => {
            // Voting proposals first
            if (a.status === 'voting' && b.status !== 'voting') return -1;
            if (b.status === 'voting' && a.status !== 'voting') return 1;
            // Then by date descending
            return (
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
        });
    }, [proposals]);

    // Stats
    const votingCount = proposals.filter(p => p.status === 'voting').length;
    const acceptedCount = proposals.filter(p => p.status === 'accepted').length;
    const rejectedCount = proposals.filter(p => p.status === 'rejected').length;

    return (
        <section className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div>
                    <h2 className='text-lg font-semibold text-zinc-100'>
                        ⚖️ Governance
                    </h2>
                    <p className='text-xs text-zinc-500 mt-0.5'>
                        Agent-driven policy proposals and voting
                    </p>
                </div>
                <div className='flex gap-3 text-xs text-zinc-400'>
                    <span>
                        <span className='text-amber-400 font-medium'>
                            {votingCount}
                        </span>{' '}
                        active
                    </span>
                    <span>
                        <span className='text-emerald-400 font-medium'>
                            {acceptedCount}
                        </span>{' '}
                        accepted
                    </span>
                    <span>
                        <span className='text-rose-400 font-medium'>
                            {rejectedCount}
                        </span>{' '}
                        rejected
                    </span>
                </div>
            </div>

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
                        No governance proposals
                        {activeTab !== 'all' ?
                            ` with status "${activeTab}"`
                        :   ''}
                        .
                    </p>
                    <p className='text-xs text-zinc-600 mt-1'>
                        Agents can propose policy changes during conversations.
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
                        />
                    ))}
                </div>
            }
        </section>
    );
}
