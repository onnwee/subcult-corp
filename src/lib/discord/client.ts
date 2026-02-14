// Discord REST API v10 client — raw fetch, no dependencies
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'discord' });

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// In-memory webhook cache: channelId -> webhookUrl
const webhookCache = new Map<string, string>();

interface WebhookPostOptions {
    webhookUrl: string;
    username?: string;
    content?: string;
    embeds?: DiscordEmbed[];
    threadId?: string;
    threadName?: string;
}

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: string;
}

/** POST to a Discord webhook. Returns the message object on success, null on failure. */
export async function postToWebhook(
    options: WebhookPostOptions,
): Promise<{ id: string; channel_id: string } | null> {
    const url = new URL(options.webhookUrl);
    url.searchParams.set('wait', 'true');
    if (options.threadId) {
        url.searchParams.set('thread_id', options.threadId);
    }

    const body: Record<string, unknown> = {};
    if (options.username) body.username = options.username;
    if (options.content) body.content = options.content;
    if (options.embeds) body.embeds = options.embeds;
    if (options.threadName) body.thread_name = options.threadName;

    try {
        const res = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            log.warn('Webhook POST failed', {
                status: res.status,
                body: text.slice(0, 200),
            });
            return null;
        }

        return (await res.json()) as { id: string; channel_id: string };
    } catch (err) {
        log.warn('Webhook POST error', { error: (err as Error).message });
        return null;
    }
}

/**
 * Create a thread via webhook by posting with thread_name.
 * Returns the thread/channel ID from the response.
 */
export async function createThread(
    webhookUrl: string,
    threadName: string,
    content: string,
    embeds?: DiscordEmbed[],
    username?: string,
): Promise<string | null> {
    const result = await postToWebhook({
        webhookUrl,
        threadName,
        content,
        embeds,
        username,
    });

    // When creating a thread via webhook, the response message's channel_id is the thread ID
    return result?.channel_id ?? null;
}

/** Internal helper for bot API calls. */
async function discordFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const res = await fetch(`${DISCORD_API}${path}`, {
        ...options,
        headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        log.warn('Discord rate limited', { retryAfter, path });
    }

    return res;
}

/**
 * List channel webhooks, reuse existing or create new.
 * Caches in-memory. Returns the webhook URL.
 */
export async function getOrCreateWebhook(
    channelId: string,
    name: string = 'Subcult',
): Promise<string | null> {
    if (!BOT_TOKEN) {
        log.warn('DISCORD_BOT_TOKEN not set, skipping webhook provisioning');
        return null;
    }

    const cached = webhookCache.get(channelId);
    if (cached) return cached;

    try {
        // List existing webhooks for the channel
        const listRes = await discordFetch(
            `/channels/${channelId}/webhooks`,
        );
        if (!listRes.ok) {
            log.warn('Failed to list webhooks', {
                status: listRes.status,
                channelId,
            });
            return null;
        }

        const webhooks = (await listRes.json()) as {
            id: string;
            name: string;
            url: string;
        }[];

        // Reuse existing webhook with our name
        const existing = webhooks.find((w) => w.name === name);
        if (existing) {
            const url = `https://discord.com/api/webhooks/${existing.id}/${(existing as Record<string, string>).token}`;
            webhookCache.set(channelId, url);
            return url;
        }

        // Create new webhook
        const createRes = await discordFetch(
            `/channels/${channelId}/webhooks`,
            {
                method: 'POST',
                body: JSON.stringify({ name }),
            },
        );
        if (!createRes.ok) {
            log.warn('Failed to create webhook', {
                status: createRes.status,
                channelId,
            });
            return null;
        }

        const created = (await createRes.json()) as {
            id: string;
            token: string;
        };
        const url = `https://discord.com/api/webhooks/${created.id}/${created.token}`;
        webhookCache.set(channelId, url);
        return url;
    } catch (err) {
        log.warn('Webhook provisioning error', {
            error: (err as Error).message,
            channelId,
        });
        return null;
    }
}

/** Convert hex color string to decimal int for Discord embeds. */
export function hexToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
