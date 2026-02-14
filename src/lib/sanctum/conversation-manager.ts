// Sanctum conversation state manager
// Persists chat sessions and messages to PostgreSQL
import { sql, jsonb } from '@/lib/db';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'sanctum-conversation' });

// ─── Types ───

export type ConversationMode = 'open' | 'direct' | 'whisper';

export interface Conversation {
    id: string;
    userId: string;
    title: string | null;
    mode: ConversationMode;
    targetAgent: string | null;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface Message {
    id: string;
    conversationId: string;
    role: 'user' | 'agent';
    agentId: string | null;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface MessageInput {
    role: 'user' | 'agent';
    agentId?: string;
    content: string;
    metadata?: Record<string, unknown>;
}

// ─── Conversation Management ───

/**
 * Get the user's active conversation or create a new one.
 */
export async function getOrCreateConversation(
    userId: string,
    mode: ConversationMode = 'open',
    targetAgent?: string,
): Promise<Conversation> {
    // For whisper mode, look for an existing whisper conversation with the same agent
    if (mode === 'whisper' && targetAgent) {
        const [existing] = await sql<Conversation[]>`
            SELECT id, user_id as "userId", title, mode, target_agent as "targetAgent",
                   message_count as "messageCount", created_at as "createdAt", updated_at as "updatedAt"
            FROM ops_sanctum_conversations
            WHERE user_id = ${userId}
              AND mode = 'whisper'
              AND target_agent = ${targetAgent}
            ORDER BY updated_at DESC
            LIMIT 1
        `;
        if (existing) return existing;
    }

    // For open/direct, find the most recent non-whisper conversation
    if (mode !== 'whisper') {
        const [existing] = await sql<Conversation[]>`
            SELECT id, user_id as "userId", title, mode, target_agent as "targetAgent",
                   message_count as "messageCount", created_at as "createdAt", updated_at as "updatedAt"
            FROM ops_sanctum_conversations
            WHERE user_id = ${userId}
              AND mode != 'whisper'
            ORDER BY updated_at DESC
            LIMIT 1
        `;
        if (existing) return existing;
    }

    // Create new conversation
    return createConversation(userId, mode, targetAgent);
}

/**
 * Create a new conversation.
 */
export async function createConversation(
    userId: string,
    mode: ConversationMode = 'open',
    targetAgent?: string,
): Promise<Conversation> {
    const [row] = await sql<Conversation[]>`
        INSERT INTO ops_sanctum_conversations (user_id, mode, target_agent)
        VALUES (${userId}, ${mode}, ${targetAgent ?? null})
        RETURNING id, user_id as "userId", title, mode, target_agent as "targetAgent",
                  message_count as "messageCount", created_at as "createdAt", updated_at as "updatedAt"
    `;

    log.info('Conversation created', {
        conversationId: row.id,
        userId,
        mode,
        targetAgent,
    });
    return row;
}

/**
 * Add a message to a conversation. Auto-generates title from first user message.
 */
export async function addMessage(
    conversationId: string,
    input: MessageInput,
): Promise<Message> {
    const [msg] = await sql<Message[]>`
        INSERT INTO ops_sanctum_messages (conversation_id, role, agent_id, content, metadata)
        VALUES (
            ${conversationId},
            ${input.role},
            ${input.agentId ?? null},
            ${input.content},
            ${jsonb(input.metadata ?? {})}
        )
        RETURNING id, conversation_id as "conversationId", role, agent_id as "agentId",
                  content, metadata, created_at as "createdAt"
    `;

    // Update conversation: message count + updated_at
    await sql`
        UPDATE ops_sanctum_conversations
        SET message_count = message_count + 1,
            updated_at = now()
        WHERE id = ${conversationId}
    `;

    // Auto-generate title from first user message
    if (input.role === 'user') {
        await sql`
            UPDATE ops_sanctum_conversations
            SET title = ${input.content.slice(0, 80)}
            WHERE id = ${conversationId}
              AND title IS NULL
        `;
    }

    return msg;
}

/**
 * Get conversation history in chronological order.
 */
export async function getHistory(
    conversationId: string,
    limit: number = 100,
): Promise<Message[]> {
    return sql<Message[]>`
        SELECT id, conversation_id as "conversationId", role, agent_id as "agentId",
               content, metadata, created_at as "createdAt"
        FROM ops_sanctum_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at ASC
        LIMIT ${limit}
    `;
}

/**
 * Build an LLM-compatible message history from a conversation.
 * Takes the last N messages and formats them for the LLM context window.
 */
export async function buildLLMContext(
    conversationId: string,
    windowSize: number = 50,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await sql<
        Array<{ role: string; agent_id: string | null; content: string }>
    >`
        SELECT role, agent_id, content
        FROM ops_sanctum_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at DESC
        LIMIT ${windowSize}
    `;

    // Reverse to chronological order
    messages.reverse();

    return messages.map(m => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content:
            m.role === 'agent' && m.agent_id ?
                `[${m.agent_id}] ${m.content}`
            :   m.content,
    }));
}

/**
 * Reset conversation — creates a new one for the user.
 */
export async function resetConversation(userId: string): Promise<Conversation> {
    log.info('Conversation reset', { userId });
    return createConversation(userId, 'open');
}

/**
 * Get a conversation by ID.
 */
export async function getConversation(
    conversationId: string,
): Promise<Conversation | null> {
    const [row] = await sql<Conversation[]>`
        SELECT id, user_id as "userId", title, mode, target_agent as "targetAgent",
               message_count as "messageCount", created_at as "createdAt", updated_at as "updatedAt"
        FROM ops_sanctum_conversations
        WHERE id = ${conversationId}
    `;
    return row ?? null;
}

/**
 * List recent conversations for a user.
 */
export async function listConversations(
    userId: string,
    limit: number = 20,
): Promise<Conversation[]> {
    return sql<Conversation[]>`
        SELECT id, user_id as "userId", title, mode, target_agent as "targetAgent",
               message_count as "messageCount", created_at as "createdAt", updated_at as "updatedAt"
        FROM ops_sanctum_conversations
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT ${limit}
    `;
}

/**
 * Update conversation mode (e.g. switching from open to direct).
 */
export async function updateConversationMode(
    conversationId: string,
    mode: ConversationMode,
    targetAgent?: string,
): Promise<void> {
    await sql`
        UPDATE ops_sanctum_conversations
        SET mode = ${mode},
            target_agent = ${targetAgent ?? null},
            updated_at = now()
        WHERE id = ${conversationId}
    `;
}
