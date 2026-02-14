// Discord roundtable posting — thread creation, per-turn messages, summaries
import { postToWebhook, createThread, hexToDecimal } from './client';
import type { DiscordEmbed } from './client';
import { getWebhookUrl, getChannelForFormat } from './channels';
import { getVoice } from '../roundtable/voices';
import { AGENTS } from '../agents';
import { sql, jsonb } from '@/lib/db';
import { logger } from '@/lib/logger';
import type {
    RoundtableSession,
    ConversationTurnEntry,
    SessionStatus,
    AgentId,
} from '../types';

const log = logger.child({ module: 'discord-roundtable' });

/**
 * Create a Discord thread for a new conversation.
 * Posts a header embed and returns the thread ID.
 * Stores the thread ID in session metadata.
 */
export async function postConversationStart(
    session: RoundtableSession,
): Promise<string | null> {
    const channelName = getChannelForFormat(session.format);
    const webhookUrl = await getWebhookUrl(channelName);
    if (!webhookUrl) return null;

    // Build participant list with symbols
    const participantList = session.participants
        .map((p) => {
            const voice = getVoice(p);
            return voice ? `${voice.symbol} ${voice.displayName}` : p;
        })
        .join(', ');

    const threadTitle = `${session.format.toUpperCase()}: ${session.topic.slice(0, 90)}`;

    const embed: DiscordEmbed = {
        title: `${session.format} — starting`,
        description: session.topic,
        color: 0x313244, // neutral dark
        fields: [
            {
                name: 'Participants',
                value: participantList,
                inline: false,
            },
        ],
        timestamp: new Date().toISOString(),
    };

    const threadId = await createThread(
        webhookUrl,
        threadTitle,
        '',
        [embed],
        '📡 Subcult Roundtable',
    );

    if (threadId) {
        // Store thread ID in session metadata
        await sql`
            UPDATE ops_roundtable_sessions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || ${jsonb({ discordThreadId: threadId })}
            WHERE id = ${session.id}
        `;
        log.info('Discord thread created', {
            sessionId: session.id,
            threadId,
            channel: channelName,
        });
    }

    return threadId;
}

/**
 * Post a single conversation turn to the Discord thread.
 * Uses the speaker's voice symbol + name as the webhook username.
 */
export async function postConversationTurn(
    session: RoundtableSession,
    entry: ConversationTurnEntry,
    threadId: string,
): Promise<void> {
    const channelName = getChannelForFormat(session.format);
    const webhookUrl = await getWebhookUrl(channelName);
    if (!webhookUrl) return;

    const voice = getVoice(entry.speaker);
    const username = voice
        ? `${voice.symbol} ${voice.displayName}`
        : entry.speaker;

    await postToWebhook({
        webhookUrl,
        threadId,
        username,
        content: entry.dialogue,
    });
}

/**
 * Post a summary embed when the conversation ends.
 * Includes turn count, speakers, duration, and a transcript snippet.
 */
export async function postConversationSummary(
    session: RoundtableSession,
    history: ConversationTurnEntry[],
    status: SessionStatus,
    threadId: string,
    abortReason?: string,
): Promise<void> {
    const channelName = getChannelForFormat(session.format);
    const webhookUrl = await getWebhookUrl(channelName);
    if (!webhookUrl) return;

    const speakers = [
        ...new Set(history.map((h) => h.speaker)),
    ];
    const speakerNames = speakers
        .map((s) => {
            const voice = getVoice(s);
            return voice ? `${voice.symbol} ${voice.displayName}` : s;
        })
        .join(', ');

    const statusIcon = status === 'completed' ? '✅' : '❌';
    const title = `${statusIcon} ${session.format} — ${status}`;

    // Last 3 exchanges as transcript snippet
    const lastExchanges = history
        .slice(-3)
        .map((h) => {
            const voice = getVoice(h.speaker);
            const name = voice?.displayName ?? h.speaker;
            return `**${name}:** ${h.dialogue}`;
        })
        .join('\n');

    const fields: DiscordEmbed['fields'] = [
        { name: 'Turns', value: `${history.length}`, inline: true },
        { name: 'Speakers', value: speakerNames, inline: true },
    ];

    if (abortReason) {
        fields.push({
            name: 'Abort Reason',
            value: abortReason.slice(0, 200),
            inline: false,
        });
    }

    if (lastExchanges) {
        fields.push({
            name: 'Last Exchanges',
            value: lastExchanges.slice(0, 1000),
            inline: false,
        });
    }

    const embed: DiscordEmbed = {
        title,
        color: status === 'completed' ? 0xa6e3a1 : 0xf38ba8,
        fields,
        footer: { text: `Session ${session.id}` },
        timestamp: new Date().toISOString(),
    };

    await postToWebhook({
        webhookUrl,
        threadId,
        username: '📡 Subcult Roundtable',
        embeds: [embed],
    });
}

/**
 * Post an artifact embed to the conversation's Discord thread.
 * Called after the artifact synthesizer agent session completes.
 */
export async function postArtifactToDiscord(
    roundtableSessionId: string,
    format: string,
    artifactText: string,
): Promise<void> {
    // Look up thread ID from the roundtable session metadata
    const [session] = await sql<
        [{ metadata: Record<string, unknown>; format: string } | undefined]
    >`
        SELECT metadata, format FROM ops_roundtable_sessions
        WHERE id = ${roundtableSessionId}
    `;

    const threadId = session?.metadata?.discordThreadId as string | undefined;
    if (!threadId) return;

    const channelName = getChannelForFormat(
        (session?.format ?? format) as RoundtableSession['format'],
    );
    const webhookUrl = await getWebhookUrl(channelName);
    if (!webhookUrl) return;

    // Truncate to Discord embed limit (4096 for description, leave margin)
    const truncated =
        artifactText.length > 3800
            ? artifactText.slice(0, 3800) + '\n\n*...truncated*'
            : artifactText;

    const embed: DiscordEmbed = {
        title: '📋 Artifact',
        description: truncated,
        color: 0x74c7ec, // mux blue
        footer: { text: `Source: ${roundtableSessionId}` },
        timestamp: new Date().toISOString(),
    };

    await postToWebhook({
        webhookUrl,
        threadId,
        username: '📋 Subcult Artifact',
        embeds: [embed],
    });

    log.info('Artifact posted to Discord', {
        roundtableSessionId,
        threadId,
    });
}
