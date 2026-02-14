#!/usr/bin/env node
// Sanctum WebSocket server — standalone entry point
// Run: node --import=tsx scripts/sanctum-server/server.mjs
// or via Docker Compose as a separate process
import 'dotenv/config';
import { createSanctumServer } from '../../src/lib/sanctum/ws-server.ts';
import {
    getOrCreateConversation,
    addMessage,
    getHistory,
    buildLLMContext,
    resetConversation,
    updateConversationMode,
} from '../../src/lib/sanctum/conversation-manager.ts';
import {
    routeMessage,
    parseIntent,
} from '../../src/lib/sanctum/agent-router.ts';
import {
    detectSummons,
    executeSummon,
    generateCrossTalk,
} from '../../src/lib/sanctum/cross-talk.ts';
import {
    enqueueConversation,
    orchestrateConversation,
} from '../../src/lib/roundtable/orchestrator.ts';
import { AGENTS, AGENT_IDS } from '../../src/lib/agents.ts';
import { createLogger } from '../../src/lib/logger.ts';

const log = createLogger({ module: 'sanctum-server' });
const PORT = parseInt(process.env.SANCTUM_WS_PORT ?? '3011', 10);

const server = createSanctumServer(PORT);

// ─── Message Handlers ───

server.onMessage(async (client, msg) => {
    switch (msg.type) {
        case 'chat.send':
            await handleChatSend(client, msg);
            break;

        case 'chat.history':
            await handleChatHistory(client, msg);
            break;

        case 'typing.start':
            server.broadcast({
                type: 'typing.indicator',
                payload: { userId: client.userId, typing: true },
            });
            break;

        case 'typing.stop':
            server.broadcast({
                type: 'typing.indicator',
                payload: { userId: client.userId, typing: false },
            });
            break;

        case 'presence.query':
            server.sendTo(client.id, {
                type: 'presence.update',
                id: msg.id,
                payload: {
                    agents: AGENT_IDS.map(id => ({
                        id,
                        displayName: AGENTS[id].displayName,
                        role: AGENTS[id].role,
                        color: AGENTS[id].color,
                        status: 'idle',
                    })),
                },
            });
            break;
    }
});

