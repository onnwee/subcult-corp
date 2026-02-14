// Discord channel registry — backed by ops_discord_channels table
import { sql } from '@/lib/db';
import { getOrCreateWebhook } from './client';
import { logger } from '@/lib/logger';
import type { ConversationFormat } from '../types';

const log = logger.child({ module: 'discord-channels' });

export type DiscordChannelName =
    | 'roundtable'
    | 'brainstorm'
    | 'drafts'
    | 'watercooler'
    | 'missions'
    | 'system-log'
    | 'research'
    | 'insights'
    | 'proposals'
    | 'projects';

/** Map conversation formats to Discord channel names */
const FORMAT_CHANNEL_MAP: Record<ConversationFormat, DiscordChannelName> = {
    standup: 'roundtable',
    checkin: 'roundtable',
    triage: 'roundtable',
    deep_dive: 'roundtable',
    risk_review: 'roundtable',
    strategy: 'roundtable',
    planning: 'roundtable',
    shipping: 'roundtable',
    retro: 'roundtable',
    debate: 'roundtable',
    cross_exam: 'roundtable',
    reframe: 'roundtable',
    content_review: 'roundtable',
    brainstorm: 'brainstorm',
    writing_room: 'drafts',
    watercooler: 'watercooler',
    agent_design: 'roundtable',
};

/** Build a webhook URL from separate id + token columns */
function buildWebhookUrl(webhookId: string, webhookToken: string): string {
    return `https://discord.com/api/webhooks/${webhookId}/${webhookToken}`;
}

// In-memory cache: channelName -> { channelId, webhookUrl }
const channelCache = new Map<
    string,
    { discordChannelId: string; webhookUrl: string | null; enabled: boolean }
>();

/** Get the webhook URL for a named channel. Auto-provisions if missing. */
export async function getWebhookUrl(
    channelName: DiscordChannelName,
): Promise<string | null> {
    const cached = channelCache.get(channelName);
    if (cached) {
        if (!cached.enabled) return null;
        if (cached.webhookUrl) return cached.webhookUrl;
    }

    // DB lookup — existing schema uses webhook_id + webhook_token (not webhook_url)
    const [row] = await sql<
        [
            {
                discord_channel_id: string;
                webhook_id: string | null;
                webhook_token: string | null;
                enabled: boolean;
            },
        ]
    >`
        SELECT discord_channel_id, webhook_id, webhook_token, enabled
        FROM ops_discord_channels
        WHERE name = ${channelName}
    `;

    if (!row) {
        log.debug('Channel not configured', { channelName });
        return null;
    }

    if (!row.enabled) {
        channelCache.set(channelName, {
            discordChannelId: row.discord_channel_id,
            webhookUrl: null,
            enabled: false,
        });
        return null;
    }

    // Build URL from stored webhook credentials
    if (row.webhook_id && row.webhook_token) {
        const webhookUrl = buildWebhookUrl(row.webhook_id, row.webhook_token);
        channelCache.set(channelName, {
            discordChannelId: row.discord_channel_id,
            webhookUrl,
            enabled: true,
        });
        return webhookUrl;
    }

    // Auto-provision webhook via bot API
    const webhookUrl = await getOrCreateWebhook(row.discord_channel_id);
    if (webhookUrl) {
        // Parse id/token from URL and store back to DB
        const match = webhookUrl.match(/\/webhooks\/(\d+)\/(.+)$/);
        if (match) {
            await sql`
                UPDATE ops_discord_channels
                SET webhook_id = ${match[1]}, webhook_token = ${match[2]}
                WHERE name = ${channelName}
            `;
        }
        channelCache.set(channelName, {
            discordChannelId: row.discord_channel_id,
            webhookUrl,
            enabled: true,
        });
    }

    return webhookUrl;
}

/** Resolve which channel a conversation format posts to. */
export function getChannelForFormat(
    format: ConversationFormat,
): DiscordChannelName {
    return FORMAT_CHANNEL_MAP[format];
}
