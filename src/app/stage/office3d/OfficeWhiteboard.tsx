// office3d/OfficeWhiteboard.tsx — interactive whiteboard with live ops data texture
'use client';

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { PROPS } from './constants';
import type { SystemStats } from '../hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

export function OfficeWhiteboard({
    stats,
    onClick,
}: {
    stats: SystemStats | null;
    onClick?: () => void;
}) {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 320;
        const ctx = canvas.getContext('2d')!;

        // Board background
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(0, 0, 512, 320);

        // Border
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 508, 316);

        // Title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('OPS DASHBOARD', 256, 35);

        // Divider
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 48);
        ctx.lineTo(482, 48);
        ctx.stroke();

        if (stats) {
            ctx.textAlign = 'left';
            ctx.font = '18px monospace';

            // Metrics
            const metrics = [
                { label: 'Events', value: stats.totalEvents.toLocaleString(), color: '#333' },
                { label: 'Active Missions', value: String(stats.activeMissions), color: stats.activeMissions > 0 ? '#166534' : '#333' },
                { label: 'Conversations', value: String(stats.totalConversations), color: '#333' },
                { label: 'Total Memories', value: String(Object.values(stats.agentMemories).reduce((a, b) => a + b, 0)), color: '#333' },
            ];

            metrics.forEach((m, i) => {
                const y = 78 + i * 32;
                ctx.fillStyle = '#666';
                ctx.font = '16px monospace';
                ctx.fillText(m.label, 30, y);
                ctx.fillStyle = m.color;
                ctx.font = 'bold 20px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(m.value, 300, y);
                ctx.textAlign = 'left';
            });

            // Agent memory bars
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(320, 55);
            ctx.lineTo(320, 200);
            ctx.stroke();

            const entries = Object.entries(stats.agentMemories).slice(0, 6);
            entries.forEach(([agentId, count], i) => {
                const agent = AGENTS[agentId as AgentId];
                const y = 68 + i * 22;
                const barWidth = Math.min(count * 12, 160);

                // Parse hex color for canvas
                const hex = agent?.color ?? '#666';
                ctx.fillStyle = hex;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(340, y - 8, barWidth, 14);
                ctx.globalAlpha = 1;

                if (count > 0) {
                    ctx.fillStyle = '#999';
                    ctx.font = '12px monospace';
                    ctx.fillText(String(count), 345 + barWidth + 4, y + 4);
                }
            });

            // Status indicator
            ctx.fillStyle = '#a6e3a1';
            ctx.beginPath();
            ctx.arc(470, 290, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#999';
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('LIVE', 456, 295);
        } else {
            ctx.fillStyle = '#999';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Loading data...', 256, 120);
        }

        return new THREE.CanvasTexture(canvas);
    }, [stats]);

    // Dispose texture on unmount or when stats change
    useEffect(() => {
        return () => {
            texture.dispose();
        };
    }, [texture]);

    return (
        <group position={PROPS.whiteboard} onClick={onClick}>
            {/* Board frame */}
            <mesh position={[0, 0, -0.03]}>
                <boxGeometry args={[4.5, 2.8, 0.06]} />
                <meshStandardMaterial color='#888' roughness={0.8} />
            </mesh>
            {/* Board surface */}
            <mesh>
                <planeGeometry args={[4.2, 2.5]} />
                <meshStandardMaterial map={texture} />
            </mesh>
        </group>
    );
}
