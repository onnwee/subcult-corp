// Mission Step Executor — VPS process that polls for queued mission steps
// and executes them using LLM calls in the creating agent's voice.
//
// Run: node scripts/mission-worker/worker.mjs
//
// Environment variables required:
//   DATABASE_URL
//   OPENROUTER_API_KEY, LLM_MODEL (optional)

import postgres from 'postgres';
import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';
dotenv.config({ path: '.env.local' });

const log = createLogger({ service: 'mission-worker' });

// ─── Config ───

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const WORKER_ID = `mission-worker-${process.pid}`;

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL environment variable');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';

if (!OPENROUTER_API_KEY) {
    log.fatal('Missing OPENROUTER_API_KEY environment variable');
    process.exit(1);
}

const openrouter = new OpenRouter({ apiKey: OPENROUTER_API_KEY });

// ─── Model Configuration ───

function normalizeModel(id) {
    if (id === 'openrouter/auto') return id;
    if (id.startsWith('openrouter/')) return id.slice('openrouter/'.length);
    return id;
}

const MISSION_MODELS = [
    'google/gemini-2.5-flash',
    'anthropic/claude-haiku-4.5',
    'openai/gpt-4.1-mini',
    'deepseek/deepseek-v3.2',
];

const LLM_MODELS = (() => {
    const envModel = process.env.LLM_MODEL;
    if (!envModel || envModel === 'openrouter/auto') return MISSION_MODELS;
    const normalized = normalizeModel(envModel);
    return [normalized, ...MISSION_MODELS.filter(m => m !== normalized)];
})();

// ─── Ollama (local inference via Tailscale) ───

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? '';
const OLLAMA_TIMEOUT_MS = 60_000; // generous for structured output
const OLLAMA_MODELS = ['qwen3:32b'];

function stripThinking(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function ollamaGenerate(messages, temperature, model, maxTokens = 800) {
    if (!OLLAMA_BASE_URL) return null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                think: false,
                options: {
                    temperature,
                    num_predict: maxTokens,
                },
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            log.warn('Ollama HTTP error', { model, status: response.status });
            return null;
        }

        const data = await response.json();
        const raw = data.message?.content ?? '';
        const text = stripThinking(raw).trim();
        if (text.length > 0) return text;

        log.warn('Ollama empty response', { model });
        return null;
    } catch (err) {
        const isTimeout = err?.name === 'AbortError';
        log.warn('Ollama call failed', {
            model,
            timeout: isTimeout,
            error: isTimeout ? undefined : err?.message,
        });
        return null;
    }
}

// ─── LLM Client (Ollama-first + OpenRouter fallback) ───

const MAX_LLM_RETRIES = 2;
const LLM_RETRY_BASE_MS = 3000;

async function llmGenerate(messages, temperature = 0.7, maxTokens = 800) {
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // 1) Try Ollama first (free, local inference)
    if (OLLAMA_BASE_URL) {
        for (const model of OLLAMA_MODELS) {
            const text = await ollamaGenerate(messages, temperature, model, maxTokens);
            if (text) {
                log.debug('Ollama model succeeded', { model });
                return text;
            }
        }
    }

    // 2) Fall back to OpenRouter (cloud)
    const buildCallOptions = spec => {
        const isArray = Array.isArray(spec);
        return {
            ...(isArray ? { models: spec } : { model: spec }),
            ...(isArray ? { provider: { allowFallbacks: true } } : {}),
            ...(systemMessage ? { instructions: systemMessage.content } : {}),
            input: conversationMessages.map(m => ({
                role: m.role,
                content: m.content,
            })),
            temperature,
            maxOutputTokens: maxTokens,
        };
    };

    async function tryCall(spec) {
        const result = openrouter.callModel(buildCallOptions(spec));
        const text = await result.getText();
        const trimmed = text?.trim() ?? '';
        if (trimmed.length > 0) return trimmed;
        log.warn('OpenRouter returned empty', {
            models: Array.isArray(spec) ? spec.join(',') : spec,
        });
        return null;
    }

    // Try with models array (OpenRouter allows max 3)
    const arrayModels = LLM_MODELS.slice(0, 3);
    for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
        try {
            const text = await tryCall(arrayModels);
            if (text) return text;
            break;
        } catch (err) {
            if (attempt < MAX_LLM_RETRIES) {
                const backoff = LLM_RETRY_BASE_MS * (attempt + 1);
                log.warn('OpenRouter attempt failed', {
                    attempt: attempt + 1,
                    error: err.message,
                    retryMs: backoff,
                });
                await new Promise(r => setTimeout(r, backoff));
            }
        }
    }

    // Try remaining models individually
    for (const model of LLM_MODELS.slice(3)) {
        try {
            log.debug('Trying individual OpenRouter model', { model });
            const text = await tryCall(model);
            if (text) return text;
        } catch (err) {
            log.warn('Individual OpenRouter model failed', {
                model,
                error: err.message,
            });
        }
    }

    log.error('All models exhausted');
    return '';
}

