// office3d/OfficeWalls.tsx — back wall, side walls, window
'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { OFFICE, COLORS, PROPS, SKY_COLORS } from './constants';

function WindowPane({ period }: { period: 'day' | 'dusk' | 'night' }) {
    const sky = SKY_COLORS[period];

    return (
        <group position={PROPS.window}>
            {/* Window frame */}
            <mesh>
                <boxGeometry args={[4, 2.5, 0.1]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
            {/* Glass pane */}
            <mesh position={[0, 0, 0.06]}>
                <planeGeometry args={[3.6, 2.1]} />
                <meshStandardMaterial
                    color={sky.top}
                    transparent
                    opacity={0.5}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Window cross bars */}
            <mesh position={[0, 0, 0.08]}>
                <boxGeometry args={[0.05, 2.1, 0.02]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
            <mesh position={[0, 0, 0.08]}>
                <boxGeometry args={[3.6, 0.05, 0.02]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
        </group>
    );
}

function Poster() {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 180;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#1a1a30';
        ctx.fillRect(0, 0, 128, 180);

        // Border
        ctx.strokeStyle = COLORS.surface1;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 126, 178);

        // Text
        ctx.fillStyle = COLORS.accent;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SUBCULT', 64, 50);

        ctx.fillStyle = COLORS.overlay0;
        ctx.font = '10px monospace';
        ctx.fillText('AUTONOMY', 64, 80);
        ctx.fillText('THROUGH', 64, 100);
        ctx.fillText('ALIGNMENT', 64, 120);

        // Decorative line
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 140);
        ctx.lineTo(98, 140);
        ctx.stroke();

        return new THREE.CanvasTexture(canvas);
    }, []);

    return (
        <mesh position={PROPS.poster}>
            <planeGeometry args={[1.2, 1.7]} />
            <meshStandardMaterial map={texture} />
        </mesh>
    );
}

function WallClock() {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        // Clock face
        ctx.fillStyle = '#0a0a15';
        ctx.beginPath();
        ctx.arc(64, 64, 60, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = COLORS.surface1;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Hour marks
        ctx.strokeStyle = COLORS.overlay0;
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(64 + Math.cos(angle) * 48, 64 + Math.sin(angle) * 48);
            ctx.lineTo(64 + Math.cos(angle) * 54, 64 + Math.sin(angle) * 54);
            ctx.stroke();
        }

        // Simple hands
        const now = new Date();
        const hourAngle = ((now.getHours() % 12) / 12) * Math.PI * 2 - Math.PI / 2;
        const minAngle = (now.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;

        // Hour hand
        ctx.strokeStyle = COLORS.subtext;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(64, 64);
        ctx.lineTo(64 + Math.cos(hourAngle) * 30, 64 + Math.sin(hourAngle) * 30);
        ctx.stroke();

        // Minute hand
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(64, 64);
        ctx.lineTo(64 + Math.cos(minAngle) * 42, 64 + Math.sin(minAngle) * 42);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = COLORS.red;
        ctx.beginPath();
        ctx.arc(64, 64, 3, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }, []);

    return (
        <mesh position={PROPS.clock}>
            <circleGeometry args={[0.5, 32]} />
            <meshStandardMaterial map={texture} />
        </mesh>
    );
}

export function OfficeWalls({ period }: { period: 'day' | 'dusk' | 'night' }) {
    return (
        <group>
            {/* Back wall */}
            <mesh position={[0, OFFICE.wallHeight / 2, -OFFICE.depth / 2]}>
                <boxGeometry args={[OFFICE.width, OFFICE.wallHeight, 0.15]} />
                <meshStandardMaterial color={COLORS.mantle} />
            </mesh>

            {/* Left wall */}
            <mesh position={[-OFFICE.width / 2, OFFICE.wallHeight / 2, 0]}>
                <boxGeometry args={[0.15, OFFICE.wallHeight, OFFICE.depth]} />
                <meshStandardMaterial color={COLORS.mantle} />
            </mesh>

            {/* Right wall */}
            <mesh position={[OFFICE.width / 2, OFFICE.wallHeight / 2, 0]}>
                <boxGeometry args={[0.15, OFFICE.wallHeight, OFFICE.depth]} />
                <meshStandardMaterial color={COLORS.mantle} />
            </mesh>

            {/* Baseboard */}
            <mesh position={[0, 0.08, -OFFICE.depth / 2 + 0.1]}>
                <boxGeometry args={[OFFICE.width, 0.15, 0.05]} />
                <meshStandardMaterial color={COLORS.surface0} />
            </mesh>

            {/* Window */}
            <WindowPane period={period} />

            {/* Poster */}
            <Poster />

            {/* Clock */}
            <WallClock />
        </group>
    );
}
