// Memory Distiller — extract structured memories from conversations
// Called after each roundtable conversation completes.
// Sends the full conversation to the LLM, asks it to extract insights/patterns/lessons,
// then writes them to ops_agent_memory with dedup via source_trace_id.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    ConversationTurnEntry,
    MemoryType,
    PairwiseDrift,
} from '../types';
import { llmGenerate } from '../llm';
import { writeMemory } from './memory';
import { applyPairwiseDrifts } from './relationships';

const MAX_MEMORIES_PER_CONVERSATION = 6;
const MIN_CONFIDENCE = 0.55;

interface ExtractedMemory {
    agent_id: string;
    type: MemoryType;
    content: string;
    confidence: number;
    tags: string[];
}

/**
 * Distill structured memories and relationship drift from a completed conversation.
 * Each participant may gain 0-2 memories from the discussion.
 * Agent pair affinities drift based on interaction quality.
 *
 * @returns Number of memories successfully written
 */
export async function distillConversationMemories(
    sb: SupabaseClient,
    sessionId: string,
    history: ConversationTurnEntry[],
): Promise<number> {
    if (history.length < 3) {
        // Too short — nothing meaningful to extract
        return 0;
    }

    const speakers = [...new Set(history.map(h => h.speaker))];

    // Format conversation for LLM
    const transcript = history
        .map(h => `${h.speaker}: ${h.dialogue}`)
        .join('\n');

    const prompt = buildDistillationPrompt(transcript, speakers);

    let rawResponse: string;
    try {
        rawResponse = await llmGenerate({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an analyst that extracts structured knowledge and relationship dynamics from conversations. Output valid JSON only.',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            maxTokens: 800,
        });
    } catch (err) {
        console.error(
            '[memory-distiller] LLM extraction failed:',
            (err as Error).message,
        );
        return 0;
    }

    // Parse combined response (memories + pairwise drift)
    const { memories, drifts } = parseCombinedResponse(rawResponse, speakers);

    // Write memories
    let written = 0;
    for (const mem of memories.slice(0, MAX_MEMORIES_PER_CONVERSATION)) {
        const id = await writeMemory(sb, {
            agent_id: mem.agent_id,
            type: mem.type,
            content: mem.content,
            confidence: mem.confidence,
            tags: [...mem.tags, 'conversation'],
            source_trace_id: `conversation:${sessionId}:${mem.agent_id}:${written}`,
        });

        if (id) written++;
    }

    // Apply relationship drifts
    if (drifts.length > 0) {
        try {
            const { applied } = await applyPairwiseDrifts(
                sb,
                drifts,
                sessionId,
            );
            console.log(
                `[memory-distiller] Applied ${applied} relationship drifts from session ${sessionId}`,
            );
        } catch (err) {
            console.error(
                '[memory-distiller] Drift application failed:',
                (err as Error).message,
            );
        }
    }

    console.log(
        `[memory-distiller] Wrote ${written} memories from session ${sessionId}`,
    );
    return written;
}

/**
 * Build the LLM prompt for memory extraction.
 */
function buildDistillationPrompt(
    transcript: string,
    speakers: string[],
): string {
    return `Analyze this conversation and extract: (1) key memories, and (2) relationship drift between participants.

CONVERSATION:
${transcript}

PARTICIPANTS: ${speakers.join(', ')}

MEMORY TYPES (use exactly these):
- insight: A new understanding or observation
- pattern: A recurring trend or behavior noticed
- strategy: A successful approach or tactic
- preference: A stated preference or opinion
- lesson: Something learned from a mistake or success

RULES FOR MEMORIES:
- Extract at most ${MAX_MEMORIES_PER_CONVERSATION} total memories across all participants
- Each memory must have confidence between 0.0 and 1.0 (higher = more certain)
- Only extract memories with confidence ≥ ${MIN_CONFIDENCE}
- Assign each memory to the agent who stated or demonstrated it
- Keep content under 200 characters
- Include 1-3 relevant tags per memory

RULES FOR RELATIONSHIP DRIFT:
- For each pair of participants who interacted meaningfully, output a drift value
- drift ranges from -0.03 (disagreement/conflict) to +0.03 (alignment/collaboration)
- Only include pairs where there was a notable interaction
- Include a brief reason for the drift

Respond with a JSON object (no markdown, no explanation):
{
  "memories": [
    {
      "agent_id": "opus",
      "type": "insight",
      "content": "Brief description of the insight",
      "confidence": 0.75,
      "tags": ["topic", "category"]
    }
  ],
  "pairwise_drift": [
    {
      "agent_a": "brain",
      "agent_b": "opus",
      "drift": 0.01,
      "reason": "aligned on priorities"
    }
  ]
}`;
}