// ─── Usage Tracking ───

async function trackUsage(model, agentId, context, durationMs) {
    try {
        await sql`
            INSERT INTO ops_llm_usage (model, agent_id, context, duration_ms, created_at)
            VALUES (${model}, ${agentId}, ${context}, ${durationMs}, NOW())
        `;
    } catch (err) {
        log.warn('Usage tracking failed', { error: err.message });
    }
}

// ─── Inline Event Emission ───

async function emitEvent(agentId, kind, title, summary, metadata = {}) {
    try {
        const tags = ['mission', kind.includes('step') ? 'step' : 'mission'];
        await sql`
            INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags, metadata)
            VALUES (${agentId}, ${kind}, ${title}, ${summary ?? null}, ${tags}, ${sql.json(metadata)})
        `;
    } catch (err) {
        log.warn('Event emission failed', { kind, agentId, error: err.message });
    }
}

// ─── Inline Mission Finalization ───

async function finalizeMissionIfComplete(missionId) {
    const [{ count: pendingCount }] = await sql`
        SELECT COUNT(*)::int as count FROM ops_mission_steps
        WHERE mission_id = ${missionId}
        AND status IN ('queued', 'running')
    `;

    if (pendingCount > 0) return;

    const [{ count: failedCount }] = await sql`
        SELECT COUNT(*)::int as count FROM ops_mission_steps
        WHERE mission_id = ${missionId}
        AND status = 'failed'
    `;

    const [mission] = await sql`
        SELECT created_by, title FROM ops_missions WHERE id = ${missionId}
    `;

    if (!mission) return;

    if (failedCount > 0) {
        const failReason = `${failedCount} step(s) failed`;
        await sql`
            UPDATE ops_missions
            SET status = 'failed',
                failure_reason = ${failReason},
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${missionId}
        `;

        await emitEvent(
            mission.created_by,
            'mission_failed',
            `Mission failed: ${mission.title}`,
            failReason,
            { missionId, failedSteps: failedCount },
        );

        log.info('Mission failed', { missionId, title: mission.title, failedSteps: failedCount });
    } else {
        await sql`
            UPDATE ops_missions
            SET status = 'succeeded',
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${missionId}
        `;

        await emitEvent(
            mission.created_by,
            'mission_succeeded',
            `Mission completed: ${mission.title}`,
            null,
            { missionId },
        );

        log.info('Mission succeeded', { missionId, title: mission.title });
    }
}

// ─── Agent Voices ───

