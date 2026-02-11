// LLM client — OpenRouter SDK
// Uses the OpenRouter TypeScript SDK for access to 300+ models
// via a single, type-safe interface.
// Supports both text-only generation and tool-calling (function calling).
import { OpenRouter, ToolType } from '@openrouter/sdk';
import type { OpenResponsesUsage } from '@openrouter/sdk/models';
import type {
    LLMGenerateOptions,
    LLMToolResult,
    ToolCallRecord,
    ToolDefinition,
} from '../types';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'llm' });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';

/** Normalize model ID — strip erroneous openrouter/ prefix (only openrouter/auto is valid with that prefix) */
function normalizeModel(id: string): string {
    if (id === 'openrouter/auto') return id;
    if (id.startsWith('openrouter/')) return id.slice('openrouter/'.length);
    return id;
}

/**
 * Default models for SDK-native routing via `models` array.
 * OpenRouter tries each in order, falling back on provider errors / unavailability.
 * Ordered by speed/cost — fast cheap models first, heavier last resort.
 *
 * Heavy models (opus-4.6, gpt-5.2, deepseek-r1) excluded from default rotation
 * — available via LLM_MODEL env override for specific tasks.
 */
const DEFAULT_MODELS = [
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.5-flash',
    'openai/gpt-4.1-mini',
    'deepseek/deepseek-v3.2',
    'qwen/qwen3-235b-a22b',
    'moonshotai/kimi-k2.5',
    'anthropic/claude-sonnet-4.5',  // last resort — higher quality, higher cost
];

/**
 * Effective model list: if LLM_MODEL env is set to a specific model (not openrouter/auto),
 * prepend it to the default list. Otherwise use defaults only.
 */
const LLM_MODELS: string[] = (() => {
    const envModel = process.env.LLM_MODEL;
    if (!envModel || envModel === 'openrouter/auto') return DEFAULT_MODELS;
    const normalized = normalizeModel(envModel);
    return [normalized, ...DEFAULT_MODELS.filter(m => m !== normalized)];
})();

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

// ─── Ollama (local inference via Tailscale) ───

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? '';
const OLLAMA_TIMEOUT_MS = 45_000;
const OLLAMA_MODEL = 'qwen3:32b';

/** Strip <think>...</think> blocks from reasoning model output */
function stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Try generating via Ollama's OpenAI-compatible endpoint.
 * Returns trimmed text or null on failure/empty.
 */
async function ollamaGenerate(
    messages: { role: string; content: string }[],
    temperature: number,
    model: string = OLLAMA_MODEL,
): Promise<string | null> {
    if (!OLLAMA_BASE_URL) return null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

        const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: 250,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (!response.ok) return null;

        const data = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
        };
        const raw = data.choices?.[0]?.message?.content ?? '';
        const text = stripThinking(raw).trim();
        return text.length > 0 ? text : null;
    } catch {
        return null;
    }
}

/**
 * Convert our ToolDefinition format to the OpenRouter SDK's tool format.
 * Uses ToolType.Function with JSON Schema parameters and execute functions.
 */
function toOpenRouterTools(tools: ToolDefinition[]) {
    return tools.map(tool => ({
        type: ToolType.Function as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            ...(tool.execute ?
                {
                    execute: async (params: Record<string, unknown>) => {
                        const result = await tool.execute!(params);
                        return result;
                    },
                }
            :   {}),
        },
    }));
}

/**
 * Track LLM usage to the ops_llm_usage table.
 * Fire-and-forget: errors are logged but don't affect the caller.
 */
async function trackUsage(
    model: string,
    usage: OpenResponsesUsage | null | undefined,
    durationMs: number,
    trackingContext?: { agentId?: string; context?: string; sessionId?: string },
): Promise<void> {
    try {
        const agentId = trackingContext?.agentId ?? 'unknown';
        const context = trackingContext?.context ?? 'unknown';
        const sessionId = trackingContext?.sessionId ?? null;

        await sql`
            INSERT INTO ops_llm_usage (
                model,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cost_usd,
                agent_id,
                context,
                session_id,
                duration_ms
            ) VALUES (
                ${model},
                ${usage?.inputTokens ?? null},
                ${usage?.outputTokens ?? null},
                ${usage?.totalTokens ?? null},
                ${usage?.cost ?? null},
                ${agentId},
                ${context},
                ${sessionId},
                ${durationMs}
            )
        `;
    } catch (error) {
        // Log error but don't throw — tracking should never break the main flow
        log.error('Failed to track LLM usage', { error, model, trackingContext });
    }
}

/**
 * Generate text from messages, optionally with tools for function calling.
 * Uses the SDK `models` array for native API-level fallback routing.
 * When tools are provided, the SDK auto-executes them and returns the final text.
 */
