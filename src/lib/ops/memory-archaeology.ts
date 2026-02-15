// Memory Archaeology — deep analysis of collective memory patterns
// Agents perform "archaeological digs" to discover patterns, contradictions,
// emergence, echoes, and personality drift across agent memories.
import { sql, jsonb } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { emitEvent } from './events';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const log = logger.child({ module: 'memory-archaeology' });

// ─── Types ───

export type FindingType =
    | 'pattern' // recurring themes or behaviors across memories
    | 'contradiction' // memories that conflict with each other
    | 'emergence' // new behaviors not present in older memories
    | 'echo' // phrases or ideas that reappear across contexts
    | 'drift'; // how an agent's perspective has shifted over time

export interface ArchaeologyConfig {
    agent_id?: string; // specific agent or all agents
    time_range?: { from: Date; to: Date }; // optional time window
    finding_types?: FindingType[]; // limit analysis scope
    max_memories?: number; // limit per analysis (default 100)
}

export interface Finding {
    finding_type: FindingType;
    title: string;
    description: string;
    evidence: Array<{ memory_id: string; excerpt: string; relevance: string }>;
    confidence: number;
    related_agents: string[];
}

export interface DigResult {
    dig_id: string;
    agent_id: string;
    findings: Finding[];
    memories_analyzed: number;
}

export interface DigSummary {
    dig_id: string;
    agent_id: string;
    finding_count: number;
    finding_types: string[];
    started_at: string;
}

export interface StoredFinding {
    id: string;
    dig_id: string;
    agent_id: string;
    finding_type: FindingType;
    title: string;
    description: string;
    evidence: Array<{ memory_id: string; excerpt: string; relevance: string }>;
    confidence: number;
    time_span: { from: string; to: string } | null;
    related_agents: string[];
    metadata: Record<string, unknown>;
    created_at: string;
}

// ─── Constants ───

const DEFAULT_MAX_MEMORIES = 100;
const MEMORIES_PER_BATCH = 25;
const ANALYSIS_TEMPERATURE = 0.7;
const ANALYSIS_MAX_TOKENS = 2000;

// Token estimation constants for overflow detection
const CHARS_PER_TOKEN_ESTIMATE = 4; // Rough approximation: ~4 characters per token
const TOKEN_WARNING_THRESHOLD = 8000; // Warn if estimated input exceeds this

// ─── Main Engine ───

/**
 * Perform an archaeological dig — analyze agent memories for patterns,
 * contradictions, emergence, echoes, and drift.
 */
export async function performDig(
    config: ArchaeologyConfig,
): Promise<DigResult> {
    const digId = crypto.randomUUID();
    const agentId = config.agent_id ?? 'system';
    const maxMemories = config.max_memories ?? DEFAULT_MAX_MEMORIES;

    log.info('Starting archaeological dig', { digId, agentId, maxMemories });

    // 1. Fetch memories matching config
    const memories = await fetchMemoriesForDig(config, maxMemories);

    if (memories.length < 3) {
        log.info('Not enough memories for archaeology', {
            digId,
            available: memories.length,
        });
        return {
            dig_id: digId,
            agent_id: agentId,
            findings: [],
            memories_analyzed: 0,
        };
    }

    // 2. Chunk memories into batches for LLM analysis
    const batches: (typeof memories)[] = [];
    for (let i = 0; i < memories.length; i += MEMORIES_PER_BATCH) {
        batches.push(memories.slice(i, i + MEMORIES_PER_BATCH));
    }

    // 3. Analyze each batch
    const allFindings: Finding[] = [];
    for (const batch of batches) {
        const findings = await analyzeBatch(
            batch,
            agentId,
            config.finding_types,
        );
        allFindings.push(...findings);
    }

    // 4. Compute time span from analyzed memories
    const timestamps = memories.map(m => new Date(m.created_at).getTime());
    const timeSpan = {
        from: new Date(Math.min(...timestamps)).toISOString(),
        to: new Date(Math.max(...timestamps)).toISOString(),
    };

    // 5. Store findings in ops_memory_archaeology
    for (const finding of allFindings) {
        await sql`
            INSERT INTO ops_memory_archaeology
                (dig_id, agent_id, finding_type, title, description, evidence, confidence, time_span, related_agents, metadata)
            VALUES (
                ${digId},
                ${agentId},
                ${finding.finding_type},
                ${finding.title},
                ${finding.description},
                ${jsonb(finding.evidence)},
                ${finding.confidence},
                ${jsonb(timeSpan)},
                ${finding.related_agents},
                ${jsonb({})}
            )
        `;
    }

    // 6. Emit event
    await emitEvent({
        agent_id: agentId,
        kind: 'memory_archaeology_complete',
        title: `${agentId} completed archaeological dig`,
        summary: `Found ${allFindings.length} findings across ${memories.length} memories`,
        tags: ['archaeology', 'memory-analysis'],
        metadata: {
            dig_id: digId,
            finding_count: allFindings.length,
            memories_analyzed: memories.length,
            finding_types: [...new Set(allFindings.map(f => f.finding_type))],
        },
    });

    log.info('Archaeological dig completed', {
        digId,
        agentId,
        findingCount: allFindings.length,
        memoriesAnalyzed: memories.length,
    });

    return {
        dig_id: digId,
        agent_id: agentId,
        findings: allFindings,
        memories_analyzed: memories.length,
    };
}

