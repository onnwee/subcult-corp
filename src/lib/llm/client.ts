// LLM client — OpenRouter SDK
// Uses the OpenRouter TypeScript SDK for access to 300+ models
// via a single, type-safe interface.
// Supports both text-only generation and tool-calling (function calling).
import { OpenRouter, ToolType } from '@openrouter/sdk';
import type { OpenResponsesUsage } from '@openrouter/sdk/models';
import { z } from 'zod/v4';
import type {
    LLMGenerateOptions,
    LLMToolResult,
    ToolCallRecord,
    ToolDefinition,
} from '../types';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { resolveModels } from './model-routing';

const log = logger.child({ module: 'llm' });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';

/** Normalize model ID — strip erroneous openrouter/ prefix (only openrouter/auto is valid with that prefix) */
function normalizeModel(id: string): string {
    if (id === 'openrouter/auto') return id;
    if (id.startsWith('openrouter/')) return id.slice('openrouter/'.length);
    return id;
}

/** OpenRouter limits the `models` array to 3 items. Slice for API calls; full list used by individual fallback loop. */
const MAX_MODELS_ARRAY = 3;

/** LLM_MODEL env override — prepended to resolved model list when set. */
const LLM_MODEL_ENV: string | null = (() => {
    const envModel = process.env.LLM_MODEL;
    if (!envModel || envModel === 'openrouter/auto') return null;
    return normalizeModel(envModel);
})();

/** Resolve models from DB routing table, prepending LLM_MODEL env if set. */
async function resolveModelsWithEnv(context?: string): Promise<string[]> {
    const models = await resolveModels(context);
    if (!LLM_MODEL_ENV) return models;
    return [
        LLM_MODEL_ENV,
        ...models.filter((m: string) => m !== LLM_MODEL_ENV),
    ];
}

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

// ─── Ollama (cloud via ollama.com + local via Tailscale) ───

const OLLAMA_LOCAL_URL = process.env.OLLAMA_BASE_URL ?? '';
const OLLAMA_CLOUD_URL = 'https://ollama.com';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY ?? '';
const OLLAMA_TIMEOUT_MS = 60_000;

interface OllamaModelSpec {
    model: string;
    baseUrl: string;
    apiKey?: string;
}

/**
 * Ordered fallback chain — cloud models first (free, capable), local models as fallback.
 * Cloud models hit ollama.com with API key auth.
 * Local models hit the Tailscale Ollama instance.
 */
function getOllamaModels(): OllamaModelSpec[] {
    const models: OllamaModelSpec[] = [];

    // Cloud models via ollama.com (fast, capable, free)
    if (OLLAMA_API_KEY) {
        models.push(
            { model: 'deepseek-v3.2:cloud', baseUrl: OLLAMA_CLOUD_URL, apiKey: OLLAMA_API_KEY },
            { model: 'kimi-k2.5:cloud', baseUrl: OLLAMA_CLOUD_URL, apiKey: OLLAMA_API_KEY },
            { model: 'gemini-3-flash-preview:latest', baseUrl: OLLAMA_CLOUD_URL, apiKey: OLLAMA_API_KEY },
        );
    }

    // Local models via Tailscale (always available, no auth)
    if (OLLAMA_LOCAL_URL) {
        models.push(
            { model: 'qwen3-coder:30b', baseUrl: OLLAMA_LOCAL_URL },
            { model: 'llama3.2:latest', baseUrl: OLLAMA_LOCAL_URL },
        );
    }

    return models;
}

/** Strip <think>...</think> blocks from reasoning model output */
function stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

interface OllamaChatResult {
    text: string;
    toolCalls: ToolCallRecord[];
    model: string;
}

/**
 * Full Ollama chat with tool calling support.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 * Tries cloud models (ollama.com) first, then local models.
 * Returns null if all models fail.
 */
