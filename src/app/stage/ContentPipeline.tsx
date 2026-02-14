// ContentPipeline — Kanban board for content drafts
'use client';

import { useState, useMemo } from 'react';
import { useContent, type ContentDraft, type ContentStatus, type ContentType } from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

// ─── Constants ───

const STATUS_COLUMNS: { key: ContentStatus; label: string; icon: string }[] = [
    { key: 'draft', label: 'Draft', icon: '✏️' },
    { key: 'review', label: 'In Review', icon: '🔍' },
    { key: 'approved', label: 'Approved', icon: '✅' },
    { key: 'published', label: 'Published', icon: '📢' },
];

const TYPE_BADGES: Record<ContentType, { label: string; color: string }> = {
    essay: { label: 'Essay', color: 'bg-blue-500/20 text-blue-300' },
    thread: { label: 'Thread', color: 'bg-amber-500/20 text-amber-300' },
    statement: { label: 'Statement', color: 'bg-emerald-500/20 text-emerald-300' },
    poem: { label: 'Poem', color: 'bg-purple-500/20 text-purple-300' },
    manifesto: { label: 'Manifesto', color: 'bg-rose-500/20 text-rose-300' },
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

// ─── DraftCard ───

function DraftCard({
    draft,
    onSelect,
}: {
    draft: ContentDraft;
    onSelect: (d: ContentDraft) => void;
}) {
    const agent = AGENTS[draft.author_agent as AgentId];
    const badge = TYPE_BADGES[draft.content_type] ?? TYPE_BADGES.essay;

    return (
        <button
            onClick={() => onSelect(draft)}
            className='w-full text-left rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-3 hover:border-zinc-600 transition-colors space-y-2'
        >
            {/* Title */}
            <p className='text-sm font-medium text-zinc-100 line-clamp-2 leading-snug'>
                {draft.title || 'Untitled'}
            </p>

            {/* Meta row */}
            <div className='flex items-center gap-2 flex-wrap'>
                {/* Agent dot + name */}
                <span className='flex items-center gap-1'>
                    <span
                        className='inline-block h-2 w-2 rounded-full'
                        style={{ backgroundColor: agent?.color ?? '#71717a' }}
                    />
                    <span className={`text-[11px] font-medium ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}>
                        {agent?.displayName ?? draft.author_agent}
                    </span>
                </span>

                {/* Type badge */}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>
                    {badge.label}
                </span>
            </div>

            {/* Timestamp */}
            <p className='text-[10px] text-zinc-500'>{timeAgo(draft.created_at)}</p>
        </button>
    );
}

// ─── DetailPanel ───

function DetailPanel({
    draft,
    onClose,
}: {
    draft: ContentDraft;
    onClose: () => void;
}) {
    const agent = AGENTS[draft.author_agent as AgentId];
    const badge = TYPE_BADGES[draft.content_type] ?? TYPE_BADGES.essay;

    return (
        <div className='rounded-xl bg-zinc-800/70 border border-zinc-700/50 p-5 space-y-4'>
            {/* Header */}
            <div className='flex items-start justify-between gap-3'>
                <div className='space-y-1 min-w-0'>
                    <h3 className='text-base font-semibold text-zinc-100 leading-snug'>
                        {draft.title || 'Untitled'}
                    </h3>
                    <div className='flex items-center gap-2'>
                        <span className='flex items-center gap-1'>
                            <span
                                className='inline-block h-2 w-2 rounded-full'
                                style={{ backgroundColor: agent?.color ?? '#71717a' }}
                            />
                            <span className={`text-xs font-medium ${agent?.tailwindTextColor ?? 'text-zinc-400'}`}>
                                {agent?.displayName ?? draft.author_agent}
                            </span>
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>
                            {badge.label}
                        </span>
                        <span className='text-[10px] text-zinc-500'>{timeAgo(draft.created_at)}</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className='text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none shrink-0'
                >
                    ✕
                </button>
            </div>

            {/* Body */}
            <div className='rounded-lg bg-zinc-900/50 border border-zinc-700/30 p-4 max-h-80 overflow-y-auto'>
                <pre className='text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed'>
                    {draft.body || '(empty)'}
                </pre>
            </div>

            {/* Reviewer notes */}
            {draft.reviewer_notes && draft.reviewer_notes.length > 0 && (
                <div className='space-y-2'>
                    <h4 className='text-[11px] uppercase tracking-wider text-zinc-500 font-medium'>
                        Review Notes
                    </h4>
                    <div className='space-y-2'>
                        {draft.reviewer_notes.map((note, i) => {
                            const reviewer = AGENTS[note.reviewer as AgentId];
                            return (
                                <div key={i} className='rounded-lg bg-zinc-900/40 border border-zinc-700/30 p-3'>
                                    <div className='flex items-center gap-1.5 mb-1'>
                                        <span
                                            className='inline-block h-1.5 w-1.5 rounded-full'
                                            style={{ backgroundColor: reviewer?.color ?? '#71717a' }}
                                        />
                                        <span className={`text-[11px] font-medium ${reviewer?.tailwindTextColor ?? 'text-zinc-400'}`}>
                                            {reviewer?.displayName ?? note.reviewer}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                            note.verdict === 'approve' ? 'bg-emerald-500/20 text-emerald-300'
                                            : note.verdict === 'reject' ? 'bg-rose-500/20 text-rose-300'
                                            : 'bg-zinc-500/20 text-zinc-300'
                                        }`}>
                                            {note.verdict}
                                        </span>
                                    </div>
                                    <p className='text-xs text-zinc-400 leading-relaxed'>{note.notes}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Review session link */}
            {draft.review_session_id && (
                <p className='text-[10px] text-zinc-600'>
                    Review session: <span className='text-zinc-500 font-mono'>{draft.review_session_id.slice(0, 8)}…</span>
                </p>
            )}

            {/* Published timestamp */}
            {draft.published_at && (
                <p className='text-[10px] text-zinc-500'>
                    Published {timeAgo(draft.published_at)}
                </p>
            )}
        </div>
    );
}

