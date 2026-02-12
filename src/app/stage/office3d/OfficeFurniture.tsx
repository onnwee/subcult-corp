// office3d/OfficeFurniture.tsx — desks, monitors, chairs, coffee machine, server rack, plants
'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { DESK_CONFIGS, PROPS, COLORS, AGENT_COLORS, SERVER_RACK_ACTIVE_LEDS } from './constants';
import type { AgentId } from '@/lib/types';

// ─── Desk with Monitor ───
function Desk({ agentId, position, onClick }: {
    agentId: AgentId;
    position: [number, number, number];
    onClick?: () => void;
}) {
    const color = AGENT_COLORS[agentId];

    return (
        <group position={position} onClick={onClick}>
            {/* Desk top */}
            <mesh position={[0, 0.7, 0]} castShadow>
                <boxGeometry args={[2, 0.08, 1]} />
                <meshStandardMaterial color={COLORS.surface0} roughness={0.7} />
            </mesh>
            {/* Desk legs */}
            {[[-0.85, 0.35, -0.4], [0.85, 0.35, -0.4], [-0.85, 0.35, 0.4], [0.85, 0.35, 0.4]].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]}>
                    <boxGeometry args={[0.06, 0.7, 0.06]} />
                    <meshStandardMaterial color={COLORS.surface1} />
                </mesh>
            ))}
            {/* Monitor */}
            <mesh position={[0, 1.2, -0.2]}>
                <boxGeometry args={[0.9, 0.6, 0.05]} />
                <meshStandardMaterial color='#0a0a15' />
            </mesh>
            {/* Monitor screen (glow) */}
            <mesh position={[0, 1.2, -0.17]}>
                <planeGeometry args={[0.8, 0.5]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={0.15}
                    transparent
                    opacity={0.3}
                />
            </mesh>
            {/* Monitor stand */}
            <mesh position={[0, 0.88, -0.2]}>
                <boxGeometry args={[0.15, 0.08, 0.06]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
            {/* Monitor base */}
            <mesh position={[0, 0.74, -0.2]}>
                <boxGeometry args={[0.3, 0.02, 0.15]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
            {/* Keyboard */}
            <mesh position={[0, 0.75, 0.15]}>
                <boxGeometry args={[0.5, 0.02, 0.15]} />
                <meshStandardMaterial color={COLORS.surface0} />
            </mesh>
            {/* Chair */}
            <Chair position={[0, 0, 0.7]} color={color} />
        </group>
    );
}

function Chair({ position, color }: { position: [number, number, number]; color: string }) {
    return (
        <group position={position}>
            {/* Seat */}
            <mesh position={[0, 0.45, 0]}>
                <boxGeometry args={[0.5, 0.06, 0.5]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            {/* Back */}
            <mesh position={[0, 0.75, -0.2]}>
                <boxGeometry args={[0.5, 0.6, 0.06]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            {/* Base */}
            <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
            {/* Wheels base */}
            <mesh position={[0, 0.02, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 0.04, 8]} />
                <meshStandardMaterial color={COLORS.surface1} />
            </mesh>
        </group>
    );
}

// ─── Coffee Machine ───
function CoffeeMachine({ onClick }: { onClick?: () => void }) {
    const steamRef = useRef<THREE.Mesh>(null);

    useFrame(({ clock }) => {
        if (steamRef.current) {
            steamRef.current.position.y = 1.5 + Math.sin(clock.elapsedTime * 2) * 0.05;
            (steamRef.current.material as THREE.MeshStandardMaterial).opacity = 0.15 + Math.sin(clock.elapsedTime * 3) * 0.05;
        }
    });

    return (
        <group position={PROPS.coffeeMachine} onClick={onClick}>
            {/* Body */}
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[0.6, 1, 0.5]} />
                <meshStandardMaterial color='#4a3a2a' roughness={0.8} />
            </mesh>
            {/* Top */}
            <mesh position={[0, 1.05, 0]}>
                <boxGeometry args={[0.65, 0.1, 0.55]} />
                <meshStandardMaterial color='#6a4a2a' />
            </mesh>
            {/* Status light */}
            <mesh position={[0.2, 0.7, 0.26]}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshStandardMaterial
                    color={COLORS.red}
                    emissive={COLORS.red}
                    emissiveIntensity={0.8}
                />
            </mesh>
            {/* Steam */}
            <mesh ref={steamRef} position={[0, 1.5, 0]}>
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshStandardMaterial color='white' transparent opacity={0.15} />
            </mesh>
        </group>
    );
}

// ─── Server Rack ───
function ServerRack({ onClick }: { onClick?: () => void }) {
    const ledsRef = useRef<(THREE.Mesh | null)[]>([]);

    useFrame(({ clock }) => {
        ledsRef.current.forEach((led, i) => {
            if (led && i < SERVER_RACK_ACTIVE_LEDS) {
                const mat = led.material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * (2 + i * 0.5)) * 0.3;
            }
        });
    });

    return (
        <group position={PROPS.serverRack} onClick={onClick}>
            {/* Rack body */}
            <mesh position={[0, 1.2, 0]}>
                <boxGeometry args={[0.8, 2.4, 0.6]} />
                <meshStandardMaterial color='#1a1a28' roughness={0.9} />
            </mesh>
            {/* Rack units */}
            {[0.4, 0.7, 1.0, 1.3, 1.6, 1.9, 2.2].map((y, i) => (
                <group key={i}>
                    <mesh position={[0, y, 0.31]}>
                        <boxGeometry args={[0.65, 0.2, 0.02]} />
                        <meshStandardMaterial color='#0a0a15' />
                    </mesh>
                    {/* LED */}
                    <mesh
                        ref={(el) => { ledsRef.current[i] = el; }}
                        position={[0.25, y, 0.33]}
                    >
                        <sphereGeometry args={[0.025, 6, 6]} />
                        <meshStandardMaterial
                            color={i < SERVER_RACK_ACTIVE_LEDS ? COLORS.green : COLORS.surface1}
                            emissive={i < SERVER_RACK_ACTIVE_LEDS ? COLORS.green : COLORS.surface1}
                            emissiveIntensity={i < SERVER_RACK_ACTIVE_LEDS ? 0.8 : 0.1}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

// ─── Plant ───
function Plant({ position }: { position: [number, number, number] }) {
    return (
        <group position={position}>
            {/* Pot */}
            <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.2, 0.15, 0.4, 8]} />
                <meshStandardMaterial color='#4a3a2a' roughness={0.9} />
            </mesh>
            {/* Foliage */}
            <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.35, 8, 8]} />
                <meshStandardMaterial color='#166534' roughness={0.9} />
            </mesh>
            <mesh position={[-0.15, 0.5, 0.1]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color='#15803d' roughness={0.9} />
            </mesh>
            <mesh position={[0.15, 0.55, -0.05]}>
                <sphereGeometry args={[0.22, 8, 8]} />
                <meshStandardMaterial color='#166534' roughness={0.9} />
            </mesh>
        </group>
    );
}

// ─── Main Furniture Export ───
export function OfficeFurniture({
    onClickDesk,
    onClickCoffee,
    onClickServer,
}: {
    onClickDesk?: (agentId: AgentId) => void;
    onClickCoffee?: () => void;
    onClickServer?: () => void;
}) {
    return (
        <group>
            {/* Desks */}
            {DESK_CONFIGS.map(cfg => (
                <Desk
                    key={cfg.agentId}
                    agentId={cfg.agentId}
                    position={cfg.position}
                    onClick={() => onClickDesk?.(cfg.agentId)}
                />
            ))}

            {/* Coffee Machine */}
            <CoffeeMachine onClick={onClickCoffee} />

            {/* Server Rack */}
            <ServerRack onClick={onClickServer} />

            {/* Plants */}
            <Plant position={PROPS.plant1} />
            <Plant position={PROPS.plant2} />
        </group>
    );
}
