// Sanctum WebSocket server — real-time bidirectional chat
// Standalone WS server on port 3011 for persistent connections
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'sanctum-ws' });

// ─── Protocol Types ───

export type ClientMessageType =
    | 'chat.send'
    | 'chat.history'
    | 'typing.start'
    | 'typing.stop'
    | 'presence.query';

export type ServerEventType =
    | 'chat.message'
    | 'chat.stream'
    | 'typing.indicator'
    | 'presence.update'
    | 'roundtable.turn'
    | 'roundtable.start'
    | 'roundtable.end'
    | 'error'
    | 'connected';

export interface SanctumClientMessage {
    type: ClientMessageType;
    id: string;
    payload: Record<string, unknown>;
}

export interface SanctumServerEvent {
    type: ServerEventType;
    id?: string;
    payload: Record<string, unknown>;
}

// ─── Client Tracking ───

export interface ConnectedClient {
    id: string;
    ws: WebSocket;
    userId: string;
    connectedAt: Date;
    lastPing: Date;
}

export type MessageHandler = (
    client: ConnectedClient,
    msg: SanctumClientMessage,
) => void | Promise<void>;

// ─── Server ───

export interface SanctumServer {
    wss: WebSocketServer;
    clients: Map<string, ConnectedClient>;
    broadcast: (event: SanctumServerEvent) => void;
    sendTo: (clientId: string, event: SanctumServerEvent) => void;
    sendToUser: (userId: string, event: SanctumServerEvent) => void;
    onMessage: (handler: MessageHandler) => void;
    shutdown: () => Promise<void>;
}

export function createSanctumServer(port: number = 3011): SanctumServer {
    const wss = new WebSocketServer({ port });
    const clients = new Map<string, ConnectedClient>();
    const messageHandlers: MessageHandler[] = [];

    log.info('Sanctum WebSocket server starting', { port });

    wss.on('connection', (ws: WebSocket) => {
        const clientId = randomUUID();
        const client: ConnectedClient = {
            id: clientId,
            ws,
            userId: 'anon',
            connectedAt: new Date(),
            lastPing: new Date(),
        };
        clients.set(clientId, client);

        log.info('Client connected', { clientId });

        // Send connection confirmation
        sendEvent(ws, {
            type: 'connected',
            payload: { clientId },
        });

        ws.on('message', async (raw: Buffer) => {
            let msg: SanctumClientMessage;
            try {
                msg = JSON.parse(raw.toString()) as SanctumClientMessage;
            } catch {
                sendEvent(ws, {
                    type: 'error',
                    payload: { message: 'Invalid JSON' },
                });
                return;
            }

            if (!msg.type || !msg.id) {
                sendEvent(ws, {
                    type: 'error',
                    id: msg.id,
                    payload: { message: 'Missing type or id field' },
                });
                return;
            }

            // Update userId from first message payload if provided
            if (msg.payload?.userId && typeof msg.payload.userId === 'string') {
                client.userId = msg.payload.userId;
            }

            // Dispatch to registered handlers
            for (const handler of messageHandlers) {
                try {
                    await handler(client, msg);
                } catch (err) {
                    log.error('Message handler error', {
                        error: err,
                        clientId,
                        type: msg.type,
                    });
                    sendEvent(ws, {
                        type: 'error',
                        id: msg.id,
                        payload: {
                            message: 'Internal error processing message',
                        },
                    });
                }
            }
        });

        ws.on('close', () => {
            clients.delete(clientId);
            log.info('Client disconnected', { clientId });
        });

        ws.on('error', (err: Error) => {
            log.error('WebSocket error', { error: err, clientId });
        });

        ws.on('pong', () => {
            client.lastPing = new Date();
        });
    });

    // Heartbeat — ping every 15s, terminate stale connections after 30s
    const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, client] of clients) {
            if (now - client.lastPing.getTime() > 30_000) {
                log.warn('Terminating stale connection', { clientId: id });
                client.ws.terminate();
                clients.delete(id);
            } else {
                client.ws.ping();
            }
        }
    }, 15_000);

    // ─── Public API ───

    function broadcast(event: SanctumServerEvent): void {
        const data = JSON.stringify(event);
        for (const client of clients.values()) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }

    function sendTo(clientId: string, event: SanctumServerEvent): void {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            sendEvent(client.ws, event);
        }
    }

    function sendToUser(userId: string, event: SanctumServerEvent): void {
        const data = JSON.stringify(event);
        for (const client of clients.values()) {
            if (
                client.userId === userId &&
                client.ws.readyState === WebSocket.OPEN
            ) {
                client.ws.send(data);
            }
        }
    }

    function onMessage(handler: MessageHandler): void {
        messageHandlers.push(handler);
    }

    async function shutdown(): Promise<void> {
        clearInterval(heartbeatInterval);
        for (const client of clients.values()) {
            client.ws.close(1001, 'Server shutting down');
        }
        return new Promise(resolve => {
            wss.close(() => {
                log.info('Sanctum WebSocket server stopped');
                resolve();
            });
        });
    }

    wss.on('listening', () => {
        log.info('Sanctum WebSocket server ready', { port });
    });

    return { wss, clients, broadcast, sendTo, sendToUser, onMessage, shutdown };
}

// ─── Helpers ───

function sendEvent(ws: WebSocket, event: SanctumServerEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
    }
}
