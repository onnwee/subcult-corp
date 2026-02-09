// Stage Filters — filter panel for the signal feed
'use client';

import { AGENTS } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

export interface FilterState {
    agentId: string | null;
    kind: string | null;
}

const EVENT_KINDS = [
    { value: 'conversation_turn', label: 'Turns' },
    { value: 'conversation_started', label: 'Started' },
    { value: 'conversation_completed', label: 'Completed' },
    { value: 'conversation_failed', label: 'Failed' },
    { value: 'proposal_created', label: 'Proposals' },
    { value: 'mission_started', label: 'Missions' },
    { value: 'step_completed', label: 'Steps' },
];

const AGENT_DOT_COLORS: Record<string, string> = {
    opus: 'bg-violet-400',
    brain: 'bg-cyan-400',
    observer: 'bg-amber-400',
};

export function StageFilters({
    filters,
    onChange,
}: {
    filters: FilterState;
    onChange: (f: FilterState) => void;
}) {
    return (
        <div className='flex flex-wrap gap-2'>
            {/* Agent filter */}
            <div className='flex gap-1 rounded-lg bg-zinc-800/50 p-1 border border-zinc-700/50'>
                <FilterButton
                    active={filters.agentId === null}
                    onClick={() => onChange({ ...filters, agentId: null })}
                >
                    All agents
                </FilterButton>
                {(Object.keys(AGENTS) as AgentId[]).map(id => (
                    <FilterButton
                        key={id}
                        active={filters.agentId === id}
                        onClick={() => onChange({ ...filters, agentId: id })}
                    >
                        <span
                            className={`inline-block h-2 w-2 rounded-full ${AGENT_DOT_COLORS[id] ?? 'bg-zinc-500'}`}
                        />
                        {AGENTS[id].displayName}
                    </FilterButton>
                ))}
            </div>

            {/* Event kind filter */}
            <div className='flex gap-1 rounded-lg bg-zinc-800/50 p-1 border border-zinc-700/50'>
                <FilterButton
                    active={filters.kind === null}
                    onClick={() => onChange({ ...filters, kind: null })}
                >
                    All events
                </FilterButton>
                {EVENT_KINDS.map(k => (
                    <FilterButton
                        key={k.value}
                        active={filters.kind === k.value}
                        onClick={() => onChange({ ...filters, kind: k.value })}
                    >
                        {k.label}
                    </FilterButton>
                ))}
            </div>
        </div>
    );
}

function FilterButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active ?
                    'bg-zinc-700 text-zinc-100'
                :   'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
        >
            {children}
        </button>
    );
}
