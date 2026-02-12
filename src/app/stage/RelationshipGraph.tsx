// RelationshipGraph — force-directed agent relationship visualization
// Interactive: click edges for drift history, click nodes for agent details
'use client';
'use no memo';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRelationships, useMemories } from './hooks';
import { AGENTS, AGENT_IDS } from '@/lib/agents';
import type { AgentId, AgentRelationship, DriftLogEntry, MemoryEntry } from '@/lib/types';

// ─── Types ───

interface Node {
    id: AgentId;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface Edge {
    source: AgentId;
    target: AgentId;
    relationship: AgentRelationship;
}

type Selection =
    | { type: 'node'; id: AgentId }
    | { type: 'edge'; source: AgentId; target: AgentId };

// ─── Constants ───

const WIDTH = 600;
const HEIGHT = 400;
const NODE_RADIUS = 24;
const REPULSION = 8000;
const ATTRACTION = 0.005;
const DAMPING = 0.85;
const IDEAL_DIST = 140;
const ITERATIONS = 150;

// ─── Edge Colors by Affinity ───

function affinityColor(affinity: number): string {
    if (affinity >= 0.7) return '#a6e3a1'; // green
    if (affinity >= 0.5) return '#f9e2af'; // yellow
    if (affinity >= 0.3) return '#fab387'; // orange/peach
    return '#f38ba8'; // red
}

function affinityWidth(totalInteractions: number): number {
    if (totalInteractions >= 20) return 4;
    if (totalInteractions >= 10) return 3;
    if (totalInteractions >= 5) return 2;
    return 1;
}

// ─── Fruchterman-Reingold Layout ───

function computeLayout(
    nodeIds: AgentId[],
    edges: Edge[],
): Map<AgentId, { x: number; y: number }> {
    // Initialize nodes in a circle
    const nodes: Node[] = nodeIds.map((id, i) => {
        const angle = (2 * Math.PI * i) / nodeIds.length;
        const r = 100;
        return {
            id,
            x: WIDTH / 2 + r * Math.cos(angle),
            y: HEIGHT / 2 + r * Math.sin(angle),
            vx: 0,
            vy: 0,
        };
    });

    const nodeMap = new Map<AgentId, Node>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // Simulate
    for (let iter = 0; iter < ITERATIONS; iter++) {
        const temp = 1 - iter / ITERATIONS;

        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                const force = (REPULSION * temp) / (dist * dist);
                dx = (dx / dist) * force;
                dy = (dy / dist) * force;
                a.vx += dx;
                a.vy += dy;
                b.vx -= dx;
                b.vy -= dy;
            }
        }

        // Attraction along edges
        for (const edge of edges) {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = ATTRACTION * (dist - IDEAL_DIST) * temp;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }

        // Update positions
        const padding = NODE_RADIUS + 10;
        for (const n of nodes) {
            n.vx *= DAMPING;
            n.vy *= DAMPING;
            n.x += n.vx;
            n.y += n.vy;
            // Clamp to bounds
            n.x = Math.max(padding, Math.min(WIDTH - padding, n.x));
            n.y = Math.max(padding, Math.min(HEIGHT - padding, n.y));
        }
    }

    const result = new Map<AgentId, { x: number; y: number }>();
    for (const n of nodes) result.set(n.id, { x: n.x, y: n.y });
    return result;
}

// ─── Formatters ───

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

// ─── Edge Detail Panel ───

