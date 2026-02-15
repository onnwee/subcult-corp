// Agent Designer — propose new agents for the collective
// Thaum (or any agent) analyzes gaps in the collective and generates agent proposals.
// Proposals are stored in ops_agent_proposals for voting and eventual spawning.
import { sql, jsonb } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { emitEventAndCheckReactions } from './events';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'agent-designer' });

// ─── Types ───

export interface AgentPersonality {
    tone: string;
    traits: string[];
    speaking_style: string;
    emoji?: string;
}

export interface AgentProposal {
    id: string;
    proposed_by: string;
    agent_name: string;
    agent_role: string;
    personality: AgentPersonality;
    skills: string[];
    rationale: string;
    status: AgentProposalStatus;
    votes: Record<string, AgentProposalVote>;
    human_approved: boolean | null;
    created_at: string;
    decided_at: string | null;
    spawned_at: string | null;
}

export type AgentProposalStatus =
    | 'proposed'
    | 'voting'
    | 'approved'
    | 'rejected'
    | 'spawned';

export interface AgentProposalVote {
    vote: 'approve' | 'reject';
    reasoning: string;
}

// ─── Generate a new agent proposal ───

export async function generateAgentProposal(
    proposerId: string,
): Promise<AgentProposal> {
    log.info('Generating agent proposal', { proposer: proposerId });

    // 1. Fetch current agent registry
    const agents = await sql<
        { agent_id: string; display_name: string; role: string }[]
    >`
        SELECT agent_id, display_name, role
        FROM ops_agent_registry
        WHERE active = true
        ORDER BY agent_id
    `;

    // 2. Fetch current skills coverage
    const skills = await sql<{ agent_id: string; skill_name: string }[]>`
        SELECT agent_id, skill_name
        FROM ops_agent_skills
        ORDER BY agent_id
    `;

    // 3. Fetch recent roundtable topics for context
    const recentSessions = await sql<
        { format: string; topic: string; participants: string[] }[]
    >`
        SELECT format, topic, participants
        FROM ops_roundtable_sessions
        WHERE status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 10
    `;

    // 4. Check for existing pending proposals (guard)
    const [pendingCount] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count
        FROM ops_agent_proposals
        WHERE status IN ('proposed', 'voting')
    `;

    if (pendingCount.count >= 2) {
        log.info('Skipping proposal — too many pending proposals', {
            pending: pendingCount.count,
        });
        throw new Error(
            `Cannot generate proposal: ${pendingCount.count} proposals already pending`,
        );
    }

    // 5. Build context for the LLM
    const agentRoster = agents
        .map(a => `- ${a.display_name} (${a.agent_id}): ${a.role}`)
        .join('\n');

    const skillMap = new Map<string, string[]>();
    for (const s of skills) {
        const list = skillMap.get(s.agent_id) ?? [];
        list.push(s.skill_name);
        skillMap.set(s.agent_id, list);
    }
    const skillCoverage = Array.from(skillMap.entries())
        .map(([id, sk]) => `- ${id}: ${sk.join(', ')}`)
        .join('\n');

    const recentTopics = recentSessions
        .map(s => `- [${s.format}] ${s.topic}`)
        .join('\n');

    const systemPrompt = `You are ${proposerId}, an agent in the SubCult collective. You have the ability to propose new agents to join the collective.

Analyze the current composition and identify gaps — missing capabilities, underserved domains, or personality dynamics that would strengthen the group.

Current agent roster:
${agentRoster}

Current skill coverage:
${skillCoverage || '(no skills data)'}

Recent roundtable topics:
${recentTopics || '(no recent sessions)'}

Rules:
- The proposed agent must fill a genuine gap — do not propose redundant agents.
- The name should be evocative and lowercase (like existing agents: chora, subrosa, thaum, praxis, mux, primus).
- The role should describe the agent's function in 1-2 words.
- Personality should define tone, traits, speaking style, and optionally an emoji symbol.
- Skills should be concrete and actionable (3-6 skills).
- The rationale must explain WHY the collective needs this agent NOW.

Respond with valid JSON only, no markdown fencing:
{
  "agent_name": "lowercase_name",
  "agent_role": "role_in_1_2_words",
  "personality": {
    "tone": "description of tone",
    "traits": ["trait1", "trait2", "trait3"],
    "speaking_style": "how this agent communicates",
    "emoji": "single emoji symbol"
  },
  "skills": ["skill1", "skill2", "skill3"],
  "rationale": "why the collective needs this agent"
}`;

    // 6. Call LLM
    const result = await llmGenerate({
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content:
                    'Analyze the collective and propose a new agent if a genuine gap exists.',
            },
        ],
        temperature: 0.85,
        maxTokens: 1500,
        trackingContext: {
            agentId: proposerId,
            context: 'agent_design',
        },
    });

    // 7. Parse response
    let parsed: {
        agent_name: string;
        agent_role: string;
        personality: AgentPersonality;
        skills: string[];
        rationale: string;
    };

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');
        parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
        log.error('Failed to parse agent proposal from LLM', {
            error: err,
            responsePreview: result.slice(0, 200),
        });
        throw new Error(
            `Failed to parse agent proposal: ${(err as Error).message}`,
        );
    }

    // Validate required fields
    if (!parsed.agent_name || !parsed.agent_role || !parsed.rationale) {
        throw new Error('LLM response missing required fields');
    }

    // Normalize
    const agentName = parsed.agent_name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

    // Validate normalized name is not empty
    if (!agentName || agentName.length === 0) {
        throw new Error(
            `Invalid agent_name: "${parsed.agent_name}" normalized to empty string`,
        );
    }

    // Check for name collision with existing agents
    const [existing] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count
        FROM ops_agent_registry
        WHERE agent_id = ${agentName}
    `;
    if (existing.count > 0) {
        throw new Error(`Agent "${agentName}" already exists in the registry`);
    }

    // Check for name collision with pending proposals
    const [pendingProposal] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count
        FROM ops_agent_proposals
        WHERE agent_name = ${agentName}
          AND status IN ('proposed', 'voting', 'approved')
    `;
    if (pendingProposal.count > 0) {
        throw new Error(
            `A proposal for agent "${agentName}" already exists and is pending`,
        );
    }

    // 8. Save proposal
    const proposalId = await saveProposal(
        {
            agent_name: agentName,
            agent_role: parsed.agent_role,
            personality: parsed.personality ?? {
                tone: 'neutral',
                traits: [],
                speaking_style: 'direct',
            },
            skills: parsed.skills ?? [],
            rationale: parsed.rationale,
        },
        proposerId,
    );

    // 9. Emit event
    await emitEventAndCheckReactions({
        agent_id: proposerId,
        kind: 'agent_proposal_created',
        title: `${proposerId} proposes new agent: ${agentName}`,
        summary: parsed.rationale,
        tags: ['agent-designer', 'proposal', agentName],
        metadata: {
            proposalId,
            agentName,
            agentRole: parsed.agent_role,
            proposer: proposerId,
        },
    });

    // 10. Return the saved proposal
    const proposal = await getProposalById(proposalId);
    if (!proposal) throw new Error('Failed to retrieve saved proposal');
    return proposal;
}

// ─── Save a proposal to the database ───

export async function saveProposal(
    proposal: {
        agent_name: string;
        agent_role: string;
        personality: AgentPersonality;
        skills: string[];
        rationale: string;
    },
    proposerId: string,
): Promise<string> {
    const [row] = await sql<[{ id: string }]>`
        INSERT INTO ops_agent_proposals
            (proposed_by, agent_name, agent_role, personality, skills, rationale)
        VALUES (
            ${proposerId},
            ${proposal.agent_name},
            ${proposal.agent_role},
            ${jsonb(proposal.personality)},
            ${jsonb(proposal.skills)},
            ${proposal.rationale}
        )
        RETURNING id
    `;

    log.info('Agent proposal saved', {
        id: row.id,
        proposer: proposerId,
        agentName: proposal.agent_name,
    });

    return row.id;
}

// ─── Query proposals ───

export async function getProposals(filters?: {
    status?: AgentProposalStatus;
    proposedBy?: string;
    limit?: number;
}): Promise<AgentProposal[]> {
    const limit = filters?.limit ?? 50;
    const status = filters?.status;
    const proposedBy = filters?.proposedBy;

    if (status && proposedBy) {
        return sql<AgentProposal[]>`
            SELECT * FROM ops_agent_proposals
            WHERE status = ${status} AND proposed_by = ${proposedBy}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;
    } else if (status) {
        return sql<AgentProposal[]>`
            SELECT * FROM ops_agent_proposals
            WHERE status = ${status}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;
    } else if (proposedBy) {
        return sql<AgentProposal[]>`
            SELECT * FROM ops_agent_proposals
            WHERE proposed_by = ${proposedBy}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;
    }

    return sql<AgentProposal[]>`
        SELECT * FROM ops_agent_proposals
        ORDER BY created_at DESC
        LIMIT ${limit}
    `;
}

// ─── Get a single proposal ───

export async function getProposalById(
    id: string,
): Promise<AgentProposal | null> {
    const [row] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${id}
    `;
    return row ?? null;
}

// ─── Update human approval ───

export async function setHumanApproval(
    proposalId: string,
    approved: boolean,
): Promise<void> {
    await sql`
        UPDATE ops_agent_proposals
        SET human_approved = ${approved}
        WHERE id = ${proposalId}
    `;

    log.info('Human approval set', { proposalId, approved });
}
