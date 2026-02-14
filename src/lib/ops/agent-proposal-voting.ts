// Agent Proposal Voting — agents review and vote on proposed agent designs
// Integrates with roundtable sessions for structured voting debates.
import { sql, jsonb } from '@/lib/db';
import { emitEventAndCheckReactions } from './events';
import { logger } from '@/lib/logger';
import type {
    AgentProposal,
    AgentProposalStatus,
    AgentProposalVote,
} from './agent-designer';

const log = logger.child({ module: 'agent-proposal-voting' });

// ─── Submit a vote ───

export async function submitVote(
    proposalId: string,
    agentId: string,
    vote: 'approve' | 'reject',
    reasoning: string,
): Promise<void> {
    // Fetch proposal
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) {
        throw new Error(`Proposal "${proposalId}" not found`);
    }

    if (proposal.status !== 'voting') {
        throw new Error(
            `Proposal is not in voting status (current: ${proposal.status})`,
        );
    }

    // Parse existing votes
    const votes: Record<string, AgentProposalVote> =
        typeof proposal.votes === 'object' && proposal.votes !== null ?
            (proposal.votes as Record<string, AgentProposalVote>)
        :   {};

    // Update vote (allows re-voting — latest vote wins)
    const isUpdate = !!votes[agentId];
    votes[agentId] = { vote, reasoning };

    await sql`
        UPDATE ops_agent_proposals
        SET votes = ${jsonb(votes)}
        WHERE id = ${proposalId}
    `;

    log.info('Vote submitted', {
        proposalId,
        agentId,
        vote,
        isUpdate,
    });

    // Emit event
    await emitEventAndCheckReactions({
        agent_id: agentId,
        kind: 'agent_proposal_vote',
        title: `${agentId} votes ${vote} on agent proposal "${proposal.agent_name}"`,
        summary: reasoning,
        tags: ['agent-designer', 'vote', proposal.agent_name],
        metadata: {
            proposalId,
            agentName: proposal.agent_name,
            vote,
        },
    });
}

// ─── Tally votes ───

export interface VoteTally {
    approvals: number;
    rejections: number;
    total: number;
    totalAgents: number;
    voters: Record<string, AgentProposalVote>;
}

export async function tallyVotes(proposalId: string): Promise<VoteTally> {
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT votes FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) throw new Error(`Proposal "${proposalId}" not found`);

    const votes: Record<string, AgentProposalVote> =
        typeof proposal.votes === 'object' && proposal.votes !== null ?
            (proposal.votes as Record<string, AgentProposalVote>)
        :   {};

    const approvals = Object.values(votes).filter(
        v => v.vote === 'approve',
    ).length;
    const rejections = Object.values(votes).filter(
        v => v.vote === 'reject',
    ).length;

    // Count total registered agents
    const [agentCount] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_registry WHERE active = true
    `;

    return {
        approvals,
        rejections,
        total: Object.keys(votes).length,
        totalAgents: agentCount.count,
        voters: votes,
    };
}

// ─── Check consensus ───

export interface ConsensusResult {
    result: 'approved' | 'rejected' | 'pending';
    approvals: number;
    rejections: number;
    totalAgents: number;
    quorumMet: boolean;
}

export async function checkConsensus(
    proposalId: string,
): Promise<ConsensusResult> {
    const tally = await tallyVotes(proposalId);

    // Majority = >50% of registered agents must approve
    const quorum = Math.ceil(tally.totalAgents / 2);
    const quorumMet = tally.total >= quorum;

    // 3+ rejections = blocked (matching governance pattern)
    if (tally.rejections >= 3) {
        return {
            result: 'rejected',
            approvals: tally.approvals,
            rejections: tally.rejections,
            totalAgents: tally.totalAgents,
            quorumMet,
        };
    }

    // Majority approved
    if (tally.approvals > tally.totalAgents / 2) {
        return {
            result: 'approved',
            approvals: tally.approvals,
            rejections: tally.rejections,
            totalAgents: tally.totalAgents,
            quorumMet: true,
        };
    }

    return {
        result: 'pending',
        approvals: tally.approvals,
        rejections: tally.rejections,
        totalAgents: tally.totalAgents,
        quorumMet,
    };
}

// ─── Transition proposal to voting status ───

export async function transitionToVoting(
    proposalId: string,
    debateSessionId?: string,
): Promise<void> {
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) throw new Error(`Proposal "${proposalId}" not found`);
    if (proposal.status !== 'proposed') {
        throw new Error(
            `Cannot transition to voting from status "${proposal.status}"`,
        );
    }

    await sql`
        UPDATE ops_agent_proposals
        SET status = 'voting'
        WHERE id = ${proposalId}
    `;

    log.info('Proposal transitioned to voting', {
        proposalId,
        agentName: proposal.agent_name,
        debateSessionId,
    });
}

// ─── Finalize voting based on consensus ───

export async function finalizeVoting(
    proposalId: string,
): Promise<ConsensusResult> {
    const consensus = await checkConsensus(proposalId);

    if (consensus.result === 'pending') {
        return consensus;
    }

    const newStatus: AgentProposalStatus =
        consensus.result === 'approved' ? 'approved' : 'rejected';

    await sql`
        UPDATE ops_agent_proposals
        SET status = ${newStatus}, decided_at = NOW()
        WHERE id = ${proposalId}
        AND status = 'voting'
    `;

    // Fetch for event
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (proposal) {
        await emitEventAndCheckReactions({
            agent_id: proposal.proposed_by,
            kind:
                consensus.result === 'approved' ?
                    'agent_proposal_approved'
                :   'agent_proposal_rejected',
            title: `Agent proposal "${proposal.agent_name}" ${consensus.result}`,
            summary: `${consensus.approvals} approvals, ${consensus.rejections} rejections out of ${consensus.totalAgents} agents`,
            tags: ['agent-designer', consensus.result, proposal.agent_name],
            metadata: {
                proposalId,
                agentName: proposal.agent_name,
                ...consensus,
            },
        });

        log.info('Voting finalized', {
            proposalId,
            result: consensus.result,
            approvals: consensus.approvals,
            rejections: consensus.rejections,
        });
    }

    return consensus;
}

// ─── Build roundtable prompt for voting on a proposal ───

export async function createVotingRoundtablePrompt(
    proposalId: string,
): Promise<string> {
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) throw new Error(`Proposal "${proposalId}" not found`);

    const personality = proposal.personality as {
        tone?: string;
        traits?: string[];
        speaking_style?: string;
        emoji?: string;
    };

    return `## Agent Design Proposal Review

**Proposed by:** ${proposal.proposed_by}
**Proposed agent:** ${proposal.agent_name}
**Role:** ${proposal.agent_role}

### Personality
- **Tone:** ${personality.tone ?? 'unspecified'}
- **Traits:** ${(personality.traits ?? []).join(', ') || 'unspecified'}
- **Speaking style:** ${personality.speaking_style ?? 'unspecified'}
${personality.emoji ? `- **Symbol:** ${personality.emoji}` : ''}

### Skills
${(proposal.skills as string[]).map(s => `- ${s}`).join('\n') || '- (none specified)'}

### Rationale
${proposal.rationale}

---

**Your task:** Review this proposal. Consider:
1. Does the collective genuinely need this agent?
2. Does this agent duplicate existing capabilities?
3. Is the personality well-defined and complementary to the group?
4. Are the proposed skills concrete and actionable?

End your response with your vote: **APPROVE** or **REJECT**, followed by your reasoning.`;
}
