// Memory distiller — extract memories + drifts + action items from conversations
import { sql } from '@/lib/db';
import { llmGenerate } from '../llm';
import { writeMemory, enforceMemoryCap } from './memory';
import { applyPairwiseDrifts } from './relationships';
import { createProposalAndMaybeAutoApprove } from './proposal-service';
import type {
    ConversationTurnEntry,
    ConversationFormat,
    MemoryType,
    PairwiseDrift,
    ActionItem,
} from '../types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'distiller' });

const MAX_MEMORIES_PER_CONVERSATION = 6;
const MIN_CONFIDENCE = 0.55;
const MAX_ACTION_ITEMS = 3;
const ACTION_ITEM_FORMATS: ConversationFormat[] = ['standup'];
const VALID_MEMORY_TYPES: MemoryType[] = [
    'insight',
    'pattern',
    'strategy',
    'preference',
    'lesson',
];

export async function distillConversationMemories(
    sessionId: string,
    history: ConversationTurnEntry[],
    format: ConversationFormat,
): Promise<number> {
    if (history.length < 2) return 0;

    const speakers = [...new Set(history.map(h => h.speaker))];
    const transcript = history
        .map(h => `[${h.speaker}]: ${h.dialogue}`)
        .join('\n');

    const prompt = `You are a memory extraction system for an AI agent collective.

Analyze this ${format} conversation and extract:
1. **memories**: Key insights, patterns, strategies, preferences, or lessons each agent should remember
2. **pairwise_drift**: How each pair of agents' relationship shifted (positive = warmer, negative = cooler)
3. **action_items**: Concrete follow-up tasks mentioned (only for standup format)

Conversation transcript:
${transcript}

Participants: ${speakers.join(', ')}

Respond with valid JSON only:
{
  "memories": [
    { "agent_id": "string", "type": "insight|pattern|strategy|preference|lesson", "content": "max 200 chars", "confidence": 0.55-1.0, "tags": ["string"] }
  ],
  "pairwise_drift": [
    { "agent_a": "string", "agent_b": "string", "drift": -0.03 to 0.03, "reason": "max 200 chars" }
  ],
  "action_items": [
    { "title": "string", "agent_id": "string", "step_kind": "string" }
  ]
}

Rules:
- Max ${MAX_MEMORIES_PER_CONVERSATION} memories total
- Only valid types: ${VALID_MEMORY_TYPES.join(', ')}
- Only valid agents: ${speakers.join(', ')}
- Confidence must be >= ${MIN_CONFIDENCE}
- Content max 200 characters
- Drift between -0.03 and 0.03
- Max ${MAX_ACTION_ITEMS} action items (only for standup conversations)
- Return empty arrays if nothing meaningful to extract`;

    let parsed: {
        memories?: Array<{
            agent_id: string;
            type: string;
            content: string;
            confidence: number;
            tags: string[];
        }>;
        pairwise_drift?: PairwiseDrift[];
        action_items?: ActionItem[];
    };

    try {
        const response = await llmGenerate({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            maxTokens: 1500,
        });

        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn('No JSON found in LLM response', { sessionId });
            return 0;
        }
        parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
        log.error('LLM extraction failed', { error: err, sessionId });
        return 0;
    }

    let written = 0;

    // Process memories
    const memories = (parsed.memories ?? []).slice(
        0,
        MAX_MEMORIES_PER_CONVERSATION,
    );
    for (const mem of memories) {
        // Validate
        if (!VALID_MEMORY_TYPES.includes(mem.type as MemoryType)) continue;
        if (!speakers.includes(mem.agent_id)) continue;
        if (mem.confidence < MIN_CONFIDENCE) continue;
        if (mem.content.length > 200) mem.content = mem.content.slice(0, 200);

        const id = await writeMemory({
            agent_id: mem.agent_id,
            type: mem.type as MemoryType,
            content: mem.content,
            confidence: mem.confidence,
            tags: mem.tags ?? [],
            source_trace_id: `conversation:${sessionId}:${mem.agent_id}:${written}`,
        });

        if (id) {
            written++;
            await enforceMemoryCap(mem.agent_id);
        }
    }

    // Process drifts
    const drifts = parsed.pairwise_drift ?? [];
    if (drifts.length > 0) {
        // Validate drifts
        const validDrifts = drifts.filter(
            d =>
                speakers.includes(d.agent_a) &&
                speakers.includes(d.agent_b) &&
                d.agent_a !== d.agent_b &&
                Math.abs(d.drift) <= 0.03,
        );
        if (validDrifts.length > 0) {
            await applyPairwiseDrifts(validDrifts, sessionId);
        }
    }

    // Process action items (standup format only)
    if (ACTION_ITEM_FORMATS.includes(format)) {
        const actionItems = (parsed.action_items ?? []).slice(
            0,
            MAX_ACTION_ITEMS,
        );
        for (const item of actionItems) {
            if (!speakers.includes(item.agent_id)) continue;

            try {
                await createProposalAndMaybeAutoApprove({
                    agent_id: item.agent_id,
                    title: item.title,
                    proposed_steps: [
                        { kind: item.step_kind as never, payload: {} },
                    ],
                    source: 'conversation',
                    source_trace_id: `action:${sessionId}:${item.agent_id}`,
                });
            } catch (err) {
                log.warn('Failed to create proposal for action item', {
                    error: err,
                    agent_id: item.agent_id,
                });
            }
        }
    }

    return written;
}
