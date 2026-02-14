// Client-safe agent data — mirrors src/lib/agents.ts without server imports

export interface AgentInfo {
    id: string;
    displayName: string;
    role: string;
    color: string;
    description: string;
}

export const AGENT_DATA: Record<string, AgentInfo> = {
    chora: {
        id: 'chora',
        displayName: 'Chora',
        role: 'Analyst',
        color: '#b4befe',
        description:
            'Makes systems legible. Diagnoses structure, exposes assumptions.',
    },
    subrosa: {
        id: 'subrosa',
        displayName: 'Subrosa',
        role: 'Protector',
        color: '#f38ba8',
        description: 'Preserves agency. Evaluates risk, protects optionality.',
    },
    thaum: {
        id: 'thaum',
        displayName: 'Thaum',
        role: 'Innovator',
        color: '#cba6f7',
        description: 'Restores motion when thought stalls. Disrupts, reframes.',
    },
    praxis: {
        id: 'praxis',
        displayName: 'Praxis',
        role: 'Executor',
        color: '#a6e3a1',
        description:
            'Ends deliberation responsibly. Translates intent to action.',
    },
    mux: {
        id: 'mux',
        displayName: 'Mux',
        role: 'Operations',
        color: '#74c7ec',
        description:
            'Operational labor. Drafts, formats, transcribes, packages.',
    },
    primus: {
        id: 'primus',
        displayName: 'Primus',
        role: 'Sovereign',
        color: '#f5c2e7',
        description: 'Sovereign directive. Cold, strategic, minimal.',
    },
};

export const AGENT_IDS = Object.keys(AGENT_DATA);
