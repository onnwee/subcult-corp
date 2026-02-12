// Stage — main dashboard page composing all components
'use client';

import { useState, Suspense, useCallback } from 'react';
import { StageHeader, type ViewMode } from './StageHeader';
import type { ConnectionStatus } from './hooks';
import { MissionsList } from './MissionsList';
import { MissionPlayback } from './MissionPlayback';
import { Office3DScene } from './office3d/Office3DScene';
import { EventLogFeed } from './EventLogFeed';
import { SystemLogs } from './SystemLogs';
import { CostTracker } from './CostTracker';
import { MemoryExplorer } from './MemoryExplorer';
import { RelationshipGraph } from './RelationshipGraph';
import { StageErrorBoundary, SectionErrorBoundary } from './StageErrorBoundary';
import {
    MissionsListSkeleton,
    EventLogFeedSkeleton,
    SystemLogsSkeleton,
} from './StageSkeletons';

export default function StagePage() {
    const [view, setView] = useState<ViewMode>('feed');
    const [playbackMissionId, setPlaybackMissionId] = useState<string | null>(
        null,
    );
    const [connectionStatus, setConnectionStatus] =
        useState<ConnectionStatus>('connected');
    const handleConnectionStatus = useCallback((status: ConnectionStatus) => {
        setConnectionStatus(status);
    }, []);

    return (
        <StageErrorBoundary>
            <div className='min-h-screen bg-[#11111b] text-zinc-100'>
                <div className='mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6'>
                    {/* Header with stats + view toggle */}
                    <StageHeader
                        view={view}
                        onViewChange={setView}
                        connectionStatus={connectionStatus}
                    />

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
                        <SectionErrorBoundary label='Event Log'>
                            <Suspense fallback={<EventLogFeedSkeleton />}>
                                <EventLogFeed
                                    onConnectionStatus={handleConnectionStatus}
                                />
                            </Suspense>
                        </SectionErrorBoundary>
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

                    {/* ── Office View (Three.js 2.5D) ── */}
                    {view === 'office' && (
                        <div className='space-y-4'>
                            <SectionErrorBoundary label='Office'>
                                <Office3DScene />
                            </SectionErrorBoundary>
                            <SectionErrorBoundary label='Event Log'>
                                <Suspense fallback={<EventLogFeedSkeleton />}>
                                    <EventLogFeed
                                        onConnectionStatus={
                                            handleConnectionStatus
                                        }
                                    />
                                </Suspense>
                            </SectionErrorBoundary>
                        </div>
                    )}

                    {/* ── System Logs View ── */}
                    {view === 'logs' && (
                        <SectionErrorBoundary label='System Logs'>
                            <Suspense fallback={<SystemLogsSkeleton />}>
                                <SystemLogs />
                            </Suspense>
                        </SectionErrorBoundary>
                    )}

                    {/* ── Costs View ── */}
                    {view === 'costs' && (
                        <SectionErrorBoundary label='Cost Tracker'>
                            <CostTracker />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Memories View ── */}
                    {view === 'memories' && (
                        <SectionErrorBoundary label='Memory Explorer'>
                            <MemoryExplorer />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Relationships View ── */}
                    {view === 'relationships' && (
                        <SectionErrorBoundary label='Relationships'>
                            <RelationshipGraph />
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