export async function llmGenerate(
    options: LLMGenerateOptions,
): Promise<string> {
    const {
        messages,
        temperature = 0.7,
        maxTokens = 200,
        model,
        tools,
        trackingContext,
    } = options;

    const client = getClient();
    const startTime = Date.now();

    // Separate system instructions from conversation messages
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // ── Try Ollama first (free, local inference) — skip if tools needed ──
    if (OLLAMA_BASE_URL && (!tools || tools.length === 0)) {
        const text = await ollamaGenerate(messages, temperature);
        if (text) return text;
    }

    // ── Fall back to OpenRouter (cloud) ──
    // Determine model list: specific override → single model, otherwise → native routing array
    const modelList = model ? [normalizeModel(model)] : LLM_MODELS;

    const buildCallOpts = (spec: string | string[]): Record<string, unknown> => {
        const isArray = Array.isArray(spec);
        const opts: Record<string, unknown> = {
            ...(isArray ? { models: spec } : { model: spec }),
            ...(isArray ? { provider: { allowFallbacks: true } } : {}),
            ...(systemMessage ? { instructions: systemMessage.content } : {}),
            input: conversationMessages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            temperature,
            maxOutputTokens: maxTokens,
        };
        if (tools && tools.length > 0) {
            opts.tools = toOpenRouterTools(tools);
            opts.maxToolRounds = options.maxToolRounds ?? 3;
        }
        return opts;
    };

    /** Try a call (models array or single model), return trimmed text or null if empty */
    async function tryCall(spec: string | string[]): Promise<string | null> {
        const result = client.callModel(
            buildCallOpts(spec) as Parameters<typeof client.callModel>[0],
        );
        const text = (await result.getText())?.trim() ?? '';

        // Track usage after successful getText
        const durationMs = Date.now() - startTime;
        const response = await result.getResponse();
        const usedModel = response.model || 'unknown';
        const usage = response.usage;

        // Fire-and-forget tracking (errors logged internally by trackUsage)
        void trackUsage(usedModel, usage, durationMs, trackingContext);

        return text.length > 0 ? text : null;
    }

    // 1) Try with models array — OpenRouter handles provider routing natively
    try {
        const text = await tryCall(modelList);
        if (text) return text;
    } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        if (err.statusCode === 401) {
            throw new Error('Invalid OpenRouter API key — check your OPENROUTER_API_KEY');
        }
        if (err.statusCode === 402) {
            throw new Error('Insufficient OpenRouter credits — add credits at openrouter.ai');
        }
        if (err.statusCode === 429) {
            throw new Error('OpenRouter rate limited — try again shortly');
        }
        // Other errors — fall through to individual model attempts
    }

    // 2) If models array returned empty or errored, try each default model individually
    for (const fallback of DEFAULT_MODELS) {
        try {
            const text = await tryCall(fallback);
            if (text) return text;
        } catch {
            // Continue to next
        }
    }

    return '';
}

/**
 * Generate text with tools and return structured results including tool call records.
 * Uses the SDK `models` array for native API-level fallback routing.
 * Use this when you need to know which tools were invoked and their results.
 */
export async function llmGenerateWithTools(
    options: LLMGenerateOptions,
): Promise<LLMToolResult> {
    const {
        messages,
        temperature = 0.7,
        maxTokens = 200,
        model,
        tools = [],
        maxToolRounds = 3,
        trackingContext,
    } = options;

    const client = getClient();
    const startTime = Date.now();
    const modelList = model ? [normalizeModel(model)] : LLM_MODELS;

    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const toolCallRecords: ToolCallRecord[] = [];

    // Wrap execute functions to capture tool call records
    const wrappedTools = tools.map(tool => ({
        type: ToolType.Function as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            ...(tool.execute ?
                {
                    execute: async (params: Record<string, unknown>) => {
                        const result = await tool.execute!(params);
                        toolCallRecords.push({
                            name: tool.name,
                            arguments: params,
                            result,
                        });
                        return result;
                    },
                }
            :   {}),
        },
    }));

    try {
        const callOptions: Record<string, unknown> = {
            models: modelList,
            provider: { allowFallbacks: true },
            ...(systemMessage ? { instructions: systemMessage.content } : {}),
            input: conversationMessages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            temperature,
            maxOutputTokens: maxTokens,
        };

        if (wrappedTools.length > 0) {
            callOptions.tools = wrappedTools;
            callOptions.maxToolRounds = maxToolRounds;
        }

        const result = client.callModel(
            callOptions as Parameters<typeof client.callModel>[0],
        );

        const text = (await result.getText())?.trim() ?? '';

        // Track usage after successful getText
        const durationMs = Date.now() - startTime;
        const response = await result.getResponse();
        const usedModel = response.model || 'unknown';
        const usage = response.usage;

        // Fire-and-forget tracking (errors logged internally by trackUsage)
        void trackUsage(usedModel, usage, durationMs, trackingContext);

        return { text, toolCalls: toolCallRecords };
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