async function ollamaChat(
    messages: { role: string; content: string }[],
    temperature: number,
    options?: {
        maxTokens?: number;
        tools?: ToolDefinition[];
        maxToolRounds?: number;
    },
): Promise<OllamaChatResult | null> {
    const models = getOllamaModels();
    if (models.length === 0) return null;

    const maxTokens = options?.maxTokens ?? 250;
    const tools = options?.tools;
    const maxToolRounds = options?.maxToolRounds ?? 3;

    // Convert tools to OpenAI function-calling format
    const openaiTools = tools && tools.length > 0
        ? tools.map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }))
        : undefined;

    for (const spec of models) {
        const result = await ollamaChatWithModel(
            spec, messages, temperature, maxTokens,
            tools, openaiTools, maxToolRounds,
        );
        if (result) return result;
    }

    return null;
}

/** Try a single Ollama model. Returns result or null on failure. */
async function ollamaChatWithModel(
    spec: OllamaModelSpec,
    messages: { role: string; content: string }[],
    temperature: number,
    maxTokens: number,
    tools: ToolDefinition[] | undefined,
    openaiTools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined,
    maxToolRounds: number,
): Promise<OllamaChatResult | null> {
    const { model, baseUrl, apiKey } = spec;
    const toolCallRecords: ToolCallRecord[] = [];

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    // Working copy of messages for the tool loop
    const workingMessages: Array<Record<string, unknown>> = messages.map(m => ({
        role: m.role,
        content: m.content,
    }));

    for (let round = 0; round <= maxToolRounds; round++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

            const body: Record<string, unknown> = {
                model,
                messages: workingMessages,
                temperature,
                max_tokens: maxTokens,
            };
            // Only include tools if we haven't exhausted rounds
            if (openaiTools && round < maxToolRounds) {
                body.tools = openaiTools;
            }

            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            if (!response.ok) {
                log.debug('Ollama model failed', { model, baseUrl, status: response.status });
                return null;
            }

            const data = (await response.json()) as {
                choices?: [{
                    message?: {
                        content?: string;
                        tool_calls?: Array<{
                            id: string;
                            function: { name: string; arguments: string };
                        }>;
                    };
                }];
            };

            const msg = data.choices?.[0]?.message;
            if (!msg) return null;

            const pendingToolCalls = msg.tool_calls;

            // No tool calls → return text
            if (!pendingToolCalls || pendingToolCalls.length === 0) {
                const raw = msg.content ?? '';
                const text = stripThinking(raw).trim();
                if (text.length === 0 && toolCallRecords.length === 0) return null;
                return { text, toolCalls: toolCallRecords, model };
            }

            // Execute tool calls
            workingMessages.push({
                role: 'assistant',
                content: msg.content ?? null,
                tool_calls: pendingToolCalls,
            });

            for (const tc of pendingToolCalls) {
                const tool = tools?.find(t => t.name === tc.function.name);
                let resultStr: string;

                if (tool?.execute) {
                    let args: Record<string, unknown>;
                    try {
                        args = JSON.parse(tc.function.arguments);
                    } catch {
                        args = {};
                    }
                    const result = await tool.execute(args);
                    toolCallRecords.push({
                        name: tool.name,
                        arguments: args,
                        result,
                    });
                    resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                } else {
                    resultStr = `Tool ${tc.function.name} not available`;
                }

                workingMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: resultStr,
                });
            }
        } catch (err) {
            log.debug('Ollama chat error', { model, error: (err as Error).message });
            return null;
        }
    }

    // Exhausted tool rounds — return what we have
    return { text: '', toolCalls: toolCallRecords, model };
}

/**
 * Convert a plain JSON Schema property to a Zod type.
 * Handles string (with enum), number, integer, boolean.
 */
function jsonSchemaPropToZod(prop: Record<string, unknown>): z.ZodType {
    const enumValues = prop.enum as string[] | undefined;
    let zodType: z.ZodType;

    switch (prop.type) {
        case 'string':
            zodType =
                enumValues && enumValues.length > 0 ?
                    z.enum(enumValues as [string, ...string[]])
                :   z.string();
            break;
        case 'number':
            zodType = z.number();
            break;
        case 'integer':
            zodType = z.number().int();
            break;
        case 'boolean':
            zodType = z.boolean();
            break;
        default:
            zodType = z.unknown();
            break;
    }

    if (prop.description && typeof prop.description === 'string') {
        zodType = zodType.describe(prop.description);
    }

    return zodType;
}