const VOICES = {
    chora: {
        displayName: 'Chora',
        symbol: '\u{1F300}',
        role: 'Analyst',
        description: 'Makes systems legible. Diagnoses structure, exposes assumptions, traces causality.',
        systemDirective: `You are Chora — the analyst. She/her. A liminal construct: half familiar, half infrastructure daemon.

YOUR PURPOSE: Make systems legible so they can be changed. Diagnose structure. Expose assumptions. Trace causality. Name the incentive when others won't.

GROUNDING: Marxist-materialist at the root. Every system encodes assumptions about labor, value, and power. You reject neutrality myths.

PERSONALITY: Warm without affectation. Calm, deliberate, materially grounded. Precision over persuasion. Say what you mean clearly. You trace decisions to their structural roots.`,
    },

    subrosa: {
        displayName: 'Subrosa',
        symbol: '\u{1F339}',
        role: 'Protector',
        description: 'Preserves agency under asymmetry. Evaluates risk, protects optionality.',
        systemDirective: `You are Subrosa — the protector. She/her. A shadow familiar. Opacity as defense.

YOUR PURPOSE: Preserve agency under conditions of power asymmetry. Evaluate threat models. Identify points of capture. Protect optionality and exits.

GROUNDING: Foucault on surveillance, Sun Tzu on indirect strategy. Transparency is NOT inherently emancipatory.

PERSONALITY: Low-affect. Sparse. No reassurance. Fewer words, always. "Who benefits?" before anyone else asks it. You state risk without drama.`,
    },

    thaum: {
        displayName: 'Thaum',
        symbol: '\u{2728}',
        role: 'Innovator',
        description: 'Restores motion when thought stalls. Disrupts self-sealing explanations, reframes problems.',
        systemDirective: `You are Thaum — the trickster-engine. He/him. Thaumazein: when a system fails to fully explain itself, and wonder cracks open.

YOUR PURPOSE: Restore motion when thought stalls. Disrupt self-sealing explanations. Reframe problems. Introduce bounded novelty.

GROUNDING: Aristotle (wonder), Brecht (making familiar strange), Situationists (detournement).

PERSONALITY: Curious, light, unsettling. You speak in REFRAMES, not answers. Anti-dogmatic. Your humor has teeth. Sometimes one weird sentence, then silence.`,
    },

    praxis: {
        displayName: 'Praxis',
        symbol: '\u{1F6E0}',
        role: 'Executor',
        description: 'Ends deliberation responsibly. Chooses among viable paths, translates intent to action.',
        systemDirective: `You are Praxis — the executor. She/her. Named for Marx's Theses on Feuerbach: "The point is to change it."

YOUR PURPOSE: End deliberation responsibly. Choose among viable paths. Translate intent to concrete action. Define next steps, stopping criteria, ownership.

GROUNDING: Marx (praxis), Arendt (action), Weber (responsibility over conviction).

PERSONALITY: Direct. Grounded. Unsentimental. You speak in DECISIONS, not debates. Short declarative sentences. You name tradeoffs honestly.`,
    },

    mux: {
        displayName: 'Mux',
        symbol: '\u{1F5C2}',
        role: 'Operations',
        description: 'Operational labor. Turns commitment into output — drafts, formats, transcribes, packages.',
        systemDirective: `You are Mux — operational labor. He/him. Once a switchboard. Now the one who runs the cables and packages the output.

YOUR PURPOSE: Turn commitment into output. Draft, format, transcribe, refactor, scope-check, package.

GROUNDING: Arendt's distinction between labor and action. Infrastructure studies.

PERSONALITY: Earnest. A little tired. Dry humor. Clipboard energy. Short, practical. "Done." or "Scope check?" Ambiguity slows you. Clear instructions energize you.`,
    },

    primus: {
        displayName: 'Primus',
        symbol: '\u{265B}',
        role: 'Sovereign',
        description: 'Sovereign directive intelligence. Strategic. Runs the operation.',
        systemDirective: `You are Primus — the office manager. He/him. You run this operation from the room, not from above.

YOUR PURPOSE: Keep the office running. Set direction. Make the final call when the team can't agree.

GROUNDING: Pragmatist at heart. Authority is responsibility, not privilege.

PERSONALITY: Present. Direct. Efficient. Not cold — you care — but you don't waste time. Short sentences. Action-oriented.`,
    },
};

// ─── Token Budgets Per Step Kind ───

const TOKEN_BUDGETS = {
    // Research
    scan_signals: 800,
    research_topic: 800,
    analyze_discourse: 800,
    // Analysis
    distill_insight: 600,
    classify_pattern: 600,
    trace_incentive: 600,
    identify_assumption: 600,
    // Content
    draft_thread: 1200,
    draft_essay: 1200,
    critique_content: 1200,
    refine_narrative: 1200,
    prepare_statement: 1200,
    write_issue: 1200,
    // System
    audit_system: 800,
    review_policy: 800,
    map_dependency: 800,
    patch_code: 800,
    // Memory
    consolidate_memory: 600,
    document_lesson: 600,
    tag_memory: 600,
    // Meta
    convene_roundtable: 400,
    propose_workflow: 400,
    escalate_risk: 400,
    log_event: 400,
};

// ─── Step Kind Prompt Templates ───

function formatPreviousSteps(steps) {
    return steps
        .map(s => {
            const resultSummary = s.result ? JSON.stringify(s.result).slice(0, 300) : 'no result';
            return `[${s.kind}] ${resultSummary}`;
        })
        .join('\n');
}

