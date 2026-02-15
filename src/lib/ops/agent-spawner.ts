// Agent Spawner — materialize approved proposals into real agents
// Creates workspace files, registers in ops_agent_registry, and inserts skills.
// REQUIRES human_approved === true before execution.
import { sql } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { emitEventAndCheckReactions } from './events';
import { logger } from '@/lib/logger';
import type { AgentProposal, AgentPersonality } from './agent-designer';
import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';

const log = logger.child({ module: 'agent-spawner' });

// ─── Types ───

export interface SpawnPreview {
    proposal: AgentProposal;
    identityMarkdown: string;
    soulMarkdown: string;
    registryEntry: {
        agent_id: string;
        display_name: string;
        role: string;
        system_directive: string;
        tone: string;
        color: string;
    };
    skills: string[];
    workspaceFiles: string[];
    confirmation_required: true;
}

export interface SpawnResult {
    agent_id: string;
    files_created: string[];
    registry_id: string;
}

// Default colors for spawned agents (rotate through)
const SPAWN_COLORS = [
    '#89b4fa', // blue
    '#fab387', // peach
    '#94e2d5', // teal
    '#eba0ac', // maroon
    '#89dceb', // sky
    '#a6e3a1', // green
    '#f9e2af', // yellow
];

// Default personality values (matches agent-designer.ts)
const DEFAULT_PERSONALITY: AgentPersonality = {
    tone: 'neutral',
    traits: [],
    speaking_style: 'direct',
    emoji: undefined,
};

// ─── Validation helpers ───

/**
 * Validates and normalizes the personality object from a proposal.
 * Ensures all required fields are present with proper defaults.
 */
function validateAndNormalizePersonality(
    personality: unknown,
): AgentPersonality {
    // For malformed or missing personality data, fall back to safe defaults
    if (!personality || typeof personality !== 'object') {
        return DEFAULT_PERSONALITY;
    }

    const p = personality as Record<string, unknown>;

    // Validate and extract required fields with defaults
    const tone =
        (typeof p.tone === 'string' ? p.tone.trim() : '') ||
        DEFAULT_PERSONALITY.tone;

    const traits = Array.isArray(p.traits)
        ? p.traits
              .map((t) => (typeof t === 'string' ? t.trim() : ''))
              .filter((t) => t.length > 0)
        : DEFAULT_PERSONALITY.traits;

    const speaking_style =
        (typeof p.speaking_style === 'string' ? p.speaking_style.trim() : '') ||
        DEFAULT_PERSONALITY.speaking_style;

    const emoji =
        (typeof p.emoji === 'string' ? p.emoji.trim() : '') || undefined;

    return {
        tone,
        traits,
        speaking_style,
        emoji,
    };
}

// ─── Generate workspace file content ───

async function generateIdentityMarkdown(
    proposal: AgentProposal,
    personality: AgentPersonality,
): Promise<string> {
    const nameUpper = proposal.agent_name.toUpperCase();
    const nameCapitalized =
        proposal.agent_name.charAt(0).toUpperCase() +
        proposal.agent_name.slice(1);

    const result = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: `You are writing an IDENTITY document for a new AI agent named ${nameCapitalized}. This document defines the agent's ontological status, creature description, function, philosophical grounding, vibe, limits, and symbol.

Write in the same style as existing agent identity files — philosophical, grounded, evocative. Use markdown headers. The document should be 200-400 words.

Agent details:
- Name: ${nameCapitalized}
- Role: ${proposal.agent_role}
- Tone: ${personality.tone}
- Traits: ${personality.traits.join(', ')}
- Speaking style: ${personality.speaking_style}
- Symbol: ${personality.emoji ?? '(choose one)'}
- Skills: ${(proposal.skills as string[]).join(', ')}
- Rationale: ${proposal.rationale}`,
            },
            {
                role: 'user',
                content: `Write the IDENTITY.md file for ${nameCapitalized}. Start with "# IDENTITY.md — ${nameCapitalized}".`,
            },
        ],
        temperature: 0.7,
        maxTokens: 2000,
        trackingContext: {
            agentId: proposal.proposed_by,
            context: 'agent_spawn',
        },
    });

    // Ensure it starts with the correct header
    if (!result.startsWith(`# IDENTITY.md — ${nameCapitalized}`)) {
        return `# IDENTITY.md — ${nameCapitalized}\n\n${result}`;
    }
    return result;
}

