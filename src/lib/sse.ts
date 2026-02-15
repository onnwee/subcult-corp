/**
 * SSE (Server-Sent Events) utility module
 * Provides helpers for creating SSE streams in Next.js Route Handlers
 */

/**
 * SSE Stream Controller
 * Provides a ReadableStream and a writer for sending SSE events
 */
export interface SSEStreamController {
    stream: ReadableStream<Uint8Array>;
    writer: WritableStreamDefaultWriter<string>;
}

/**
 * Creates an SSE stream with a writer for sending events
 * @returns An object containing the ReadableStream and the writer
 */
export function createSSEStream(): SSEStreamController {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
        start(ctrl) {
            controller = ctrl;
        },
    });

    // Create writable stream after ReadableStream to ensure controller is initialized
    const writable = new WritableStream<string>({
        write(chunk) {
            if (controller) {
                controller.enqueue(encoder.encode(chunk));
            }
        },
        close() {
            if (controller) {
                controller.close();
            }
        },
        abort(reason) {
            if (controller) {
                controller.error(reason);
            }
        },
    });

    const writer = writable.getWriter();

    return { stream, writer };
}

/**
 * Sends an SSE event through the writer
 * @param writer - The WritableStreamDefaultWriter from createSSEStream
 * @param eventType - The event type (e.g., "message", "update")
 * @param data - The data to send (will be JSON stringified)
 */
export async function sendEvent(
    writer: WritableStreamDefaultWriter<string>,
    eventType: string,
    data: unknown,
): Promise<void> {
    const jsonData = JSON.stringify(data);
    const message = `event: ${eventType}\ndata: ${jsonData}\n\n`;
    await writer.write(message);
}

/**
 * Starts sending periodic keepalive comments to prevent connection timeout
 * Uses recursive setTimeout to avoid overlapping writes
 * @param writer - The WritableStreamDefaultWriter from createSSEStream
 * @param intervalMs - Interval in milliseconds between keepalive messages
 * @returns A function to stop the keepalive interval
 */
export function keepAlive(
    writer: WritableStreamDefaultWriter<string>,
    intervalMs: number,
): () => void {
    let isActive = true;

    const sendKeepAlive = async () => {
        if (!isActive) {
            return;
        }

        try {
            await writer.write(':keepalive\n\n');
        } catch {
            // Writer is likely closed, stop keepalive
            // SSE keepalive error - writer is likely closed, stop keepalive
            isActive = false;
            return;
        }

        // Schedule next keepalive after write completes
        if (isActive) {
            setTimeout(sendKeepAlive, intervalMs);
        }
    };

    // Start the keepalive loop
    setTimeout(sendKeepAlive, intervalMs);

    return () => {
        isActive = false;
    };
}

/**
 * Creates an SSE Response with proper headers
 * @param stream - The ReadableStream from createSSEStream
 * @param corsEnabled - Whether to include CORS headers (default: false)
 * @returns A Response configured for SSE
 */
export function createSSEResponse(
    stream: ReadableStream<Uint8Array>,
    corsEnabled = false,
): Response {
    const headers: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    };

    if (corsEnabled) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }

    return new Response(stream, { headers });
}
