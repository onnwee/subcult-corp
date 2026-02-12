// office3d/Office3DScene.tsx — main Three.js scene container
'use client';

import { Suspense, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OfficeFloor } from './OfficeFloor';
import { OfficeWalls } from './OfficeWalls';
import { OfficeLighting } from './OfficeLighting';
import { OfficeFurniture } from './OfficeFurniture';
import { OfficeWhiteboard } from './OfficeWhiteboard';
import { AgentSprite } from './AgentSprite';
import { OverlayPanels } from './OverlayPanels';
import { useOfficeState } from './useOfficeState';
import { useTimeOfDay } from '../hooks';
import { CAMERA, COLORS } from './constants';
import type { AgentId } from '@/lib/types';

function OfficeSceneContent({
    period,
    state,
}: {
    period: 'day' | 'dusk' | 'night';
    state: ReturnType<typeof useOfficeState>;
}) {
    const {
        agents,
        stats,
        setSelected,
        setDraggingAgent,
        setHoveredObject,
    } = state;

    const isDragging = useRef(false);

    const handleDeskClick = useCallback(
        (agentId: AgentId) => {
            state.setSelected({ type: 'desk', agentId });
        },
        [state],
    );

    const handleWhiteboardClick = useCallback(() => {
        state.setSelected({ type: 'whiteboard' });
    }, [state]);

    const handleCoffeeClick = useCallback(() => {
        state.setSelected({ type: 'coffee' });
    }, [state]);

    const handleServerClick = useCallback(() => {
        state.setSelected({ type: 'server' });
    }, [state]);

    const handleAgentClick = useCallback(
        (agentId: AgentId) => {
            if (!isDragging.current) {
                setSelected({ type: 'agent', agentId });
            }
        },
        [setSelected],
    );

    const handleAgentPointerDown = useCallback(
        (agentId: AgentId) => {
            isDragging.current = false;
            setDraggingAgent(agentId);

            const handlePointerMove = (_e: PointerEvent) => {
                isDragging.current = true;
                // We handle dragging via raycasting in the frame loop if needed
                // For simplicity, we use a basic approach
            };

            const handlePointerUp = () => {
                setDraggingAgent(null);
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
                // Reset isDragging after a tick so click handler can check it
                setTimeout(() => { isDragging.current = false; }, 50);
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        },
        [setDraggingAgent],
    );

    // Click on empty floor to deselect
    const handleFloorClick = useCallback(() => {
        setSelected(null);
    }, [setSelected]);

    return (
        <>
            {/* Lighting */}
            <OfficeLighting period={period} />

            {/* Environment */}
            <color attach='background' args={[COLORS.crust]} />
            <fog attach='fog' args={[COLORS.crust, 25, 50]} />

            {/* Floor with click plane for deselection */}
            <group>
                <OfficeFloor />
                {/* Invisible interaction plane to reliably capture floor clicks */}
                <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, 0.01, 0]}
                    onClick={handleFloorClick}
                >
                    <planeGeometry args={[100, 100]} />
                    <meshBasicMaterial visible={false} transparent opacity={0} />
                </mesh>
            </group>

            {/* Walls */}
            <OfficeWalls period={period} />

            {/* Furniture */}
            <OfficeFurniture
                onClickDesk={handleDeskClick}
                onClickCoffee={handleCoffeeClick}
                onClickServer={handleServerClick}
            />

            {/* Whiteboard */}
            <OfficeWhiteboard
                stats={stats}
                onClick={handleWhiteboardClick}
            />

            {/* Agents */}
            {agents.map(agent => (
                <AgentSprite
                    key={agent.id}
                    agent={agent}
                    onClick={() => handleAgentClick(agent.id)}
                    onPointerDown={() => handleAgentPointerDown(agent.id)}
                    onPointerEnter={() => setHoveredObject(`agent:${agent.id}`)}
                    onPointerLeave={() => setHoveredObject(null)}
                />
            ))}
        </>
    );
}

// ─── Loading fallback ───
function LoadingScreen() {
    return (
        <div className='flex items-center justify-center h-full bg-zinc-900/50'>
            <div className='text-center space-y-2'>
                <div className='text-2xl'>🏢</div>
                <div className='text-xs text-zinc-500 animate-pulse'>Loading office...</div>
            </div>
        </div>
    );
}

