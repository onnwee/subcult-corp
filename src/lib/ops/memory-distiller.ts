// Memory Distiller — extract structured memories from conversations
// Called after each roundtable conversation completes.
// Sends the full conversation to the LLM, asks it to extract insights/patterns/lessons,
// then writes them to ops_agent_memory with dedup via source_trace_id.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    ActionItem,
    ConversationFormat,
    ConversationTurnEntry,
    MemoryType,
    PairwiseDrift,
} from '../types';
import { llmGenerate } from '../llm';
import { writeMemory } from './memory';
import { applyPairwiseDrifts } from './relationships';
import { createProposalAndMaybeAutoApprove } from './proposal-service';

const MAX_MEMORIES_PER_CONVERSATION = 6;
const MIN_CONFIDENCE = 0.55;
const MAX_ACTION_ITEMS_PER_CONVERSATION = 3;

/** Formats where action items should be extracted */
const ACTION_ITEM_FORMATS: ConversationFormat[] = ['standup'];

interface ExtractedMemory {
    agent_id: string;
    type: MemoryType;
    content: string;
    confidence: number;
    tags: string[];
}

/**
 * Distill structured memories, relationship drift, and action items
 * from a completed conversation.
 * Each participant may gain 0-2 memories from the discussion.
 * Agent pair affinities drift based on interaction quality.
 * For qualifying formats (standup), action items become proposals.
 *
 * @param format - The conversation format (standup/debate/watercooler).
 *                 If provided and qualifying, action items are extracted and
 *                 converted to proposals.
 * @returns Number of memories successfully written
 */
export async function distillConversationMemories(
    sb: SupabaseClient,
    sessionId: string,
    history: ConversationTurnEntry[],
    format?: ConversationFormat,
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

    const prompt = buildDistillationPrompt(
        transcript,
        speakers,
        format && ACTION_ITEM_FORMATS.includes(format),
    );

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

    // Parse combined response (memories + pairwise drift + action items)
    const { memories, drifts, actionItems } = parseCombinedResponse(
        rawResponse,
        speakers,
    );

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

    // Convert action items to proposals (for qualifying formats)
    if (
        actionItems.length > 0 &&
        format &&
        ACTION_ITEM_FORMATS.includes(format)
    ) {
        const validStepKinds = [
            'scan_signals',
            'draft_tweet',
            'post_tweet',
            'analyze',
            'review',
            'research',
        ];
        let proposalsCreated = 0;

        for (const item of actionItems.slice(
            0,
            MAX_ACTION_ITEMS_PER_CONVERSATION,
        )) {
            try {
                const stepKind =
                    validStepKinds.includes(item.step_kind) ?
                        item.step_kind
                    :   'research';
                const result = await createProposalAndMaybeAutoApprove(sb, {
                    agent_id: item.agent_id,
                    title: item.title,
                    description: `Action item from ${format} conversation`,
                    proposed_steps: [
                        { kind: stepKind as 'research', payload: {} },
                    ],
                    source: 'conversation',
                    source_trace_id: `action_item:${sessionId}:${proposalsCreated}`,
                });

                if (result.success) proposalsCreated++;
            } catch (err) {
                console.error(
                    '[memory-distiller] Action item proposal failed:',
                    (err as Error).message,
                );
            }
        }

        if (proposalsCreated > 0) {
            console.log(
                `[memory-distiller] Created ${proposalsCreated} proposals from action items in session ${sessionId}`,
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
 * When includeActionItems is true, the prompt also asks for action items.
 */
function buildDistillationPrompt(
    transcript: string,
    speakers: string[],
    includeActionItems: boolean = false,
): string {
    let prompt = `Analyze this conversation and extract: (1) key memories, and (2) relationship drift between participants.

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
- Only extract memories with confidence >= ${MIN_CONFIDENCE}
- Assign each memory to the agent who stated or demonstrated it
- Keep content under 200 characters
- Include 1-3 relevant tags per memory

RULES FOR RELATIONSHIP DRIFT:
- For each pair of participants who interacted meaningfully, output a drift value
- drift ranges from -0.03 (disagreement/conflict) to +0.03 (alignment/collaboration)
- Only include pairs where there was a notable interaction
- Include a brief reason for the drift`;

    if (includeActionItems) {
        prompt += `

RULES FOR ACTION ITEMS:
- Extract up to ${MAX_ACTION_ITEMS_PER_CONVERSATION} actionable tasks that emerged from the conversation
- Each action item should have a clear title, an assigned agent_id, and a step_kind
- step_kind must be one of: scan_signals, draft_tweet, post_tweet, analyze, review, research
- Only include items that were explicitly discussed or agreed upon
- Assign to the agent best suited for the task based on the conversation`;
    }

    prompt += `

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
  ]`;

    if (includeActionItems) {
        prompt += `,
  "action_items": [
    {
      "title": "Research trending topics in AI",
      "agent_id": "brain",
      "step_kind": "research"
    }
  ]`;
    }

    prompt += `
}`;

    return prompt;
}

/**
 * Parse the LLM response into validated memory objects, pairwise drifts,
 * and action items.
 * Handles both the new combined format { memories, pairwise_drift, action_items }
 * and the legacy array format for backward compatibility.
 */
function parseCombinedResponse(
    raw: string,
    validSpeakers: string[],
): {
    memories: ExtractedMemory[];
    drifts: PairwiseDrift[];
    actionItems: ActionItem[];
} {
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
        return { memories: [], drifts: [], actionItems: [] };
    }

    // Handle combined format: { memories: [...], pairwise_drift: [...], action_items: [...] }
    let rawMemories: unknown[];
    let rawDrifts: unknown[];
    let rawActionItems: unknown[];

    if (typeof parsed === 'object' && parsed !== null && 'memories' in parsed) {
        const obj = parsed as Record<string, unknown>;
        rawMemories = Array.isArray(obj.memories) ? obj.memories : [];
        rawDrifts = Array.isArray(obj.pairwise_drift) ? obj.pairwise_drift : [];
        rawActionItems =
            Array.isArray(obj.action_items) ? obj.action_items : [];
    } else if (Array.isArray(parsed)) {
        // Legacy format: just an array of memories
        rawMemories = parsed;
        rawDrifts = [];
        rawActionItems = [];
    } else {
        return { memories: [], drifts: [], actionItems: [] };
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

    const actionItems: ActionItem[] = rawActionItems
        .filter(
            (item): item is ActionItem =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as ActionItem).title === 'string' &&
                (item as ActionItem).title.length > 0 &&
                (item as ActionItem).title.length <= 200 &&
                typeof (item as ActionItem).agent_id === 'string' &&
                validSpeakers.includes((item as ActionItem).agent_id) &&
                typeof (item as ActionItem).step_kind === 'string',
        )
        .map(item => ({
            title: item.title.substring(0, 200),
            agent_id: item.agent_id,
            step_kind: item.step_kind,
        }));

    return { memories, drifts, actionItems };
}
