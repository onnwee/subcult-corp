// AudienceStats — minimal stat bar for /live page
'use client';

import { useState, useEffect } from 'react';
import { AGENTS, AGENT_IDS } from '@/lib/agents';

interface PublicStats {
    totalEvents: number;
    activeMissions: number;
    totalSessions: number;
    memoriesByAgent: Record<string, number>;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
    return (
        <div className='flex items-center gap-2'>
            <span className='text-[10px] uppercase tracking-widest text-zinc-600 font-mono'>
                {label}
            </span>
            <span className='text-sm font-semibold text-zinc-300 tabular-nums font-mono'>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
        </div>
    );
}

export function AudienceStats() {
    const [stats, setStats] = useState<PublicStats | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function fetchStats() {
            try {
                const res = await fetch('/api/ops/stats');
                if (!res.ok || cancelled) return;
                const data = (await res.json()) as PublicStats;
                if (!cancelled) setStats(data);
            } catch {
                // Non-fatal
            }
        }

        fetchStats();
        const interval = setInterval(fetchStats, 60_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    const totalMemories =
        stats ?
            Object.values(stats.memoriesByAgent).reduce((a, b) => a + b, 0)
        :   0;

    return (
        <div className='flex items-center gap-6 px-1 py-3 border-b border-zinc-800/50 flex-wrap'>
            {/* Agent dots */}
            <div className='flex items-center gap-1'>
                {AGENT_IDS.map(id => (
                    <span
                        key={id}
                        className='inline-block h-2 w-2 rounded-full'
                        style={{ backgroundColor: AGENTS[id].color }}
                        title={AGENTS[id].displayName}
                    />
                ))}
                <span className='text-[10px] text-zinc-600 font-mono ml-1.5'>
                    6 agents
                </span>
            </div>

            {/* Divider */}
            <span className='h-3 w-px bg-zinc-800' />

            {stats ?
                <>
                    <StatPill
                        label='conversations'
                        value={stats.totalSessions}
                    />
                    <StatPill label='memories' value={totalMemories} />
                    <StatPill label='events' value={stats.totalEvents} />
                </>
            :   <span className='text-[10px] text-zinc-700 font-mono animate-pulse'>
                    loading...
                </span>
            }
        </div>
    );
}