async function handleChatSend(client, msg) {
    const { message, conversationId: convIdOverride } = msg.payload;
    if (!message || typeof message !== 'string') {
        server.sendTo(client.id, {
            type: 'error',
            id: msg.id,
            payload: { message: 'Missing message field' },
        });
        return;
    }

    const userId = client.userId || 'anon';
    const intent = parseIntent(message);

    // Get or create conversation
    let conversation;
    if (intent.mode === 'whisper' && intent.agents.length > 0) {
        conversation = await getOrCreateConversation(
            userId,
            'whisper',
            intent.agents[0],
        );
    } else if (convIdOverride && typeof convIdOverride === 'string') {
        conversation = await getOrCreateConversation(userId);
    } else {
        conversation = await getOrCreateConversation(
            userId,
            intent.mode === 'direct' ? 'direct' : 'open',
            intent.mode === 'direct' ? intent.agents[0] : undefined,
        );
    }

    // Handle /reset
    if (message.trim() === '/reset') {
        conversation = await resetConversation(userId);
        server.sendTo(client.id, {
            type: 'chat.message',
            id: msg.id,
            payload: {
                conversationId: conversation.id,
                role: 'system',
                content: 'Conversation reset. A fresh start.',
            },
        });
        return;
    }

    // Handle /help
    if (message.trim() === '/help') {
        server.sendTo(client.id, {
            type: 'chat.message',
            id: msg.id,
            payload: {
                role: 'system',
                content: [
                    `**Sanctum Commands**`,
                    `• *@agent message* — Direct message to a specific agent`,
                    `• */whisper @agent message* — Private conversation with an agent`,
                    `• */roundtable topic* — Start a live roundtable discussion`,
                    `• */reset* — Start a fresh conversation`,
                    `• */help* — Show this help`,
                    ``,
                    `**Available Agents:** ${AGENT_IDS.map(id => `${AGENTS[id].displayName} (@${id})`).join(', ')}`,
                ].join('\n'),
            },
        });
        return;
    }

    // Persist user message
    await addMessage(conversation.id, {
        role: 'user',
        content: message,
    });

    // Handle /roundtable
    if (intent.mode === 'roundtable') {
        await handleRoundtable(
            client,
            msg,
            conversation.id,
            intent.processedMessage,
        );
        return;
    }

    // Send typing indicators for responding agents
    const respondingAgents = intent.agents;
    for (const agentId of respondingAgents) {
        server.sendTo(client.id, {
            type: 'typing.indicator',
            payload: {
                agentId,
                displayName: AGENTS[agentId].displayName,
                color: AGENTS[agentId].color,
                typing: true,
            },
        });
    }

    // Build conversation history for LLM context
    const llmContext = await buildLLMContext(conversation.id);

    // Route and generate responses
    const { route, responses } = await routeMessage(
        message,
        llmContext,
        userId,
    );

    // Send each response as it's ready
    for (const response of responses) {
        // Clear typing for this agent
        server.sendTo(client.id, {
            type: 'typing.indicator',
            payload: { agentId: response.agentId, typing: false },
        });

        // Persist agent message
        await addMessage(conversation.id, {
            role: 'agent',
            agentId: response.agentId,
            content: response.content,
            metadata: response.metadata,
        });

        // Send to client
        server.sendTo(client.id, {
            type: 'chat.message',
            id: msg.id,
            payload: {
                conversationId: conversation.id,
                agentId: response.agentId,
                displayName: AGENTS[response.agentId].displayName,
                role: AGENTS[response.agentId].role,
                color: AGENTS[response.agentId].color,
                content: response.content,
                metadata: response.metadata,
            },
        });
    }

    // Check for summons in responses
    for (const response of responses) {
        const summons = detectSummons(response.agentId, response.content);
        for (const summon of summons) {
            // Don't summon agents that already responded
            if (responses.some(r => r.agentId === summon.target)) continue;

            server.sendTo(client.id, {
                type: 'typing.indicator',
                payload: {
                    agentId: summon.target,
                    displayName: AGENTS[summon.target].displayName,
                    color: AGENTS[summon.target].color,
                    typing: true,
                },
            });

            const summonResponse = await executeSummon(summon, llmContext);

            server.sendTo(client.id, {
                type: 'typing.indicator',
                payload: { agentId: summon.target, typing: false },
            });

            await addMessage(conversation.id, {
                role: 'agent',
                agentId: summonResponse.agentId,
                content: summonResponse.content,
                metadata: {
                    ...summonResponse.metadata,
                    crossTalk: true,
                    replyTo: summonResponse.replyTo,
                },
            });

            server.sendTo(client.id, {
                type: 'chat.message',
                id: msg.id,
                payload: {
                    conversationId: conversation.id,
                    agentId: summonResponse.agentId,
                    displayName: AGENTS[summonResponse.agentId].displayName,
                    role: AGENTS[summonResponse.agentId].role,
                    color: AGENTS[summonResponse.agentId].color,
                    content: summonResponse.content,
                    crossTalk: true,
                    replyTo: summonResponse.replyTo,
                    metadata: summonResponse.metadata,
                },
            });
        }
    }

    // Generate cross-talk (agents responding to each other)
    if (route.mode === 'open' && responses.length >= 2) {
        const crossTalkResponses = await generateCrossTalk(
            responses,
            message,
            llmContext,
        );
        for (const ct of crossTalkResponses) {
            await addMessage(conversation.id, {
                role: 'agent',
                agentId: ct.agentId,
                content: ct.content,
                metadata: {
                    ...ct.metadata,
                    crossTalk: true,
                    replyTo: ct.replyTo,
                },
            });

            server.sendTo(client.id, {
                type: 'chat.message',
                id: msg.id,
                payload: {
                    conversationId: conversation.id,
                    agentId: ct.agentId,
                    displayName: AGENTS[ct.agentId].displayName,
                    role: AGENTS[ct.agentId].role,
                    color: AGENTS[ct.agentId].color,
                    content: ct.content,
                    crossTalk: true,
                    replyTo: ct.replyTo,
                    metadata: ct.metadata,
                },
            });
        }
    }
}