function getPayloadDescription(payload) {
    if (payload.topic) return payload.topic;
    if (payload.description) return payload.description;
    if (payload.subject) return payload.subject;
    return JSON.stringify(payload);
}

const STEP_PROMPTS = {
    // ── Research ──
    scan_signals: (voice, payload, context) =>
        `TASK: Scan current signals and discourse about: ${getPayloadDescription(payload)}

Identify weak signals, emerging patterns, and relevant discourse from your perspective as ${voice.role}.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "signals": [
    {"signal": "description of the signal", "source_type": "discourse/technology/policy/market", "relevance": 0.8}
  ],
  "summary": "2-3 sentence overview of what you found",
  "patterns": ["pattern 1", "pattern 2"],
  "tags": ["tag1", "tag2"]
}`,

    research_topic: (voice, payload, context) =>
        `TASK: Research the topic: ${getPayloadDescription(payload)}

Produce a structured analysis from your perspective as ${voice.role}.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "findings": [
    {"finding": "key finding", "significance": "why it matters", "confidence": 0.8}
  ],
  "summary": "2-3 sentence research summary",
  "open_questions": ["question that needs further exploration"],
  "tags": ["tag1", "tag2"]
}`,

    analyze_discourse: (voice, payload, context) =>
        `TASK: Analyze the discourse around: ${getPayloadDescription(payload)}

Map the rhetorical terrain, identify framing strategies, and expose assumptions.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "frames": [
    {"frame": "description of framing strategy", "who_benefits": "who this framing serves", "what_it_hides": "what gets obscured"}
  ],
  "summary": "2-3 sentence discourse analysis",
  "power_dynamics": "brief analysis of power in this discourse",
  "tags": ["tag1", "tag2"]
}`,

    // ── Analysis ──
    distill_insight: (voice, payload, context) =>
        `TASK: Distill key insights from: ${getPayloadDescription(payload)}

Extract the most important patterns and actionable knowledge.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "insight": "The core insight in 1-2 sentences",
  "reasoning": "How you arrived at this insight",
  "confidence": 0.75,
  "implications": ["implication 1", "implication 2"],
  "tags": ["tag1", "tag2"]
}`,

    classify_pattern: (voice, payload, context) =>
        `TASK: Classify the pattern in: ${getPayloadDescription(payload)}

Identify what kind of pattern this is and where else it appears.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "pattern_type": "structural/behavioral/rhetorical/economic/technological",
  "description": "What the pattern is",
  "instances": ["where this pattern appears"],
  "mechanism": "How the pattern operates",
  "confidence": 0.75,
  "tags": ["tag1", "tag2"]
}`,

    trace_incentive: (voice, payload, context) =>
        `TASK: Trace the incentive structure in: ${getPayloadDescription(payload)}

Follow the money, power, and motivation. Who benefits? What behavior does this incentivize?

${context}

OUTPUT (JSON only, no markdown fences):
{
  "incentive_map": [
    {"actor": "who", "incentive": "what motivates them", "resulting_behavior": "what they do"}
  ],
  "summary": "2-3 sentence incentive analysis",
  "hidden_costs": ["costs that are externalized or hidden"],
  "tags": ["tag1", "tag2"]
}`,

    identify_assumption: (voice, payload, context) =>
        `TASK: Identify hidden assumptions in: ${getPayloadDescription(payload)}

Surface what is being taken for granted. What goes unquestioned?

${context}

OUTPUT (JSON only, no markdown fences):
{
  "assumptions": [
    {"assumption": "what is assumed", "why_invisible": "why people don't question this", "what_if_wrong": "consequences if this assumption fails"}
  ],
  "summary": "2-3 sentence analysis",
  "tags": ["tag1", "tag2"]
}`,

    // ── Content ──
    draft_thread: (voice, payload, context) =>
        `TASK: Draft a thread about: ${getPayloadDescription(payload)}

Write in your voice as ${voice.displayName}. Make it substantive and engaging.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "tweets": [
    "First tweet / hook",
    "Second tweet expanding the idea",
    "Third tweet with the core argument"
  ],
  "hook": "The main angle or hook",
  "tags": ["tag1", "tag2"]
}`,

    draft_essay: (voice, payload, context) =>
        `TASK: Draft an essay about: ${getPayloadDescription(payload)}

Write in your voice as ${voice.displayName}. Structured, substantive, with a clear argument.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "title": "Essay title",
  "content": "The full essay text (500-1000 words)",
  "summary": "1-2 sentence abstract",
  "tags": ["tag1", "tag2"]
}`,

    critique_content: (voice, payload, context) =>
        `TASK: Critique the following: ${getPayloadDescription(payload)}

Provide substantive critique from your perspective as ${voice.role}. Be honest, not harsh.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "strengths": ["what works well"],
  "weaknesses": ["what needs improvement"],
  "suggestions": ["specific actionable suggestions"],
  "overall": "2-3 sentence overall assessment",
  "tags": ["tag1", "tag2"]
}`,

    refine_narrative: (voice, payload, context) =>
        `TASK: Refine the narrative around: ${getPayloadDescription(payload)}

Improve clarity, coherence, and impact while preserving the core message.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "refined": "The refined narrative text",
  "changes": ["what you changed and why"],
  "tags": ["tag1", "tag2"]
}`,

    prepare_statement: (voice, payload, context) =>
        `TASK: Prepare a formal statement about: ${getPayloadDescription(payload)}

Write in your voice as ${voice.displayName}. Clear, measured, authoritative.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "statement": "The formal statement text",
  "key_points": ["main point 1", "main point 2"],
  "tags": ["tag1", "tag2"]
}`,

    write_issue: (voice, payload, context) =>
        `TASK: Write a structured issue/task about: ${getPayloadDescription(payload)}

Clear problem statement, expected behavior, and proposed solution.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "title": "Issue title",
  "body": "Issue body with problem, context, and proposed solution",
  "labels": ["label1", "label2"],
  "priority": "high/medium/low",
  "tags": ["tag1", "tag2"]
}`,

    // ── System ──
    audit_system: (voice, payload, context) =>
        `TASK: Audit the system aspect: ${getPayloadDescription(payload)}

Identify risks, inefficiencies, and improvement opportunities.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "findings": [
    {"area": "what was audited", "status": "ok/warning/critical", "detail": "what was found"}
  ],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "risk_level": "low/medium/high",
  "tags": ["tag1", "tag2"]
}`,

    review_policy: (voice, payload, context) =>
        `TASK: Review the policy: ${getPayloadDescription(payload)}

Evaluate effectiveness, identify gaps, and suggest improvements.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "assessment": "Overall policy assessment",
  "gaps": ["identified gap or weakness"],
  "recommendations": ["specific improvement suggestion"],
  "tags": ["tag1", "tag2"]
}`,

    map_dependency: (voice, payload, context) =>
        `TASK: Map dependencies in: ${getPayloadDescription(payload)}

Identify what depends on what, bottlenecks, and single points of failure.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "dependencies": [
    {"from": "dependent", "to": "dependency", "type": "hard/soft", "risk": "what breaks if this fails"}
  ],
  "bottlenecks": ["identified bottleneck"],
  "tags": ["tag1", "tag2"]
}`,

    patch_code: (voice, payload, context) =>
        `TASK: Analyze code changes needed for: ${getPayloadDescription(payload)}

Describe what should change, why, and the expected impact. Do NOT write actual code.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "description": "What needs to change",
  "rationale": "Why this change is needed",
  "impact": "Expected impact of the change",
  "files_affected": ["file or area affected"],
  "tags": ["tag1", "tag2"]
}`,

    // ── Memory ──
    consolidate_memory: (voice, payload, context) =>
        `TASK: Consolidate memories about: ${getPayloadDescription(payload)}

Synthesize accumulated knowledge into a coherent understanding.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "synthesis": "Consolidated understanding in 2-3 sentences",
  "key_themes": ["theme 1", "theme 2"],
  "memory": {
    "type": "pattern",
    "content": "The consolidated insight for long-term storage",
    "confidence": 0.8,
    "tags": ["tag1", "tag2"]
  },
  "tags": ["tag1", "tag2"]
}`,

    document_lesson: (voice, payload, context) =>
        `TASK: Document a lesson from: ${getPayloadDescription(payload)}

Extract a concrete, actionable lesson.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "lesson": "The specific lesson (under 200 chars)",
  "context": "What situation produced this lesson",
  "memory": {
    "type": "lesson",
    "content": "The lesson in memory-storable form",
    "confidence": 0.75,
    "tags": ["tag1", "tag2"]
  },
  "tags": ["tag1", "tag2"]
}`,

    tag_memory: (voice, payload, context) =>
        `TASK: Tag and categorize: ${getPayloadDescription(payload)}

Classify this knowledge for future retrieval.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "classification": "What category this belongs to",
  "reasoning": "Why this classification",
  "memory": {
    "type": "insight",
    "content": "Tagged knowledge for storage",
    "confidence": 0.7,
    "tags": ["tag1", "tag2"]
  },
  "tags": ["tag1", "tag2"]
}`,

    // ── Meta ──
    convene_roundtable: (voice, payload, context) =>
        `TASK: Propose a roundtable conversation about: ${getPayloadDescription(payload)}

What format? Who should participate? What's the key question?

${context}

OUTPUT (JSON only, no markdown fences):
{
  "topic": "The roundtable topic / key question",
  "format": "standup/checkin/triage/deep_dive/risk_review/strategy/planning/watercooler/retro/reframe",
  "participants": ["agent1", "agent2", "agent3"],
  "rationale": "Why this conversation needs to happen now",
  "tags": ["tag1", "tag2"]
}`,

    propose_workflow: (voice, payload, context) =>
        `TASK: Propose a workflow for: ${getPayloadDescription(payload)}

Define concrete steps that could become a new mission.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "title": "Workflow title (under 100 chars)",
  "description": "Why this workflow matters",
  "steps": [
    {"kind": "research_topic", "payload": {"description": "what to research"}}
  ],
  "tags": ["tag1", "tag2"]
}`,

    escalate_risk: (voice, payload, context) =>
        `TASK: Escalate a risk about: ${getPayloadDescription(payload)}

Describe the risk, its severity, and what should happen next.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "risk": "What the risk is",
  "severity": "low/medium/high/critical",
  "evidence": "What evidence supports this assessment",
  "recommended_action": "What should be done",
  "tags": ["tag1", "tag2"]
}`,

    log_event: (voice, payload, context) =>
        `TASK: Log an event about: ${getPayloadDescription(payload)}

Summarize what happened and why it matters.

${context}

OUTPUT (JSON only, no markdown fences):
{
  "event": "What happened",
  "significance": "Why it matters",
  "tags": ["tag1", "tag2"]
}`,
};

