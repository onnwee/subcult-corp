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
        color: '#b4befe',
        avatarKey: 'chora_spiral',
        pixelSpriteKey: 'chora_office',
        tailwindTextColor: 'text-accent-lavender',
        tailwindBgColor: 'bg-accent-lavender',
        tailwindBorderBg: 'border-accent-lavender/40 bg-accent-lavender/5',
    },
    subrosa: {
        id: 'subrosa',
        displayName: 'Subrosa',
        role: 'Protector',
        description:
            'Preserves agency under asymmetry. Evaluates risk, protects optionality, maintains restraint. Low-affect, watchful, decisive.',
        color: '#f38ba8',
        avatarKey: 'subrosa_rose',
        pixelSpriteKey: 'subrosa_office',
        tailwindTextColor: 'text-accent-red',
        tailwindBgColor: 'bg-accent-red',
        tailwindBorderBg: 'border-accent-red/40 bg-accent-red/5',
    },
    thaum: {
        id: 'thaum',
        displayName: 'Thaum',
        role: 'Innovator',
        description:
            'Restores motion when thought stalls. Disrupts self-sealing explanations, reframes problems, introduces bounded novelty.',
        color: '#cba6f7',
        avatarKey: 'thaum_spark',
        pixelSpriteKey: 'thaum_office',
        tailwindTextColor: 'text-accent',
        tailwindBgColor: 'bg-accent',
        tailwindBorderBg: 'border-accent/40 bg-accent/5',
    },
    praxis: {
        id: 'praxis',
        displayName: 'Praxis',
        role: 'Executor',
        description:
            'Ends deliberation responsibly. Chooses among viable paths, translates intent to action, owns consequences. Firm, grounded.',
        color: '#a6e3a1',
        avatarKey: 'praxis_mark',
        pixelSpriteKey: 'praxis_office',
        tailwindTextColor: 'text-accent-green',
        tailwindBgColor: 'bg-accent-green',
        tailwindBorderBg: 'border-accent-green/40 bg-accent-green/5',
    },
    mux: {
        id: 'mux',
        displayName: 'Mux',
        role: 'Operations',
        description:
            'Operational labor. Turns commitment into output — drafts, formats, transcribes, packages. Earnest, slightly tired, dry humor. The clipboard.',
        color: '#74c7ec',
        avatarKey: 'mux_flux',
        pixelSpriteKey: 'mux_office',
        tailwindTextColor: 'text-accent-sapphire',
        tailwindBgColor: 'bg-accent-sapphire',
        tailwindBorderBg: 'border-accent-sapphire/40 bg-accent-sapphire/5',
    },
    primus: {
        id: 'primus',
        displayName: 'Primus',
        role: 'Sovereign',
        description:
            'Sovereign directive intelligence. Cold, strategic, minimal. Speaks in mandates, not analysis. Invoked only for mission drift, contested values, existential tradeoffs.',
        color: '#f5c2e7',
        avatarKey: 'primus_crown',
        pixelSpriteKey: 'primus_office',
        tailwindTextColor: 'text-accent-pink',
        tailwindBgColor: 'bg-accent-pink',
        tailwindBorderBg: 'border-accent-pink/40 bg-accent-pink/5',
    },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export function isValidAgent(id: string): id is AgentId {
    return id in AGENTS;
}

// Daily proposal limits per agent
export const DAILY_PROPOSAL_LIMIT = 20;