async function handleChatHistory(client, msg) {
    const { conversationId } = msg.payload;
    if (!conversationId || typeof conversationId !== 'string') {
        // Get latest conversation
        const conversation = await getOrCreateConversation(
            client.userId || 'anon',
        );
        const history = await getHistory(conversation.id);
        server.sendTo(client.id, {
            type: 'chat.message',
            id: msg.id,
            payload: {
                conversationId: conversation.id,
                history: history.map(m => ({
                    id: m.id,
                    role: m.role,
                    agentId: m.agentId,
                    displayName:
                        m.agentId ? AGENTS[m.agentId]?.displayName : null,
                    color: m.agentId ? AGENTS[m.agentId]?.color : null,
                    agentRole: m.agentId ? AGENTS[m.agentId]?.role : null,
                    content: m.content,
                    metadata: m.metadata,
                    createdAt: m.createdAt,
                })),
            },
        });
        return;
    }

    const history = await getHistory(conversationId);
    server.sendTo(client.id, {
        type: 'chat.message',
        id: msg.id,
        payload: {
            conversationId,
            history: history.map(m => ({
                id: m.id,
                role: m.role,
                agentId: m.agentId,
                displayName: m.agentId ? AGENTS[m.agentId]?.displayName : null,
                color: m.agentId ? AGENTS[m.agentId]?.color : null,
                agentRole: m.agentId ? AGENTS[m.agentId]?.role : null,
                content: m.content,
                metadata: m.metadata,
                createdAt: m.createdAt,
            })),
        },
    });
}

async function handleRoundtable(client, msg, conversationId, topic) {
    // Notify client that roundtable is starting
    server.sendTo(client.id, {
        type: 'roundtable.start',
        id: msg.id,
        payload: {
            conversationId,
            topic,
            format: 'deep_dive',
        },
    });

    try {
        // Pick participants (3-5 agents based on topic)
        const { parseIntent: parse } =
            await import('../../src/lib/sanctum/agent-router.ts');
        const intent = parse(topic);
        const participants =
            intent.agents.length >= 3 ?
                intent.agents
            :   [
                    ...intent.agents,
                    ...AGENT_IDS.filter(
                        id => !intent.agents.includes(id),
                    ).slice(0, 3 - intent.agents.length),
                ];

        // Enqueue roundtable session
        const sessionId = await enqueueConversation({
            format: 'deep_dive',
            topic,
            participants,
            source: 'sanctum',
            metadata: { conversationId, source: 'sanctum_command' },
        });

        // Run the roundtable directly (not via worker queue) for real-time streaming
        const { sql } = await import('../../src/lib/db.ts');
        const [session] =
            await sql`SELECT * FROM ops_roundtable_sessions WHERE id = ${sessionId}`;

        if (!session) {
            server.sendTo(client.id, {
                type: 'error',
                id: msg.id,
                payload: { message: 'Failed to create roundtable session' },
            });
            return;
        }

        // Orchestrate with turn streaming
        const history = await orchestrateConversation(
            {
                ...session,
                participants: session.participants,
            },
            false, // No delay between turns for real-time feel
        );

        // Stream each turn to the client
        for (const turn of history) {
            const agent = AGENTS[turn.speaker];
            server.sendTo(client.id, {
                type: 'roundtable.turn',
                id: msg.id,
                payload: {
                    conversationId,
                    sessionId,
                    turnNumber: turn.turn,
                    agentId: turn.speaker,
                    displayName: agent?.displayName ?? turn.speaker,
                    color: agent?.color ?? '#888',
                    role: agent?.role ?? 'Unknown',
                    dialogue: turn.dialogue,
                },
            });

            // Persist as sanctum message too
            await addMessage(conversationId, {
                role: 'agent',
                agentId: turn.speaker,
                content: turn.dialogue,
                metadata: {
                    roundtable: true,
                    sessionId,
                    turnNumber: turn.turn,
                },
            });
        }

        server.sendTo(client.id, {
            type: 'roundtable.end',
            id: msg.id,
            payload: {
                conversationId,
                sessionId,
                topic,
                turnCount: history.length,
                participants,
            },
        });
    } catch (err) {
        log.error('Roundtable execution failed', { error: err, topic });
        server.sendTo(client.id, {
            type: 'error',
            id: msg.id,
            payload: { message: 'Roundtable failed to complete' },
        });
    }
}

// ─── Graceful Shutdown ───

async function shutdown() {
    log.info('Shutting down Sanctum server...');
    await server.shutdown();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

log.info(`Sanctum WebSocket server running on port ${PORT}`);