function EdgeDetailPanel({
    relationship,
    onClose,
}: {
    relationship: AgentRelationship;
    onClose: () => void;
}) {
    const agentA = AGENTS[relationship.agent_a as AgentId];
    const agentB = AGENTS[relationship.agent_b as AgentId];
    const affinity = Number(relationship.affinity);
    const driftLog = Array.isArray(relationship.drift_log)
        ? relationship.drift_log
        : [];
    const recentDrifts = driftLog.slice(-5).reverse();

    const affinityLabel =
        affinity >= 0.7
            ? 'Strong'
            : affinity >= 0.5
                ? 'Neutral'
                : affinity >= 0.3
                    ? 'Tense'
                    : 'Hostile';

    return (
        <div className='rounded-lg border border-zinc-700/50 bg-zinc-800/80 p-4 space-y-3'>
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    <span
                        className={`text-xs font-semibold ${agentA?.tailwindTextColor ?? 'text-zinc-400'}`}
                    >
                        {agentA?.displayName ?? relationship.agent_a}
                    </span>
                    <span className='text-zinc-600'>↔</span>
                    <span
                        className={`text-xs font-semibold ${agentB?.tailwindTextColor ?? 'text-zinc-400'}`}
                    >
                        {agentB?.displayName ?? relationship.agent_b}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className='text-zinc-600 hover:text-zinc-400 text-xs'
                >
                    ✕
                </button>
            </div>

            {/* Affinity gauge */}
            <div>
                <div className='flex items-center justify-between mb-1'>
                    <span className='text-[10px] text-zinc-500'>Affinity</span>
                    <span
                        className='text-xs font-medium'
                        style={{ color: affinityColor(affinity) }}
                    >
                        {affinityLabel} ({Math.round(affinity * 100)}%)
                    </span>
                </div>
                <div className='h-2 rounded-full bg-zinc-700/50 overflow-hidden'>
                    <div
                        className='h-full rounded-full transition-all duration-300'
                        style={{
                            width: `${affinity * 100}%`,
                            backgroundColor: affinityColor(affinity),
                        }}
                    />
                </div>
            </div>

            {/* Interaction counts */}
            <div className='grid grid-cols-3 gap-2'>
                <div className='rounded bg-zinc-900/60 px-2 py-1.5 text-center'>
                    <div className='text-[10px] text-zinc-500'>Total</div>
                    <div className='text-sm font-semibold text-zinc-200'>
                        {relationship.total_interactions}
                    </div>
                </div>
                <div className='rounded bg-zinc-900/60 px-2 py-1.5 text-center'>
                    <div className='text-[10px] text-accent-green'>
                        Positive
                    </div>
                    <div className='text-sm font-semibold text-accent-green'>
                        {relationship.positive_interactions}
                    </div>
                </div>
                <div className='rounded bg-zinc-900/60 px-2 py-1.5 text-center'>
                    <div className='text-[10px] text-accent-red'>Negative</div>
                    <div className='text-sm font-semibold text-accent-red'>
                        {relationship.negative_interactions}
                    </div>
                </div>
            </div>

            {/* Drift history */}
            {recentDrifts.length > 0 && (
                <div>
                    <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5'>
                        Recent Drift History
                    </div>
                    <div className='space-y-1'>
                        {recentDrifts.map((entry: DriftLogEntry, i: number) => (
                            <div
                                key={i}
                                className='flex items-start gap-2 text-[11px] rounded bg-zinc-900/40 px-2 py-1'
                            >
                                <span
                                    className={`font-mono shrink-0 ${
                                        entry.drift > 0
                                            ? 'text-accent-green'
                                            : entry.drift < 0
                                                ? 'text-accent-red'
                                                : 'text-zinc-500'
                                    }`}
                                >
                                    {entry.drift > 0 ? '+' : ''}
                                    {(entry.drift * 100).toFixed(1)}%
                                </span>
                                <span className='text-zinc-400 flex-1'>
                                    {entry.reason}
                                </span>
                                {entry.at && (
                                    <span className='text-zinc-600 shrink-0 text-[10px]'>
                                        {formatRelativeTime(entry.at)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Node Detail Panel ───

function NodeDetailPanel({
    agentId,
    relationships,
    onClose,
}: {
    agentId: AgentId;
    relationships: AgentRelationship[];
    onClose: () => void;
}) {
    const agent = AGENTS[agentId];
    const { memories } = useMemories({
        agent_id: agentId,
        limit: 5,
    });

    // Get all relationships involving this agent
    const agentRels = relationships.filter(
        r => r.agent_a === agentId || r.agent_b === agentId,
    );

    return (
        <div className='rounded-lg border border-zinc-700/50 bg-zinc-800/80 p-4 space-y-3'>
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    <div
                        className='h-4 w-4 rounded-full'
                        style={{ backgroundColor: agent.color }}
                    />
                    <span
                        className={`text-sm font-semibold ${agent.tailwindTextColor}`}
                    >
                        {agent.displayName}
                    </span>
                    <span className='text-[10px] text-zinc-500'>
                        {agent.role}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className='text-zinc-600 hover:text-zinc-400 text-xs'
                >
                    ✕
                </button>
            </div>

            <p className='text-[11px] text-zinc-400 leading-relaxed'>
                {agent.description}
            </p>

            {/* Relationships list */}
            <div>
                <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5'>
                    Relationships
                </div>
                <div className='space-y-1'>
                    {agentRels.map(rel => {
                        const otherId =
                            rel.agent_a === agentId
                                ? rel.agent_b
                                : rel.agent_a;
                        const other = AGENTS[otherId as AgentId];
                        const aff = Number(rel.affinity);
                        return (
                            <div
                                key={rel.id}
                                className='flex items-center gap-2 rounded bg-zinc-900/40 px-2 py-1'
                            >
                                <div
                                    className='h-2.5 w-2.5 rounded-full shrink-0'
                                    style={{
                                        backgroundColor:
                                            other?.color ?? '#666',
                                    }}
                                />
                                <span
                                    className={`text-[11px] font-medium ${other?.tailwindTextColor ?? 'text-zinc-400'}`}
                                >
                                    {other?.displayName ?? otherId}
                                </span>
                                <div className='flex-1 h-1 rounded-full bg-zinc-700/50 mx-1'>
                                    <div
                                        className='h-full rounded-full'
                                        style={{
                                            width: `${aff * 100}%`,
                                            backgroundColor:
                                                affinityColor(aff),
                                        }}
                                    />
                                </div>
                                <span
                                    className='text-[10px] font-mono'
                                    style={{ color: affinityColor(aff) }}
                                >
                                    {Math.round(aff * 100)}%
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Recent memories */}
            {memories.length > 0 && (
                <div>
                    <div className='text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5'>
                        Recent Memories
                    </div>
                    <div className='space-y-1'>
                        {memories.map((m: MemoryEntry) => (
                            <div
                                key={m.id}
                                className='rounded bg-zinc-900/40 px-2 py-1'
                            >
                                <div className='flex items-center gap-1.5 mb-0.5'>
                                    <span className='text-[10px]'>
                                        {m.type === 'insight'
                                            ? '💡'
                                            : m.type === 'pattern'
                                                ? '🔄'
                                                : m.type === 'strategy'
                                                    ? '♟️'
                                                    : m.type === 'preference'
                                                        ? '⭐'
                                                        : '📖'}
                                    </span>
                                    <span className='text-[10px] text-zinc-500'>
                                        {m.type}
                                    </span>
                                    <span className='text-[9px] text-zinc-600'>
                                        {formatRelativeTime(m.created_at)}
                                    </span>
                                </div>
                                <p className='text-[11px] text-zinc-400 line-clamp-2'>
                                    {m.content}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── SVG Graph ───

function GraphCanvas({
    positions,
    edges,
    selection,
    onSelectNode,
    onSelectEdge,
    onDrag,
}: {
    positions: Map<AgentId, { x: number; y: number }>;
    edges: Edge[];
    selection: Selection | null;
    onSelectNode: (id: AgentId) => void;
    onSelectEdge: (source: AgentId, target: AgentId) => void;
    onDrag: (id: AgentId, x: number, y: number) => void;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const dragging = useRef<AgentId | null>(null);

    const handleMouseDown = (id: AgentId) => (e: React.MouseEvent) => {
        e.stopPropagation();
        dragging.current = id;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging.current || !svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        onDrag(dragging.current, x, y);
    };

    const handleMouseUp = () => {
        if (dragging.current) {
            dragging.current = null;
        }
    };

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className='w-full h-auto rounded-lg bg-zinc-900/30 border border-zinc-800'
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Edges */}
            {edges.map(edge => {
                const a = positions.get(edge.source);
                const b = positions.get(edge.target);
                if (!a || !b) return null;

                const aff = Number(edge.relationship.affinity);
                const color = affinityColor(aff);
                const width = affinityWidth(edge.relationship.total_interactions);
                const isSelected =
                    selection?.type === 'edge' &&
                    ((selection.source === edge.source &&
                        selection.target === edge.target) ||
                        (selection.source === edge.target &&
                            selection.target === edge.source));

                return (
                    <g key={`${edge.source}-${edge.target}`}>
                        {/* Clickable area (wider invisible line) */}
                        <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke='transparent'
                            strokeWidth={12}
                            className='cursor-pointer'
                            onClick={() =>
                                onSelectEdge(edge.source, edge.target)
                            }
                        />
                        {/* Visible edge */}
                        <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={color}
                            strokeWidth={isSelected ? width + 2 : width}
                            strokeOpacity={isSelected ? 1 : 0.6}
                            className='pointer-events-none transition-all'
                        />
                        {/* Affinity label on midpoint */}
                        <text
                            x={(a.x + b.x) / 2}
                            y={(a.y + b.y) / 2 - 6}
                            textAnchor='middle'
                            fontSize={9}
                            fill={color}
                            opacity={0.7}
                            className='pointer-events-none'
                        >
                            {Math.round(aff * 100)}%
                        </text>
                    </g>
                );
            })}

            {/* Nodes */}
            {AGENT_IDS.map(id => {
                const pos = positions.get(id);
                if (!pos) return null;
                const agent = AGENTS[id];
                const isSelected =
                    selection?.type === 'node' && selection.id === id;

                return (
                    <g
                        key={id}
                        className='cursor-pointer'
                        onMouseDown={handleMouseDown(id)}
                        onClick={e => {
                            e.stopPropagation();
                            if (!dragging.current) onSelectNode(id);
                        }}
                    >
                        {/* Glow ring when selected */}
                        {isSelected && (
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={NODE_RADIUS + 4}
                                fill='none'
                                stroke={agent.color}
                                strokeWidth={2}
                                opacity={0.5}
                            />
                        )}
                        {/* Node circle */}
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={NODE_RADIUS}
                            fill={agent.color}
                            fillOpacity={0.2}
                            stroke={agent.color}
                            strokeWidth={2}
                        />
                        {/* Agent name */}
                        <text
                            x={pos.x}
                            y={pos.y + 1}
                            textAnchor='middle'
                            dominantBaseline='central'
                            fontSize={10}
                            fontWeight={600}
                            fill={agent.color}
                            className='select-none pointer-events-none uppercase'
                        >
                            {id}
                        </text>
                        {/* Role label below */}
                        <text
                            x={pos.x}
                            y={pos.y + NODE_RADIUS + 12}
                            textAnchor='middle'
                            fontSize={8}
                            fill='#71717a'
                            className='select-none pointer-events-none'
                        >
                            {agent.role}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─── Main Component ───

export function RelationshipGraph() {
    const { relationships, loading, error } = useRelationships();
    const [selection, setSelection] = useState<Selection | null>(null);
    const [positions, setPositions] = useState<
        Map<AgentId, { x: number; y: number }>
    >(new Map());

    // Build edges from relationships
    const edges = useMemo<Edge[]>(() => {
        return relationships.map(r => ({
            source: r.agent_a as AgentId,
            target: r.agent_b as AgentId,
            relationship: r,
        }));
    }, [relationships]);

    // Compute layout
    useEffect(() => {
        if (relationships.length === 0) return;
        const layout = computeLayout(AGENT_IDS, edges);
        setPositions(layout);
    }, [relationships, edges]);

    const handleSelectNode = useCallback((id: AgentId) => {
        setSelection(prev =>
            prev?.type === 'node' && prev.id === id
                ? null
                : { type: 'node', id },
        );
    }, []);

    const handleSelectEdge = useCallback(
        (source: AgentId, target: AgentId) => {
            setSelection(prev =>
                prev?.type === 'edge' &&
                prev.source === source &&
                prev.target === target
                    ? null
                    : { type: 'edge', source, target },
            );
        },
        [],
    );

    const handleDrag = useCallback((id: AgentId, x: number, y: number) => {
        setPositions(prev => {
            const next = new Map(prev);
            next.set(id, { x, y });
            return next;
        });
    }, []);

    // Find selected relationship
    const selectedRelationship =
        selection?.type === 'edge'
            ? relationships.find(
                  r =>
                      (r.agent_a === selection.source &&
                          r.agent_b === selection.target) ||
                      (r.agent_a === selection.target &&
                          r.agent_b === selection.source),
              )
            : undefined;

    if (error) {
        return (
            <div className='rounded-xl border border-accent-red/50 bg-accent-red/10 p-4'>
                <p className='text-sm text-accent-red'>
                    Failed to load relationships: {error}
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 p-8'>
                <div className='h-[400px] rounded-lg bg-zinc-800/40 animate-pulse flex items-center justify-center'>
                    <span className='text-zinc-600 text-sm'>
                        Loading relationship graph...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className='space-y-4'>
            {/* Summary stats */}
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                    <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                        Relationships
                    </div>
                    <div className='text-lg font-semibold text-zinc-100 tabular-nums'>
                        {relationships.length}
                    </div>
                </div>
                <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                    <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                        Avg Affinity
                    </div>
                    <div className='text-lg font-semibold text-zinc-100 tabular-nums'>
                        {relationships.length > 0
                            ? Math.round(
                                  (relationships.reduce(
                                      (sum, r) => sum + Number(r.affinity),
                                      0,
                                  ) /
                                      relationships.length) *
                                      100,
                              )
                            : 0}
                        %
                    </div>
                </div>
                <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                    <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                        Total Interactions
                    </div>
                    <div className='text-lg font-semibold text-zinc-100 tabular-nums'>
                        {relationships.reduce(
                            (sum, r) => sum + (r.total_interactions ?? 0),
                            0,
                        )}
                    </div>
                </div>
                <div className='rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2'>
                    <div className='text-[10px] uppercase tracking-wider text-zinc-500'>
                        Strongest Bond
                    </div>
                    {relationships.length > 0 ? (() => {
                        const best = relationships.reduce((a, b) =>
                            Number(a.affinity) > Number(b.affinity) ? a : b,
                        );
                        const agA = AGENTS[best.agent_a as AgentId];
                        const agB = AGENTS[best.agent_b as AgentId];
                        return (
                            <div className='flex items-center gap-1 mt-0.5'>
                                <span
                                    className={`text-[11px] font-medium ${agA?.tailwindTextColor ?? 'text-zinc-400'}`}
                                >
                                    {best.agent_a}
                                </span>
                                <span className='text-zinc-600 text-[10px]'>
                                    ↔
                                </span>
                                <span
                                    className={`text-[11px] font-medium ${agB?.tailwindTextColor ?? 'text-zinc-400'}`}
                                >
                                    {best.agent_b}
                                </span>
                                <span className='text-accent-green text-[10px] ml-1'>
                                    {Math.round(Number(best.affinity) * 100)}%
                                </span>
                            </div>
                        );
                    })() : (
                        <span className='text-xs text-zinc-500'>—</span>
                    )}
                </div>
            </div>

            {/* Graph + detail panel */}
            <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
                <div className='px-4 py-3 border-b border-zinc-800'>
                    <div className='flex items-center gap-2'>
                        <span className='text-xs font-medium text-zinc-400'>
                            🌐 Relationship Constellation
                        </span>
                        <span className='text-[10px] text-zinc-600'>
                            Click nodes or edges to explore
                        </span>
                    </div>
                    {/* Legend */}
                    <div className='flex gap-3 mt-1.5'>
                        <span className='flex items-center gap-1 text-[10px]'>
                            <span
                                className='inline-block h-2 w-4 rounded'
                                style={{ backgroundColor: '#a6e3a1' }}
                            />
                            <span className='text-zinc-500'>
                                Strong (≥70%)
                            </span>
                        </span>
                        <span className='flex items-center gap-1 text-[10px]'>
                            <span
                                className='inline-block h-2 w-4 rounded'
                                style={{ backgroundColor: '#f9e2af' }}
                            />
                            <span className='text-zinc-500'>
                                Neutral (50-69%)
                            </span>
                        </span>
                        <span className='flex items-center gap-1 text-[10px]'>
                            <span
                                className='inline-block h-2 w-4 rounded'
                                style={{ backgroundColor: '#fab387' }}
                            />
                            <span className='text-zinc-500'>
                                Tense (30-49%)
                            </span>
                        </span>
                        <span className='flex items-center gap-1 text-[10px]'>
                            <span
                                className='inline-block h-2 w-4 rounded'
                                style={{ backgroundColor: '#f38ba8' }}
                            />
                            <span className='text-zinc-500'>
                                Hostile (&lt;30%)
                            </span>
                        </span>
                    </div>
                </div>

                <div className='p-4'>
                    {positions.size > 0 ? (
                        <GraphCanvas
                            positions={positions}
                            edges={edges}
                            selection={selection}
                            onSelectNode={handleSelectNode}
                            onSelectEdge={handleSelectEdge}
                            onDrag={handleDrag}
                        />
                    ) : (
                        <div className='h-[400px] flex items-center justify-center text-zinc-500 text-sm'>
                            No relationship data yet. Relationships form as
                            agents interact in roundtable conversations.
                        </div>
                    )}
                </div>

                {/* Detail panel (below graph) */}
                {selection && (
                    <div className='px-4 pb-4'>
                        {selection.type === 'edge' && selectedRelationship ? (
                            <EdgeDetailPanel
                                relationship={selectedRelationship}
                                onClose={() => setSelection(null)}
                            />
                        ) : selection.type === 'node' ? (
                            <NodeDetailPanel
                                agentId={selection.id}
                                relationships={relationships}
                                onClose={() => setSelection(null)}
                            />
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