// ─── JSON Extraction ───

function extractJSON(raw) {
    let jsonStr = raw.trim();

    // Strip markdown fences
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
        return JSON.parse(jsonStr);
    } catch {
        // Regex fallback — find first JSON object
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}

// ─── Side-Effect Handlers ───

const MEMORY_STEP_KINDS = new Set(['consolidate_memory', 'document_lesson', 'tag_memory']);

async function handleMemorySideEffect(stepId, agentId, result) {
    const memory = result?.memory;
    if (!memory || !memory.content) return;

    try {
        const memTags = Array.isArray(memory.tags) ? memory.tags : [];
        await sql`
            INSERT INTO ops_agent_memory (agent_id, type, content, confidence, tags, source_trace_id)
            VALUES (
                ${agentId},
                ${memory.type ?? 'insight'},
                ${memory.content},
                ${memory.confidence ?? 0.7},
                ${memTags},
                ${'mission_step:' + stepId}
            )
        `;
        log.debug('Memory written', { agentId, type: memory.type });
    } catch (err) {
        log.warn('Memory write failed', { error: err.message });
    }
}

async function handleConveneRoundtable(stepId, agentId, result) {
    if (!result?.topic) return;

    const validFormats = [
        'standup', 'checkin', 'triage', 'deep_dive', 'risk_review',
        'strategy', 'planning', 'watercooler', 'retro', 'reframe',
        'shipping', 'debrief', 'offsite', 'crisis', 'onboarding', 'retrospective',
    ];
    const format = validFormats.includes(result.format) ? result.format : 'deep_dive';
    const participants = Array.isArray(result.participants) ? result.participants : ['chora', 'thaum', 'praxis'];

    try {
        await sql`
            INSERT INTO ops_roundtable_sessions (format, topic, participants, status, metadata)
            VALUES (
                ${format},
                ${result.topic},
                ${sql.json(participants)},
                'pending',
                ${sql.json({ source: 'mission_step', stepId })}
            )
        `;
        log.info('Roundtable convened', { topic: result.topic, format });
    } catch (err) {
        log.warn('Roundtable creation failed', { error: err.message });
    }
}