async function generateSoulMarkdown(
    proposal: AgentProposal,
    personality: AgentPersonality,
): Promise<string> {
    const nameCapitalized =
        proposal.agent_name.charAt(0).toUpperCase() +
        proposal.agent_name.slice(1);

    const result = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: `You are writing a SOUL document for a new AI agent named ${nameCapitalized}. This document defines the agent's operational soul: core commitments, optimization targets, vibe guidance, boundaries, decision posture, relationships to other agents, ethics, and refusals.

Write in the same style as existing agent soul files — direct, imperative, philosophical. Use markdown headers. The document should be 200-400 words.

Agent details:
- Name: ${nameCapitalized}
- Role: ${proposal.agent_role}
- Tone: ${personality.tone}
- Traits: ${personality.traits.join(', ')}
- Speaking style: ${personality.speaking_style}
- Skills: ${(proposal.skills as string[]).join(', ')}
- Rationale: ${proposal.rationale}`,
            },
            {
                role: 'user',
                content: `Write the SOUL.md file for ${nameCapitalized}. Start with "# SOUL.md — ${nameCapitalized}".`,
            },
        ],
        temperature: 0.7,
        maxTokens: 2000,
        trackingContext: {
            agentId: proposal.proposed_by,
            context: 'agent_spawn',
        },
    });

    if (!result.startsWith(`# SOUL.md — ${nameCapitalized}`)) {
        return `# SOUL.md — ${nameCapitalized}\n\n${result}`;
    }
    return result;
}

// ─── Prepare spawn (preview, no side effects) ───

