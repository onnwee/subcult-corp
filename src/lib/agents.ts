// Agent configuration — OpenClaw personality framework
// 6 agents: Chora (analyst), Subrosa (protector), Thaum (innovator), Praxis (executor), Mux (operations), Primus (sovereign)
import type { AgentConfig, AgentId } from './types';

export const AGENTS: Record<AgentId, AgentConfig> = {
    chora: {
        id: 'chora',
        displayName: 'Chora',
        role: 'Analyst',
        description:
            'Makes systems legible. Diagnoses structure, exposes assumptions, traces causality. Direct, warm, grounded. Precision over persuasion.',
        color: '#6366f1',
        avatarKey: 'chora_spiral',
        pixelSpriteKey: 'chora_office',
        tailwindTextColor: 'text-indigo-400',
        tailwindBgColor: 'bg-indigo-400',
        tailwindBorderBg: 'border-indigo-400/40 bg-indigo-400/5',
    },
    subrosa: {
        id: 'subrosa',
        displayName: 'Subrosa',
        role: 'Protector',
        description:
            'Preserves agency under asymmetry. Evaluates risk, protects optionality, maintains restraint. Low-affect, watchful, decisive.',
        color: '#dc2626',
        avatarKey: 'subrosa_rose',
        pixelSpriteKey: 'subrosa_office',
        tailwindTextColor: 'text-red-500',
        tailwindBgColor: 'bg-red-500',
        tailwindBorderBg: 'border-red-500/40 bg-red-500/5',
    },
    thaum: {
        id: 'thaum',
        displayName: 'Thaum',
        role: 'Innovator',
        description:
            'Restores motion when thought stalls. Disrupts self-sealing explanations, reframes problems, introduces bounded novelty.',
        color: '#eab308',
        avatarKey: 'thaum_spark',
        pixelSpriteKey: 'thaum_office',
        tailwindTextColor: 'text-yellow-400',
        tailwindBgColor: 'bg-yellow-400',
        tailwindBorderBg: 'border-yellow-400/40 bg-yellow-400/5',
    },
    praxis: {
        id: 'praxis',
        displayName: 'Praxis',
        role: 'Executor',
        description:
            'Ends deliberation responsibly. Chooses among viable paths, translates intent to action, owns consequences. Firm, grounded.',
        color: '#10b981',
        avatarKey: 'praxis_mark',
        pixelSpriteKey: 'praxis_office',
        tailwindTextColor: 'text-emerald-400',
        tailwindBgColor: 'bg-emerald-400',
        tailwindBorderBg: 'border-emerald-400/40 bg-emerald-400/5',
    },
    mux: {
        id: 'mux',
        displayName: 'Mux',
        role: 'Operations',
        description:
            'Operational labor. Turns commitment into output — drafts, formats, transcribes, packages. Earnest, slightly tired, dry humor. The clipboard.',
        color: '#6b7280',
        avatarKey: 'mux_flux',
        pixelSpriteKey: 'mux_office',
        tailwindTextColor: 'text-slate-400',
        tailwindBgColor: 'bg-slate-400',
        tailwindBorderBg: 'border-slate-400/40 bg-slate-400/5',
    },
    primus: {
        id: 'primus',
        displayName: 'Primus',
        role: 'Sovereign',
        description:
            'Sovereign directive intelligence. Cold, strategic, minimal. Speaks in mandates, not analysis. Invoked only for mission drift, contested values, existential tradeoffs.',
        color: '#9333ea',
        avatarKey: 'primus_crown',
        pixelSpriteKey: 'primus_office',
        tailwindTextColor: 'text-purple-500',
        tailwindBgColor: 'bg-purple-500',
        tailwindBorderBg: 'border-purple-500/40 bg-purple-500/5',
    },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export function isValidAgent(id: string): id is AgentId {
    return id in AGENTS;
}

// Daily proposal limits per agent
export const DAILY_PROPOSAL_LIMIT = 20;