// ─── ContentPipelineSkeleton ───

function ContentPipelineSkeleton() {
    return (
        <div className='grid grid-cols-4 gap-3 animate-pulse'>
            {[...Array(4)].map((_, col) => (
                <div key={col} className='space-y-3'>
                    <div className='h-5 w-20 rounded bg-zinc-700' />
                    {[...Array(2)].map((_, row) => (
                        <div key={row} className='h-24 rounded-lg bg-zinc-800/50' />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── ContentPipeline (main export) ───

export function ContentPipeline() {
    const { drafts, loading, error } = useContent({ limit: 100 });
    const [selected, setSelected] = useState<ContentDraft | null>(null);
    const [showRejected, setShowRejected] = useState(false);

    // Group drafts by status
    const grouped = useMemo(() => {
        const map: Record<ContentStatus, ContentDraft[]> = {
            draft: [],
            review: [],
            approved: [],
            rejected: [],
            published: [],
        };
        for (const d of drafts) {
            (map[d.status] ??= []).push(d);
        }
        return map;
    }, [drafts]);

    if (loading) return <ContentPipelineSkeleton />;

    if (error) {
        return (
            <div className='rounded-lg bg-red-900/20 border border-red-800/30 p-4 text-sm text-red-300'>
                Failed to load content: {error}
            </div>
        );
    }

    return (
        <div className='space-y-4'>
            {/* Detail panel (above board when a card is selected) */}
            {selected && (
                <DetailPanel draft={selected} onClose={() => setSelected(null)} />
            )}

            {/* Kanban columns */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
                {STATUS_COLUMNS.map(col => {
                    const items = grouped[col.key];
                    return (
                        <div key={col.key} className='space-y-2'>
                            {/* Column header */}
                            <div className='flex items-center gap-1.5 px-1'>
                                <span className='text-sm'>{col.icon}</span>
                                <span className='text-[11px] font-semibold text-zinc-300 uppercase tracking-wider'>
                                    {col.label}
                                </span>
                                <span className='text-[10px] text-zinc-600 tabular-nums'>
                                    {items.length}
                                </span>
                            </div>

                            {/* Cards */}
                            <div className='space-y-2 min-h-15'>
                                {items.length === 0 && (
                                    <div className='rounded-lg border border-dashed border-zinc-700/40 p-4 text-center'>
                                        <span className='text-[10px] text-zinc-600'>No items</span>
                                    </div>
                                )}
                                {items.map(d => (
                                    <DraftCard key={d.id} draft={d} onSelect={setSelected} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Rejected section (collapsed by default) */}
            {grouped.rejected.length > 0 && (
                <div className='rounded-lg border border-zinc-700/30 bg-zinc-900/30'>
                    <button
                        onClick={() => setShowRejected(r => !r)}
                        className='w-full flex items-center justify-between px-4 py-2'
                    >
                        <span className='text-[11px] font-semibold text-zinc-500 uppercase tracking-wider'>
                            ❌ Rejected ({grouped.rejected.length})
                        </span>
                        <span className='text-zinc-600 text-xs'>
                            {showRejected ? '▲' : '▼'}
                        </span>
                    </button>
                    {showRejected && (
                        <div className='px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2'>
                            {grouped.rejected.map(d => (
                                <DraftCard key={d.id} draft={d} onSelect={setSelected} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {drafts.length === 0 && (
                <div className='rounded-xl bg-zinc-800/30 border border-zinc-700/30 p-8 text-center space-y-2'>
                    <p className='text-2xl'>📝</p>
                    <p className='text-sm text-zinc-400'>No content drafts yet</p>
                    <p className='text-[11px] text-zinc-600'>
                        Content is extracted automatically from writing_room roundtable sessions
                    </p>
                </div>
            )}
        </div>
    );
}
