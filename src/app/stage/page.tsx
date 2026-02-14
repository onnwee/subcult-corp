// Stage — main dashboard page composing all components
'use client';

import { useState, Suspense, useCallback } from 'react';
import { StageHeader, type ViewMode } from './StageHeader';
import type { ConnectionStatus } from './hooks';
import type { RoundtableSession, RoundtableTurn } from '@/lib/types';
import { MissionsList } from './MissionsList';
import { MissionPlayback } from './MissionPlayback';
import { Office3DScene } from './office3d/Office3DScene';
import { OfficeRoom } from './OfficeRoom';
import { ReplayController } from './ReplayController';
import { EventLogFeed } from './EventLogFeed';
import { SystemLogs } from './SystemLogs';
import { CostTracker } from './CostTracker';
import { MemoryExplorer } from './MemoryExplorer';
import { RelationshipGraph } from './RelationshipGraph';
import { ContentPipeline } from './ContentPipeline';
import { GovernancePanel } from './GovernancePanel';
import { DreamLog } from './DreamLog';
import { AgentDesigner } from './AgentDesigner';
import { MemoryArchaeology } from './MemoryArchaeology';
import { StageErrorBoundary, SectionErrorBoundary } from './StageErrorBoundary';
import { AskTheRoom } from './AskTheRoom';
import { DailyDigest } from './DailyDigest';
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
    const [officeMode, setOfficeMode] = useState<'svg' | '3d'>('svg');
    const [connectionStatus, setConnectionStatus] =
        useState<ConnectionStatus>('connected');
    const handleConnectionStatus = useCallback((status: ConnectionStatus) => {
        setConnectionStatus(status);
    }, []);

    // ── Replay state ──
    const [replaySession, setReplaySession] =
        useState<RoundtableSession | null>(null);
    const [replayTurns, setReplayTurns] = useState<RoundtableTurn[]>([]);
    const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
    const isReplaying = replaySession !== null;

    const handleStartReplay = useCallback(
        (session: RoundtableSession, turns: RoundtableTurn[]) => {
            setReplaySession(session);
            setReplayTurns(turns);
            setCurrentTurnIndex(0);
            setView('office');
            setOfficeMode('svg');
        },
        [],
    );

    const handleStopReplay = useCallback(() => {
        setReplaySession(null);
        setReplayTurns([]);
        setCurrentTurnIndex(0);
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
                        <>
                            <AskTheRoom />
                            <SectionErrorBoundary label='Daily Digest'>
                                <DailyDigest />
                            </SectionErrorBoundary>
                            <SectionErrorBoundary label='Event Log'>
                                <Suspense fallback={<EventLogFeedSkeleton />}>
                                    <EventLogFeed
                                        onConnectionStatusAction={
                                            handleConnectionStatus
                                        }
                                        onStartReplay={handleStartReplay}
                                    />
                                </Suspense>
                            </SectionErrorBoundary>
                        </>
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
                            {/* SVG / 3D toggle (hidden during replay) */}
                            {!isReplaying && (
                                <div className='flex items-center gap-2'>
                                    <div className='flex rounded-lg bg-zinc-800/50 p-0.5 border border-zinc-700/50'>
                                        <button
                                            onClick={() => setOfficeMode('svg')}
                                            className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                                                officeMode === 'svg' ?
                                                    'bg-zinc-700 text-zinc-100'
                                                :   'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            SVG
                                        </button>
                                        <button
                                            onClick={() => setOfficeMode('3d')}
                                            className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                                                officeMode === '3d' ?
                                                    'bg-zinc-700 text-zinc-100'
                                                :   'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            3D
                                        </button>
                                    </div>
                                    <span className='text-[10px] text-zinc-600'>
                                        {officeMode === 'svg' ?
                                            'Pixel art (SVG)'
                                        :   'Three.js (experimental)'}
                                    </span>
                                </div>
                            )}

                            <SectionErrorBoundary label='Office'>
                                {officeMode === 'svg' || isReplaying ?
                                    <OfficeRoom
                                        replaySession={
                                            replaySession ?? undefined
                                        }
                                        replayTurns={replayTurns}
                                        currentTurnIndex={currentTurnIndex}
                                        isReplaying={isReplaying}
                                    />
                                :   <Office3DScene />}
                            </SectionErrorBoundary>

                            {/* Replay controller overlay */}
                            {isReplaying && replayTurns.length > 0 && (
                                <ReplayController
                                    turns={replayTurns}
                                    currentTurnIndex={currentTurnIndex}
                                    onTurnChange={setCurrentTurnIndex}
                                    onStop={handleStopReplay}
                                />
                            )}

                            <SectionErrorBoundary label='Event Log'>
                                <Suspense fallback={<EventLogFeedSkeleton />}>
                                    <EventLogFeed
                                        onConnectionStatusAction={
                                            handleConnectionStatus
                                        }
                                        onStartReplay={handleStartReplay}
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

                    {/* ── Content View ── */}
                    {view === 'content' && (
                        <SectionErrorBoundary label='Content Pipeline'>
                            <ContentPipeline />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Governance View ── */}
                    {view === 'governance' && (
                        <SectionErrorBoundary label='Governance'>
                            <GovernancePanel />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Dreams View ── */}
                    {view === 'dreams' && (
                        <SectionErrorBoundary label='Dreams'>
                            <DreamLog />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Agent Designer View ── */}
                    {view === 'agent-designer' && (
                        <SectionErrorBoundary label='Agent Designer'>
                            <AgentDesigner />
                        </SectionErrorBoundary>
                    )}

                    {/* ── Archaeology View ── */}
                    {view === 'archaeology' && (
                        <SectionErrorBoundary label='Memory Archaeology'>
                            <MemoryArchaeology />
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