// ─── Agent Status Bar (below canvas) ───
function AgentStatusBar({
    agents,
    sessions,
}: {
    agents: ReturnType<typeof useOfficeState>['agents'];
    sessions: ReturnType<typeof useOfficeState>['sessions'];
}) {
    const activeSession = sessions.find(
        s => s.status === 'running' || s.status === 'pending',
    );
    const lastCompleted = sessions.find(s => s.status === 'completed');

    return (
        <div className='px-3 py-2 border-t border-zinc-800/50 bg-zinc-900/30'>
            <div className='flex items-center gap-3 overflow-x-auto'>
                {agents.map(agent => {
                    const inActiveSession = activeSession?.participants.includes(agent.id);
                    return (
                        <div key={agent.id} className='flex items-center gap-1.5 shrink-0'>
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${inActiveSession ? 'animate-pulse' : ''}`}
                                style={{ backgroundColor: agent.color }}
                            />
                            <span
                                className='text-[10px] font-semibold'
                                style={{ color: agent.color }}
                            >
                                {agent.name}
                            </span>
                            <span className='text-[9px] text-zinc-600'>
                                {inActiveSession ? 'in session' : agent.behavior}
                            </span>
                        </div>
                    );
                })}
                {activeSession && (
                    <div className='ml-auto flex items-center gap-1.5 shrink-0'>
                        <span className='relative flex h-1.5 w-1.5'>
                            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-blue opacity-75' />
                            <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-accent-blue' />
                        </span>
                        <span className='text-[10px] text-accent-blue font-medium'>
                            {activeSession.format}
                        </span>
                        <span className='text-[9px] text-zinc-600 max-w-40 truncate'>
                            {activeSession.topic}
                        </span>
                    </div>
                )}
                {!activeSession && lastCompleted && (
                    <div className='ml-auto shrink-0'>
                        <span className='text-[9px] text-zinc-600'>
                            Last: {lastCompleted.format}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Export ───
export function Office3DScene() {
    const period = useTimeOfDay();
    const state = useOfficeState();

    return (
        <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
            {/* Header */}
            <div className='flex items-center justify-between px-4 py-2 border-b border-zinc-800'>
                <span className='text-xs font-medium text-zinc-400'>
                    The Office
                </span>
                <div className='flex items-center gap-3'>
                    <span className='text-[10px] text-zinc-600'>
                        {period === 'day' ? '☀️ Day' : period === 'dusk' ? '🌅 Dusk' : '🌙 Night'}
                    </span>
                    <span className='text-[10px] text-zinc-700'>
                        {state.agents.filter(a => a.behavior !== 'idle').length} agents active
                    </span>
                </div>
            </div>

            {/* 3D Canvas */}
            <div
                className='relative'
                style={{ height: 'min(420px, 60vh)' }}
                role='region'
                aria-label='Interactive 3D office scene showing agent desks, behaviors, and operational stats'
            >
                {(() => {
                    // Detect WebGL support before attempting to render the 3D canvas.
                    if (typeof window === 'undefined') {
                        // On the server (or during very early hydration), avoid touching the DOM.
                        return (
                            <div className='flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500'>
                                Loading 3D scene...
                            </div>
                        );
                    }

                    try {
                        const canvas = document.createElement('canvas');
                        const gl =
                            canvas.getContext('webgl') ||
                            // Some older browsers expose WebGL only via this prefix.
                            canvas.getContext('experimental-webgl');

                        if (!gl) {
                            throw new Error('WebGL not supported');
                        }
                    } catch {
                        return (
                            <div className='flex h-full items-center justify-center px-4 text-center text-xs text-zinc-400'>
                                Your browser does not support WebGL, which is required to display the
                                interactive 3D office. Please use a modern browser and ensure that
                                hardware acceleration is enabled.
                            </div>
                        );
                    }

                    return (
                        <Suspense fallback={<LoadingScreen />}>
                            <Canvas
                                orthographic
                                camera={{
                                    position: CAMERA.position,
                                    zoom: CAMERA.zoom,
                                    near: CAMERA.near,
                                    far: CAMERA.far,
                                }}
                                style={{ background: COLORS.crust }}
                                gl={{ antialias: true, alpha: false }}
                                dpr={[1, 2]}
                            >
                                <OfficeSceneContent period={period} state={state} />
                            </Canvas>
                        </Suspense>
                    );
                })()}

                {/* Overlay panels (HTML positioned over canvas) */}
                <OverlayPanels
                    selected={state.selected}
                    agents={state.agents}
                    stats={state.stats}
                    events={state.recentEvents}
                    missions={state.activeMissions}
                    onClose={() => state.setSelected(null)}
                />

                {/* Hover tooltip */}
                {state.hoveredObject && (
                    <div className='absolute bottom-3 left-3 px-2 py-1 rounded bg-zinc-800/90 border border-zinc-700/50 text-[10px] text-zinc-400 pointer-events-none'>
                        {state.hoveredObject.startsWith('agent:')
                            ? `Click to view ${state.hoveredObject.replace('agent:', '')}`
                            : state.hoveredObject
                        }
                    </div>
                )}
            </div>

            {/* Status bar */}
            <AgentStatusBar agents={state.agents} sessions={state.sessions} />
        </div>
    );
}