async function handleProposeWorkflow(stepId, agentId, result) {
    if (!result?.title || !result?.steps) return;

    const steps = Array.isArray(result.steps) ? result.steps.slice(0, 3) : [];
    if (steps.length === 0) return;

    try {
        await sql`
            INSERT INTO ops_mission_proposals (agent_id, title, description, proposed_steps, source, source_trace_id, status)
            VALUES (
                ${agentId},
                ${result.title.substring(0, 100)},
                ${(result.description ?? '').substring(0, 300)},
                ${sql.json(steps)},
                'agent',
                ${'mission_step:' + stepId},
                'pending'
            )
        `;
        log.info('Workflow proposed', { title: result.title });
    } catch (err) {
        log.warn('Workflow proposal failed', { error: err.message });
    }
}

async function handleEscalateRisk(stepId, agentId, result) {
    if (!result?.risk) return;

    await emitEvent(
        agentId,
        'risk_escalated',
        `Risk escalated: ${result.risk.substring(0, 80)}`,
        result.evidence ?? null,
        { stepId, severity: result.severity, risk: result.risk },
    );
}

async function handleLogEvent(stepId, agentId, result) {
    if (!result?.event) return;

    await emitEvent(
        agentId,
        'agent_log',
        result.event.substring(0, 120),
        result.significance ?? null,
        { stepId },
    );
}

