// office3d/OfficeLighting.tsx — ambient + ceiling spot lights
'use client';

import { COLORS } from './constants';

export function OfficeLighting({ period }: { period: 'day' | 'dusk' | 'night' }) {
    const ambientIntensity = period === 'night' ? 0.15 : period === 'dusk' ? 0.25 : 0.35;
    const spotIntensity = period === 'night' ? 0.6 : period === 'dusk' ? 0.8 : 1.0;

    return (
        <group>
            {/* Ambient base */}
            <ambientLight intensity={ambientIntensity} color='#b4befe' />

            {/* Hemisphere for soft environment lighting */}
            <hemisphereLight
                args={['#1e3a5f', '#1e1e2e', 0.3]}
            />

            {/* Ceiling lights — 4 evenly spaced */}
            {[-6, -2, 2, 6].map((x, i) => (
                <group key={i}>
                    {/* Light fixture mesh */}
                    <mesh position={[x, 3.85, 0]}>
                        <boxGeometry args={[1.2, 0.08, 0.4]} />
                        <meshStandardMaterial color={COLORS.surface1} />
                    </mesh>
                    {/* Light bulb glow */}
                    <mesh position={[x, 3.78, 0]}>
                        <boxGeometry args={[0.8, 0.04, 0.2]} />
                        <meshStandardMaterial
                            color={COLORS.yellow}
                            emissive={COLORS.yellow}
                            emissiveIntensity={0.5}
                        />
                    </mesh>
                    {/* Spot pointing down */}
                    <pointLight
                        position={[x, 3.5, 0]}
                        intensity={spotIntensity}
                        distance={8}
                        decay={2}
                        color={COLORS.yellow}
                    />
                </group>
            ))}

            {/* Directional fill */}
            <directionalLight
                position={[5, 8, 5]}
                intensity={0.15}
                color='#cdd6f4'
            />
        </group>
    );
}