/**
 * Parse the LLM response into validated memory objects and pairwise drifts.
 * Handles both the new combined format { memories, pairwise_drift }
 * and the legacy array format for backward compatibility.
 */
function parseCombinedResponse(
    raw: string,
    validSpeakers: string[],
): { memories: ExtractedMemory[]; drifts: PairwiseDrift[] } {
    // Try to extract JSON from the response
    let jsonStr = raw.trim();

    // Strip markdown code fences if present
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr
            .replace(/^```(?:json)?\n?/, '')
            .replace(/\n?```$/, '');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        console.error(
            '[memory-distiller] Failed to parse LLM response as JSON',
        );
        return { memories: [], drifts: [] };
    }

    // Handle combined format: { memories: [...], pairwise_drift: [...] }
    let rawMemories: unknown[];
    let rawDrifts: unknown[];

    if (typeof parsed === 'object' && parsed !== null && 'memories' in parsed) {
        const obj = parsed as Record<string, unknown>;
        rawMemories = Array.isArray(obj.memories) ? obj.memories : [];
        rawDrifts = Array.isArray(obj.pairwise_drift) ? obj.pairwise_drift : [];
    } else if (Array.isArray(parsed)) {
        // Legacy format: just an array of memories
        rawMemories = parsed;
        rawDrifts = [];
    } else {
        return { memories: [], drifts: [] };
    }

    const validTypes: MemoryType[] = [
        'insight',
        'pattern',
        'strategy',
        'preference',
        'lesson',
    ];

    const memories = rawMemories
        .filter(
            (item): item is ExtractedMemory =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as ExtractedMemory).agent_id === 'string' &&
                validSpeakers.includes((item as ExtractedMemory).agent_id) &&
                validTypes.includes((item as ExtractedMemory).type) &&
                typeof (item as ExtractedMemory).content === 'string' &&
                (item as ExtractedMemory).content.length > 0 &&
                (item as ExtractedMemory).content.length <= 200 &&
                typeof (item as ExtractedMemory).confidence === 'number' &&
                (item as ExtractedMemory).confidence >= MIN_CONFIDENCE &&
                (item as ExtractedMemory).confidence <= 1.0,
        )
        .map(item => ({
            agent_id: item.agent_id,
            type: item.type,
            content: item.content,
            confidence: Math.round(item.confidence * 100) / 100,
            tags:
                Array.isArray(item.tags) ?
                    item.tags.filter(
                        (t): t is string =>
                            typeof t === 'string' && t.length <= 50,
                    )
                :   [],
        }));

    const drifts = rawDrifts
        .filter(
            (item): item is PairwiseDrift =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as PairwiseDrift).agent_a === 'string' &&
                typeof (item as PairwiseDrift).agent_b === 'string' &&
                validSpeakers.includes((item as PairwiseDrift).agent_a) &&
                validSpeakers.includes((item as PairwiseDrift).agent_b) &&
                typeof (item as PairwiseDrift).drift === 'number' &&
                Math.abs((item as PairwiseDrift).drift) <= 0.03 &&
                typeof (item as PairwiseDrift).reason === 'string',
        )
        .map(item => ({
            agent_a: item.agent_a,
            agent_b: item.agent_b,
            drift: Math.round(item.drift * 1000) / 1000,
            reason: item.reason.substring(0, 200),
        }));

    return { memories, drifts };
}