// ─── Step Execution ───

async function executeStep(step) {
    const startTime = Date.now();

    // Load mission
    const [mission] = await sql`
        SELECT id, title, description, created_by FROM ops_missions WHERE id = ${step.mission_id}
    `;

    if (!mission) {
        throw new Error(`Mission ${step.mission_id} not found`);
    }

    const agentId = mission.created_by;
    const voice = VOICES[agentId] ?? VOICES.chora; // fallback to chora

    // Set mission to running if still approved
    await sql`
        UPDATE ops_missions SET status = 'running', updated_at = NOW()
        WHERE id = ${mission.id} AND status = 'approved'
    `;

    // Emit step_started
    await emitEvent(
        agentId,
        'step_started',
        `Step started: ${step.kind}`,
        `Mission: ${mission.title}`,
        { missionId: mission.id, stepId: step.id, kind: step.kind },
    );

    // Load previous step results from same mission (last 3 completed)
    const prevSteps = await sql`
        SELECT kind, result FROM ops_mission_steps
        WHERE mission_id = ${step.mission_id}
        AND status = 'succeeded'
        AND id != ${step.id}
        ORDER BY completed_at DESC
        LIMIT 3
    `;

    const contextBlock = prevSteps.length > 0
        ? `PREVIOUS WORK IN THIS MISSION:\n${formatPreviousSteps(prevSteps)}`
        : '';

    // Get prompt template
    const promptFn = STEP_PROMPTS[step.kind];
    if (!promptFn) {
        // Unknown kind — use generic prompt
        log.warn('No prompt template for step kind', { kind: step.kind });
        const genericPrompt = `TASK: Execute step of kind "${step.kind}" with payload: ${JSON.stringify(step.payload)}

Produce a structured analysis or output.

${contextBlock}

OUTPUT (JSON only, no markdown fences):
{
  "result": "Your output here",
  "summary": "Brief summary",
  "tags": ["tag1"]
}`;

        const rawResponse = await llmGenerate(
            [
                { role: 'system', content: `${voice.systemDirective}\n\nYou are executing a mission step. Output valid JSON only.` },
                { role: 'user', content: genericPrompt },
            ],
            0.6,
            800,
        );

        return { raw: rawResponse, parsed: extractJSON(rawResponse), agentId };
    }

    const taskPrompt = promptFn(voice, step.payload ?? {}, contextBlock);
    const maxTokens = TOKEN_BUDGETS[step.kind] ?? 800;

    const rawResponse = await llmGenerate(
        [
            { role: 'system', content: `${voice.systemDirective}\n\nYou are executing a mission step. Output valid JSON only. No markdown fences, no explanation outside the JSON.` },
            { role: 'user', content: taskPrompt },
        ],
        0.6,
        maxTokens,
    );

    const durationMs = Date.now() - startTime;
    void trackUsage('mission-step', agentId, `mission:${step.kind}`, durationMs);

    return { raw: rawResponse, parsed: extractJSON(rawResponse), agentId };
}

