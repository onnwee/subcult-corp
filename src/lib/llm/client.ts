// LLM client — OpenAI-compatible API abstraction
// Works with OpenAI, Anthropic (via proxy), local models, etc.
import type { LLMGenerateOptions } from '../types';

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';

export async function llmGenerate(
    options: LLMGenerateOptions,
): Promise<string> {
    const { messages, temperature = 0.7, maxTokens = 200 } = options;

    if (!LLM_API_KEY) {
        throw new Error(
            'Missing LLM_API_KEY environment variable. Set it in .env.local',
        );
    }

    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
            })),
            temperature,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        throw new Error(`LLM API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() ?? '';
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
