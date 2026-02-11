// OpenClaw Bridge — communicates with the OpenClaw gateway via the
// OpenAI-compatible /v1/chat/completions endpoint.
// Skills are executed by sending a structured prompt to the gateway agent,
// which invokes the appropriate skill and returns the result.

import type { OpenClawConfig, SkillExecutionResult } from '../types';

// ─── Configuration ───

const DEFAULT_CONFIG: OpenClawConfig = {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? 'http://localhost:18789',
    authToken: process.env.OPENCLAW_AUTH_TOKEN,
    timeoutMs: Number(process.env.OPENCLAW_TIMEOUT_MS) || 30_000,
    available: false,
};

let _config: OpenClawConfig = { ...DEFAULT_CONFIG };
let _lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 60_000;

/**
 * Update the OpenClaw gateway configuration.
 */
export function configureOpenClaw(config: Partial<OpenClawConfig>): void {
    _config = { ..._config, ...config };
    _lastHealthCheck = 0;
}

/**
 * Get the current OpenClaw configuration.
 */
export function getOpenClawConfig(): OpenClawConfig {
    return { ..._config };
}

/**
 * Check if the OpenClaw gateway is reachable.
 * Uses a lightweight chat completions call with a tiny max_tokens.
 */
export async function checkGatewayHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - _lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
        return _config.available;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5_000);

        const response = await fetch(
            `${_config.gatewayUrl}/v1/chat/completions`,
            {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(_config.authToken
                        ? { Authorization: `Bearer ${_config.authToken}` }
                        : {}),
                },
                body: JSON.stringify({
                    model: 'openclaw',
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 1,
                }),
            },
        );

        clearTimeout(timeoutId);
        _config.available = response.ok;
    } catch {
        _config.available = false;
    }

    _lastHealthCheck = now;
    return _config.available;
}

/**
 * Execute a skill via the OpenClaw gateway.
 * Sends a structured prompt that triggers the skill, then parses the response.
 */
export async function executeSkill(
    skillId: string,
    params: Record<string, unknown>,
): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    const isAvailable = await checkGatewayHealth();

    if (!isAvailable) {
        return {
            success: false,
            skillId,
            output: {
                message: `OpenClaw gateway is not available. The skill "${skillId}" requires the gateway to execute. Respond based on your existing knowledge instead.`,
                fallback: true,
            },
            error: 'Gateway unavailable',
            durationMs: Date.now() - startTime,
        };
    }

    // Build a prompt that instructs the agent to use the specific skill
    const paramSummary = Object.entries(params)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');

    const prompt = `Use the "${skillId}" skill with these parameters:\n${paramSummary}\n\nReturn the skill output directly, no extra commentary.`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            _config.timeoutMs,
        );

        const response = await fetch(
            `${_config.gatewayUrl}/v1/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(_config.authToken
                        ? { Authorization: `Bearer ${_config.authToken}` }
                        : {}),
                },
                body: JSON.stringify({
                    model: 'openclaw',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 2000,
                }),
                signal: controller.signal,
            },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorBody = await response
                .text()
                .catch(() => 'Unknown error');
            return {
                success: false,
                skillId,
                output: {
                    message: `Skill "${skillId}" execution failed: ${errorBody}`,
                    statusCode: response.status,
                },
                error: `HTTP ${response.status}: ${errorBody}`,
                durationMs: Date.now() - startTime,
            };
        }

        const result = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
        };
        const content =
            result.choices?.[0]?.message?.content?.trim() ?? '';

        return {
            success: true,
            skillId,
            output: { text: content },
            durationMs: Date.now() - startTime,
        };
    } catch (error: unknown) {
        const err = error as { name?: string; message?: string };
        const isTimeout = err.name === 'AbortError';

        return {
            success: false,
            skillId,
            output: {
                message:
                    isTimeout
                        ? `Skill "${skillId}" timed out after ${_config.timeoutMs}ms`
                        : `Skill "${skillId}" failed: ${err.message ?? 'unknown error'}`,
                timeout: isTimeout,
            },
            error:
                isTimeout
                    ? `Timeout after ${_config.timeoutMs}ms`
                    : (err.message ?? 'unknown error'),
            durationMs: Date.now() - startTime,
        };
    }
}

/**
 * Execute a skill with retry logic.
 */
export async function executeSkillWithRetry(
    skillId: string,
    params: Record<string, unknown>,
    maxRetries: number = 2,
): Promise<SkillExecutionResult> {
    let lastResult: SkillExecutionResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        lastResult = await executeSkill(skillId, params);

        if (lastResult.success) return lastResult;

        if (lastResult.error === 'Gateway unavailable') return lastResult;

        if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return lastResult!;
}
