// office3d/OfficeFloor.tsx — ground plane with grid lines
'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { OFFICE, COLORS } from './constants';

export function OfficeFloor() {
    const gridTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        // Fill base color
        ctx.fillStyle = COLORS.base;
        ctx.fillRect(0, 0, 512, 512);

        // Grid lines
        ctx.strokeStyle = COLORS.surface0;
        ctx.lineWidth = 1;
        const gridSize = 512 / 20;
        for (let i = 0; i <= 20; i++) {
            const pos = i * gridSize;
            ctx.beginPath();
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, 512);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, pos);
            ctx.lineTo(512, pos);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        return texture;
    }, []);

    return (
        <group>
            {/* Main floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[OFFICE.width, OFFICE.depth]} />
                <meshStandardMaterial
                    map={gridTexture}
                    roughness={0.9}
                    metalness={0.1}
                />
            </mesh>
            {/* Subtle edge glow line on floor perimeter */}
            <lineSegments position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <edgesGeometry args={[new THREE.PlaneGeometry(OFFICE.width, OFFICE.depth)]} />
                <lineBasicMaterial color={COLORS.surface1} transparent opacity={0.3} />
            </lineSegments>
        </group>
    );
}