// ─── Memory Fetching ───

interface MemoryRow {
    id: string;
    agent_id: string;
    type: string;
    content: string;
    confidence: number;
    tags: string[];
    created_at: string;
}

async function fetchMemoriesForDig(
    config: ArchaeologyConfig,
    maxMemories: number,
): Promise<MemoryRow[]> {
    const { agent_id, time_range } = config;

    // Truncate content to prevent excessive token usage (max 2000 chars per memory)
    return sql<MemoryRow[]>`
        SELECT
            id,
            agent_id,
            type,
            CASE
                WHEN LENGTH(content) > 2000 THEN LEFT(content, 2000) || '...[truncated]'
                ELSE content
            END as content,
            confidence,
            tags,
            created_at
        FROM ops_agent_memory
        WHERE superseded_by IS NULL
        ${agent_id ? sql`AND agent_id = ${agent_id}` : sql``}
        ${time_range?.from ? sql`AND created_at >= ${time_range.from.toISOString()}` : sql``}
        ${time_range?.to ? sql`AND created_at <= ${time_range.to.toISOString()}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${maxMemories}
    `;
}

// ─── LLM Analysis ───

async function analyzeBatch(
    memories: MemoryRow[],
    agentId: string,
    findingTypes?: FindingType[],
): Promise<Finding[]> {
    const typesLabel =
        findingTypes?.length ?
            findingTypes.join(', ')
        :   'pattern, contradiction, emergence, echo, drift';

    const memorySummary = memories
        .map(
            (m, i) =>
                `[${i + 1}] Agent: ${m.agent_id} | Type: ${m.type} | Confidence: ${m.confidence} | Tags: ${m.tags.join(', ') || 'none'} | Date: ${new Date(m.created_at).toISOString().slice(0, 10)}\n${m.content}`,
        )
        .join('\n\n');

    // Rough token estimation (4 chars ≈ 1 token) to warn about potential overflow
    const estimatedInputTokens = Math.ceil(
        memorySummary.length / CHARS_PER_TOKEN_ESTIMATE,
    );
    if (estimatedInputTokens > TOKEN_WARNING_THRESHOLD) {
        log.warn('High token count in archaeology batch', {
            agentId,
            estimatedInputTokens,
            memoryCount: memories.length,
            recommendation: 'Consider reducing batch size',
        });
    }

    const systemPrompt = `You are a memory archaeologist for the SubCult AI collective. Your task is to perform deep analysis of agent memories, looking for hidden patterns, contradictions, emergent behaviors, recurring echoes, and personality drift.

Analyze the provided memories and identify findings of these types: ${typesLabel}

Finding type definitions:
- **pattern**: Recurring themes, behaviors, or ideas that appear across multiple memories
- **contradiction**: Memories that conflict with each other or represent opposing viewpoints held by the same or different agents
- **emergence**: New behaviors, ideas, or perspectives that appear in recent memories but were absent earlier
- **echo**: Specific phrases, metaphors, or ideas that reappear across different contexts or time periods
- **drift**: How an agent's perspective, tone, or beliefs have shifted over time

For each finding, provide:
1. The finding type
2. A concise title (5-10 words)
3. A detailed description (2-4 sentences)
4. Evidence: which memory numbers (from the list) support this finding, with a brief excerpt and relevance note
5. Confidence (0.0 to 1.0) — how certain you are about this finding
6. Related agents — which agent IDs are involved

Respond with valid JSON only:
{
  "findings": [
    {
      "finding_type": "pattern|contradiction|emergence|echo|drift",
      "title": "short descriptive title",
      "description": "detailed explanation",
      "evidence": [
        { "memory_index": 1, "excerpt": "relevant quote", "relevance": "why this supports the finding" }
      ],
      "confidence": 0.8,
      "related_agents": ["agent_id1", "agent_id2"]
    }
  ]
}

Rules:
- Only report genuine findings backed by evidence from the provided memories
- Each finding must reference at least 2 memories as evidence
- Be specific — vague findings are not useful
- Confidence should reflect the strength of evidence
- If you find nothing meaningful, return { "findings": [] }`;

    const result = await llmGenerate({
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Analyze these ${memories.length} memories for archaeological findings:\n\n${memorySummary}`,
            },
        ],
        temperature: ANALYSIS_TEMPERATURE,
        maxTokens: ANALYSIS_MAX_TOKENS,
        trackingContext: {
            agentId,
            context: 'memory_archaeology',
        },
    });

    if (!result?.trim()) {
        log.warn('Archaeology analysis returned empty', { agentId });
        return [];
    }

    // Parse LLM response
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn('No JSON found in archaeology response', {
                responsePreview: result.slice(0, 200),
            });
            return [];
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            findings: Array<{
                finding_type: string;
                title: string;
                description: string;
                evidence: Array<{
                    memory_index: number;
                    excerpt: string;
                    relevance: string;
                }>;
                confidence: number;
                related_agents: string[];
            }>;
        };

        // Validate JSON structure
        if (!parsed.findings || !Array.isArray(parsed.findings)) {
            log.warn('Invalid JSON structure in archaeology response', {
                hasFindings: !!parsed.findings,
                isArray: Array.isArray(parsed.findings),
                keys: Object.keys(parsed),
            });
            return [];
        }

        // Map memory_index back to memory_id and validate
        const validTypes = new Set<string>([
            'pattern',
            'contradiction',
            'emergence',
            'echo',
            'drift',
        ]);

        return parsed.findings
            .filter(
                f => validTypes.has(f.finding_type) && f.title && f.description,
            )
            .map(f => {
                const evidenceWithWarnings = (f.evidence ?? [])
                    .map(e => {
                        const memory = memories[e.memory_index - 1];
                        if (!memory) {
                            log.warn(
                                'LLM referenced invalid memory_index in evidence',
                                {
                                    memory_index: e.memory_index,
                                    available_count: memories.length,
                                    finding_title: f.title,
                                },
                            );
                        }
                        return {
                            memory_id: memory?.id ?? 'unknown',
                            excerpt: e.excerpt ?? '',
                            relevance: e.relevance ?? '',
                        };
                    })
                    .filter(e => e.memory_id !== 'unknown');

                // Warn if all evidence was filtered out
                if (f.evidence?.length > 0 && evidenceWithWarnings.length === 0) {
                    log.warn('All evidence filtered due to invalid memory indices', {
                        finding_title: f.title,
                        evidence_count: f.evidence.length,
                    });
                }

                return {
                    finding_type: f.finding_type as FindingType,
                    title: f.title,
                    description: f.description,
                    evidence: evidenceWithWarnings,
                    confidence: Math.max(0, Math.min(1, f.confidence ?? 0.5)),
                    related_agents: f.related_agents ?? [],
                };
            });
    } catch (err) {
        log.error('Failed to parse archaeology findings', {
            error: err,
            responsePreview: result.slice(0, 300),
        });
        return [];
    }
}