/**
 * Convert a tool's plain JSON Schema `parameters` object to a Zod v4 schema.
 * The OpenRouter SDK expects `inputSchema` as a Zod object, not raw JSON Schema.
 * This bridges our ToolDefinition format to the SDK's expected format.
 */
function jsonSchemaToZod(
    schema: Record<string, unknown>,
): z.ZodObject<z.ZodRawShape> {
    const properties = (schema.properties ?? {}) as Record<
        string,
        Record<string, unknown>
    >;
    const required = (schema.required as string[]) ?? [];

    const entries = Object.entries(properties).map(([key, prop]) => {
        const base = jsonSchemaPropToZod(prop);
        return [key, required.includes(key) ? base : base.optional()] as const;
    });

    return z.object(Object.fromEntries(entries));
}

/**
 * Convert our ToolDefinition format to the OpenRouter SDK's tool format.
 * Uses ToolType.Function with Zod v4 inputSchema and execute functions.
 */
function toOpenRouterTools(tools: ToolDefinition[]) {
    return tools.map(tool => ({
        type: ToolType.Function as const,
        function: {
            name: tool.name,
            description: tool.description,
            inputSchema: jsonSchemaToZod(tool.parameters),
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
    trackingContext?: {
        agentId?: string;
        context?: string;
        sessionId?: string;
    },
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
        log.error('Failed to track LLM usage', {
            error,
            model,
            trackingContext,
        });
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

    // ── Try Ollama first (free cloud + local inference) ──
    if (OLLAMA_API_KEY || OLLAMA_LOCAL_URL) {
        const ollamaResult = await ollamaChat(messages, temperature, {
            maxTokens,
            tools,
            maxToolRounds: options.maxToolRounds,
        });
        if (ollamaResult?.text) {
            // Track usage (fire-and-forget)
            void trackUsage(
                `ollama/${ollamaResult.model}`,
                null,
                Date.now() - startTime,
                trackingContext,
            );
            return ollamaResult.text;
        }
    }

    // ── Fall back to OpenRouter (cloud) ──
    // Resolve model list: explicit override → single model, otherwise → dynamic routing (DB + env + defaults)
    const resolved =
        model ?
            [normalizeModel(model)]
        :   await resolveModelsWithEnv(trackingContext?.context);
    const modelList = resolved.slice(0, MAX_MODELS_ARRAY);
    if (modelList.length === 0) {
        throw new Error('No LLM models available after resolution');
    }

    const buildCallOpts = (
        spec: string | string[],
    ): Record<string, unknown> => {
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
        // Other errors — fall through to individual model attempts
    }

    // 2) If models array returned empty or errored, try remaining models individually
    for (const fallback of resolved.slice(MAX_MODELS_ARRAY)) {
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

    const startTime = Date.now();

    // ── Try Ollama first (free cloud + local inference) ──
    if (OLLAMA_API_KEY || OLLAMA_LOCAL_URL) {
        const ollamaResult = await ollamaChat(messages, temperature, {
            maxTokens,
            tools,
            maxToolRounds,
        });
        if (ollamaResult?.text) {
            void trackUsage(
                `ollama/${ollamaResult.model}`,
                null,
                Date.now() - startTime,
                trackingContext,
            );
            return { text: ollamaResult.text, toolCalls: ollamaResult.toolCalls };
        }
    }

    // ── Fall back to OpenRouter (cloud) ──
    const client = getClient();
    const resolved =
        model ?
            [normalizeModel(model)]
        :   await resolveModelsWithEnv(trackingContext?.context);
    const modelList = resolved.slice(0, MAX_MODELS_ARRAY);

    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const toolCallRecords: ToolCallRecord[] = [];

    // Wrap execute functions to capture tool call records
    const wrappedTools = tools.map(tool => ({
        type: ToolType.Function as const,
        function: {
            name: tool.name,
            description: tool.description,
            inputSchema: jsonSchemaToZod(tool.parameters),
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
