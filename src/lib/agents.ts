// Agent configuration — starting with 3 agents: coordinator, executor, observer
import type { AgentConfig, AgentId } from './types';

export const AGENTS: Record<AgentId, AgentConfig> = {
    opus: {
        id: 'opus',
        displayName: 'Opus',
        role: 'Coordinator',
        description:
            'Project coordinator. Prioritizes work, approves proposals, and keeps the team aligned. Direct, results-oriented.',
    },
    brain: {
        id: 'brain',
        displayName: 'Brain',
        role: 'Executor',
        description:
            'Analytical executor. Researches topics, drafts content, runs analyses. Data-driven and methodical.',
    },
    observer: {
        id: 'observer',
        displayName: 'Observer',
        role: 'Observer',
        description:
            'System observer. Monitors performance, reviews outcomes, spots patterns. Cautious and detail-oriented.',
    },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export function isValidAgent(id: string): id is AgentId {
    return id in AGENTS;
}

// Daily proposal limits per agent
export const DAILY_PROPOSAL_LIMIT = 20;