// ─── Queries ───

/** Get summary of past digs, grouped by dig_id */
export async function getDigHistory(limit = 20): Promise<DigSummary[]> {
    return sql<DigSummary[]>`
        SELECT
            dig_id,
            agent_id,
            COUNT(*)::int as finding_count,
            array_agg(DISTINCT finding_type) as finding_types,
            MIN(created_at) as started_at
        FROM ops_memory_archaeology
        GROUP BY dig_id, agent_id
        ORDER BY MIN(created_at) DESC
        LIMIT ${limit}
    `;
}

/** Get all findings for a specific dig */
export async function getFindings(digId: string): Promise<StoredFinding[]> {
    return sql<StoredFinding[]>`
        SELECT * FROM ops_memory_archaeology
        WHERE dig_id = ${digId}
        ORDER BY confidence DESC
    `;
}

/** Get the latest findings across all digs */
export async function getLatestFindings(limit = 10): Promise<StoredFinding[]> {
    return sql<StoredFinding[]>`
        SELECT * FROM ops_memory_archaeology
        ORDER BY created_at DESC
        LIMIT ${limit}
    `;
}

/** Get findings that reference a specific memory_id in their evidence */
export async function getFindingsForMemory(
    memoryId: string,
): Promise<StoredFinding[]> {
    return sql<StoredFinding[]>`
        SELECT * FROM ops_memory_archaeology
        WHERE evidence @> ${jsonb([{ memory_id: memoryId }])}
        ORDER BY confidence DESC
    `;
}

/** Check when the last dig was performed */
export async function getLastDigTimestamp(): Promise<Date | null> {
    const [row] = await sql<[{ latest: string | null }]>`
        SELECT MAX(created_at) as latest FROM ops_memory_archaeology
    `;
    return row?.latest ? new Date(row.latest) : null;
}
