// Stage — main dashboard page composing all components
'use client';

import { useState, Suspense } from 'react';
import { StageHeader, type ViewMode } from './StageHeader';
import { StageFilters, type FilterState } from './StageFilters';
import { SignalFeed } from './SignalFeed';
import { MissionsList } from './MissionsList';
import { MissionPlayback } from './MissionPlayback';
import { OfficeRoom } from './OfficeRoom';
import { StageErrorBoundary, SectionErrorBoundary } from './StageErrorBoundary';
import {
    SignalFeedSkeleton,
    MissionsListSkeleton,
    OfficeRoomSkeleton,
} from './StageSkeletons';

export default function StagePage() {
    const [view, setView] = useState<ViewMode>('feed');
    const [filters, setFilters] = useState<FilterState>({
        agentId: null,
        kind: null,
    });
    const [playbackMissionId, setPlaybackMissionId] = useState<string | null>(
        null,
    );

    return (
        <StageErrorBoundary>
            <div className='min-h-screen bg-zinc-950 text-zinc-100'>
                <div className='mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6'>
                    {/* Header with stats + view toggle */}
                    <StageHeader view={view} onViewChange={setView} />

                    {/* Mission playback overlay */}
                    {playbackMissionId && (
                        <SectionErrorBoundary label='Mission Playback'>
                            <MissionPlayback
                                missionId={playbackMissionId}
                                onClose={() => setPlaybackMissionId(null)}
                            />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Feed View ── */}
                    {view === 'feed' && (
                        <div className='space-y-4'>
                            <StageFilters
                                filters={filters}
                                onChange={setFilters}
                            />
                            <SectionErrorBoundary label='Signal Feed'>
                                <Suspense fallback={<SignalFeedSkeleton />}>
                                    <SignalFeed
                                        agentId={filters.agentId ?? undefined}
                                        kind={filters.kind ?? undefined}
                                    />
                                </Suspense>
                            </SectionErrorBoundary>
                        </div>
                    )}

                    {/* ── Missions View ── */}
                    {view === 'missions' && (
                        <SectionErrorBoundary label='Missions'>
                            <Suspense fallback={<MissionsListSkeleton />}>
                                <MissionsList
                                    onPlayback={id => setPlaybackMissionId(id)}
                                />
                            </Suspense>
                        </SectionErrorBoundary>
                    )}

                    {/* ── Office View ── */}
                    {view === 'office' && (
                        <SectionErrorBoundary label='Office'>
                            <Suspense fallback={<OfficeRoomSkeleton />}>
                                <OfficeRoom />
                            </Suspense>
                        </SectionErrorBoundary>
                    )}

                    {/* Footer */}
                    <footer className='text-center text-[10px] text-zinc-700 py-4'>
                        SUBCULT OPS &middot; multi-agent command center
                    </footer>
                </div>
            </div>
        </StageErrorBoundary>
    );
}
