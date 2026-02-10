// LLM client — OpenRouter SDK
// Uses the OpenRouter TypeScript SDK for access to 300+ models
// via a single, type-safe interface.
import { OpenRouter } from '@openrouter/sdk';
import type { LLMGenerateOptions } from '../types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'openrouter/auto';

let _client: OpenRouter | null = null;

function getClient(): OpenRouter {
    if (!_client) {
        if (!OPENROUTER_API_KEY) {
            throw new Error(
                'Missing OPENROUTER_API_KEY environment variable. Set it in .env.local',
            );
        }
        _client = new OpenRouter({ apiKey: OPENROUTER_API_KEY });
    }
    return _client;
}

/** Re-export the singleton for direct SDK access when needed */
export { getClient as getOpenRouterClient };

export async function llmGenerate(
    options: LLMGenerateOptions,
): Promise<string> {
    const { messages, temperature = 0.7, maxTokens = 200, model } = options;

    const client = getClient();
    const effectiveModel = model ?? LLM_MODEL;

    // Separate system instructions from conversation messages
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    try {
        const result = client.callModel({
            model: effectiveModel,
            ...(systemMessage ? { instructions: systemMessage.content } : {}),
            input: conversationMessages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            temperature,
            maxOutputTokens: maxTokens,
        });

        const text = await result.getText();
        return text?.trim() ?? '';
    } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        if (err.statusCode === 401) {
            throw new Error(
                'Invalid OpenRouter API key — check your OPENROUTER_API_KEY',
            );
        }
        if (err.statusCode === 402) {
            throw new Error(
                'Insufficient OpenRouter credits — add credits at openrouter.ai',
            );
        }
        if (err.statusCode === 429) {
            throw new Error('OpenRouter rate limited — try again shortly');
        }
        throw new Error(`LLM API error: ${err.message ?? 'unknown error'}`);
    }
}

/**
 * Sanitize dialogue output:
 * - Cap at maxLength characters
 * - Strip URLs
 * - Remove markdown formatting
 * - Trim whitespace
 */
export function sanitizeDialogue(
    text: string,
    maxLength: number = 120,
): string {
    let cleaned = text
        // Remove URLs
        .replace(/https?:\/\/\S+/g, '')
        // Remove markdown bold/italic
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        // Remove quotes wrapping the entire response
        .replace(/^["']|["']$/g, '')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();

    // Cap at maxLength — try to break at a word boundary
    if (cleaned.length > maxLength) {
        cleaned = cleaned.substring(0, maxLength);
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.7) {
            cleaned = cleaned.substring(0, lastSpace);
        }
        // Add ellipsis if we truncated mid-thought
        if (
            !cleaned.endsWith('.') &&
            !cleaned.endsWith('!') &&
            !cleaned.endsWith('?')
        ) {
            cleaned += '…';
        }
    }

    return cleaned;
}