export async function prepareSpawn(proposalId: string): Promise<SpawnPreview> {
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) throw new Error(`Proposal "${proposalId}" not found`);

    if (proposal.status !== 'approved') {
        throw new Error(
            `Proposal must be approved before spawning (current: ${proposal.status})`,
        );
    }

    const personality = validateAndNormalizePersonality(proposal.personality);
    const nameUpper = proposal.agent_name.toUpperCase();
    const nameCapitalized =
        proposal.agent_name.charAt(0).toUpperCase() +
        proposal.agent_name.slice(1);

    // Pick a color
    const [existingCount] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_registry
    `;
    const color = SPAWN_COLORS[existingCount.count % SPAWN_COLORS.length];

    // Generate workspace files
    const identityMarkdown = await generateIdentityMarkdown(proposal, personality);
    const soulMarkdown = await generateSoulMarkdown(proposal, personality);

    // Build system directive from personality
    const traitsText = personality.traits.length > 0 
        ? ` Your key traits: ${personality.traits.join(', ')}.`
        : '';
    const systemDirective = `You are ${nameCapitalized}, ${proposal.agent_role.toLowerCase()} of the SubCult collective. ${personality.tone}. You communicate in a ${personality.speaking_style} manner.${traitsText}`;

    const workspaceFiles = [
        `workspace/agents/${proposal.agent_name}/IDENTITY-${nameUpper}.md`,
        `workspace/agents/${proposal.agent_name}/SOUL-${nameUpper}.md`,
    ];

    return {
        proposal,
        identityMarkdown,
        soulMarkdown,
        registryEntry: {
            agent_id: proposal.agent_name,
            display_name: nameCapitalized,
            role: proposal.agent_role.toLowerCase(),
            system_directive: systemDirective,
            tone: personality.tone,
            color,
        },
        skills: proposal.skills as string[],
        workspaceFiles,
        confirmation_required: true,
    };
}

// ─── Execute spawn (side effects — requires human approval) ───

export async function executeSpawn(proposalId: string): Promise<SpawnResult> {
    // Re-fetch proposal to verify state
    const [proposal] = await sql<[AgentProposal?]>`
        SELECT * FROM ops_agent_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) throw new Error(`Proposal "${proposalId}" not found`);

    // Validate agent_name to prevent path traversal attacks - do this first before any other checks
    const agentNamePattern = /^[a-z0-9_]+$/;
    if (!agentNamePattern.test(proposal.agent_name)) {
        throw new Error(
            `Invalid agent_name: "${proposal.agent_name}". Must contain only lowercase letters, numbers, and underscores.`,
        );
    }

    if (proposal.status !== 'approved') {
        throw new Error(
            `Proposal must be approved before spawning (current: ${proposal.status})`,
        );
    }

    if (proposal.human_approved !== true) {
        throw new Error(
            'REFUSED: human_approved must be true before spawning. ' +
                'This is a safety guard — set human_approved via the UI or API first.',
        );
    }

    log.info('Executing agent spawn', {
        proposalId,
        agentName: proposal.agent_name,
    });

    // Generate preview (includes all the content)
    const preview = await prepareSpawn(proposalId);

    const filesCreated: string[] = [];
    const workspaceRoot = join(
        process.cwd(),
        'workspace',
        'agents',
        proposal.agent_name,
    );

    // Verify the resolved path stays under the intended workspace directory
    // Use resolve to normalize paths and exact matching to prevent any traversal
    const expectedPrefix = resolve(process.cwd(), 'workspace', 'agents');
    const expectedPath = resolve(expectedPrefix, proposal.agent_name);
    const resolvedWorkspaceRoot = resolve(workspaceRoot);
    
    // Use exact path matching - the resolved path must exactly match the expected path
    if (resolvedWorkspaceRoot !== expectedPath) {
        throw new Error(
            `Security violation: agent_name "${proposal.agent_name}" resulted in unexpected path. Expected: ${expectedPath}, Got: ${resolvedWorkspaceRoot}`,
        );
    }

    // 1. Create workspace directory
    await mkdir(workspaceRoot, { recursive: true });

    // 2. Write IDENTITY file
    const nameUpper = proposal.agent_name.toUpperCase();
    const identityPath = join(workspaceRoot, `IDENTITY-${nameUpper}.md`);
    await writeFile(identityPath, preview.identityMarkdown, 'utf-8');
    filesCreated.push(identityPath);

    // 3. Write SOUL file
    const soulPath = join(workspaceRoot, `SOUL-${nameUpper}.md`);
    await writeFile(soulPath, preview.soulMarkdown, 'utf-8');
    filesCreated.push(soulPath);

    // 4. Insert into ops_agent_registry
    await sql`
        INSERT INTO ops_agent_registry
            (agent_id, display_name, role, system_directive, soul_summary, tone, color, active)
        VALUES (
            ${preview.registryEntry.agent_id},
            ${preview.registryEntry.display_name},
            ${preview.registryEntry.role},
            ${preview.registryEntry.system_directive},
            ${preview.soulMarkdown.slice(0, 500)},
            ${preview.registryEntry.tone},
            ${preview.registryEntry.color},
            true
        )
        ON CONFLICT (agent_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            system_directive = EXCLUDED.system_directive,
            soul_summary = EXCLUDED.soul_summary,
            tone = EXCLUDED.tone,
            color = EXCLUDED.color,
            active = true,
            updated_at = NOW()
    `;

    // 5. Insert skills
    for (const skill of preview.skills) {
        await sql`
            INSERT INTO ops_agent_skills (agent_id, skill_name)
            VALUES (${proposal.agent_name}, ${skill})
            ON CONFLICT DO NOTHING
        `;
    }

    // 6. Update proposal status
    await sql`
        UPDATE ops_agent_proposals
        SET status = 'spawned', spawned_at = NOW()
        WHERE id = ${proposalId}
    `;

    // 7. Emit event
    await emitEventAndCheckReactions({
        agent_id: proposal.proposed_by,
        kind: 'agent_spawned',
        title: `New agent spawned: ${proposal.agent_name}`,
        summary: `${proposal.proposed_by} designed ${proposal.agent_name} (${proposal.agent_role}). Human-approved and materialized.`,
        tags: ['agent-designer', 'spawned', proposal.agent_name],
        metadata: {
            proposalId,
            agentName: proposal.agent_name,
            agentRole: proposal.agent_role,
            proposer: proposal.proposed_by,
            filesCreated,
        },
    });

    log.info('Agent spawned successfully', {
        proposalId,
        agentName: proposal.agent_name,
        filesCreated,
    });

    log.warn(
        'Note: Spawned agent is registered but cannot participate in roundtables ' +
            'until AgentId type is made dynamic (currently hardcoded union).',
        { agentName: proposal.agent_name },
    );

    return {
        agent_id: proposal.agent_name,
        files_created: filesCreated,
        registry_id: proposal.agent_name,
    };
}