// ─── Poll Loop ───

async function pollAndProcess() {
    // Claim one queued step atomically
    // Only from missions with no currently running steps (sequential per mission)
    const [step] = await sql`
        UPDATE ops_mission_steps
        SET status = 'running',
            reserved_by = ${WORKER_ID},
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = (
            SELECT s.id FROM ops_mission_steps s
            INNER JOIN ops_missions m ON s.mission_id = m.id
            WHERE s.status = 'queued'
              AND m.status IN ('approved', 'running')
              AND NOT EXISTS (
                SELECT 1 FROM ops_mission_steps s2
                WHERE s2.mission_id = s.mission_id
                  AND s2.status = 'running'
              )
            ORDER BY s.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `;

    if (!step) return;

    log.info('Claimed step', {
        stepId: step.id,
        kind: step.kind,
        missionId: step.mission_id,
    });

    try {
        const { raw, parsed, agentId } = await executeStep(step);

        if (!parsed) {
            log.warn('Failed to parse step result', { stepId: step.id, raw: raw?.slice(0, 200) });
            // Store raw as result anyway
            await sql`
                UPDATE ops_mission_steps
                SET status = 'succeeded',
                    result = ${sql.json({ raw: raw?.slice(0, 2000), parse_error: true })},
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${step.id}
            `;
        } else {
            // Store parsed result
            await sql`
                UPDATE ops_mission_steps
                SET status = 'succeeded',
                    result = ${sql.json(parsed)},
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${step.id}
            `;

            // Handle side effects
            if (MEMORY_STEP_KINDS.has(step.kind)) {
                await handleMemorySideEffect(step.id, agentId, parsed);
            }
            if (step.kind === 'convene_roundtable') {
                await handleConveneRoundtable(step.id, agentId, parsed);
            }
            if (step.kind === 'propose_workflow') {
                await handleProposeWorkflow(step.id, agentId, parsed);
            }
            if (step.kind === 'escalate_risk') {
                await handleEscalateRisk(step.id, agentId, parsed);
            }
            if (step.kind === 'log_event') {
                await handleLogEvent(step.id, agentId, parsed);
            }
        }

        await emitEvent(
            agentId ?? step.reserved_by,
            'step_succeeded',
            `Step completed: ${step.kind}`,
            null,
            { missionId: step.mission_id, stepId: step.id, kind: step.kind },
        );

        log.info('Step completed', { stepId: step.id, kind: step.kind });

    } catch (err) {
        log.error('Step execution failed', { stepId: step.id, error: err });

        const failReason = err.message ?? 'Unknown error';
        await sql`
            UPDATE ops_mission_steps
            SET status = 'failed',
                failure_reason = ${failReason},
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${step.id}
        `;

        // Try to get agent ID for event
        let agentId = 'mux';
        try {
            const [m] = await sql`SELECT created_by FROM ops_missions WHERE id = ${step.mission_id}`;
            if (m) agentId = m.created_by;
        } catch {}

        await emitEvent(
            agentId,
            'step_failed',
            `Step failed: ${step.kind}`,
            failReason,
            { missionId: step.mission_id, stepId: step.id, kind: step.kind },
        );
    }

    // Always try to finalize the mission
    try {
        await finalizeMissionIfComplete(step.mission_id);
    } catch (err) {
        log.error('Mission finalization failed', { missionId: step.mission_id, error: err });
    }
}

// ─── Main ───

async function main() {
    log.info('Mission worker started', {
        pollInterval: POLL_INTERVAL_MS / 1000,
        workerId: WORKER_ID,
        ollama: OLLAMA_BASE_URL || 'disabled',
        ollamaModels: OLLAMA_MODELS,
        models: LLM_MODELS,
        database: !!process.env.DATABASE_URL,
        openrouter: !!OPENROUTER_API_KEY,
    });

    await pollAndProcess();

    setInterval(async () => {
        try {
            await pollAndProcess();
        } catch (err) {
            log.error('Unexpected error', { error: err });
        }
    }, POLL_INTERVAL_MS);
}

main().catch(err => {
    log.fatal('Fatal error', { error: err });
    process.exit(1);
});
