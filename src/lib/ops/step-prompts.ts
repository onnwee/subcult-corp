// Step Prompts — maps mission step kinds to explicit prompts with tool instructions
// Used when routing mission steps through agent sessions instead of bare LLM calls.
//
// Templates are loaded from the ops_step_templates DB table (60s cache).
// Falls back to the hardcoded STEP_INSTRUCTIONS map if no DB template exists.

import { sql } from '@/lib/db';
import type { StepKind } from '../types';

export interface StepPromptContext {
    missionTitle: string;
    agentId: string;
    payload: Record<string, unknown>;
    outputPath?: string;
}

export interface StepTemplate {
    kind: string;
    template: string;
    tools_hint: string[];
    output_hint: string | null;
    version: number;
}

// ─── Template cache (60s TTL) ───

const TEMPLATE_CACHE_TTL_MS = 60_000;
const templateCache = new Map<string, { template: StepTemplate | null; ts: number }>();

export async function loadStepTemplate(kind: string): Promise<StepTemplate | null> {
    const cached = templateCache.get(kind);
    if (cached && Date.now() - cached.ts < TEMPLATE_CACHE_TTL_MS) {
        return cached.template;
    }

    const [row] = await sql<[StepTemplate?]>`
        SELECT kind, template, tools_hint, output_hint, version
        FROM ops_step_templates WHERE kind = ${kind}
    `;

    const template = row ?? null;
    templateCache.set(kind, { template, ts: Date.now() });
    return template;
}

/** Render a DB template by replacing {{key}} placeholders with context values */
function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

/**
 * Build an explicit, tool-aware prompt for a mission step.
 * Tries DB template first, falls back to hardcoded STEP_INSTRUCTIONS.
 * Returns the rendered prompt and the template version (if from DB).
 */
export async function buildStepPrompt(
    kind: StepKind,
    ctx: StepPromptContext,
): Promise<string>;
export async function buildStepPrompt(
    kind: StepKind,
    ctx: StepPromptContext,
    opts: { withVersion: true },
): Promise<{ prompt: string; templateVersion: number | null }>;
export async function buildStepPrompt(
    kind: StepKind,
    ctx: StepPromptContext,
    opts?: { withVersion: true },
): Promise<string | { prompt: string; templateVersion: number | null }> {
    const today = new Date().toISOString().split('T')[0];
    const payloadStr = JSON.stringify(ctx.payload, null, 2);
    const outputDir = ctx.outputPath ?? `agents/${ctx.agentId}/notes`;

    let header = `Mission: ${ctx.missionTitle}\n`;
    header += `Step: ${kind}\n`;
    header += `Payload: ${payloadStr}\n\n`;

    // Try DB template first
    let dbTemplate: StepTemplate | null = null;
    try {
        dbTemplate = await loadStepTemplate(kind);
    } catch {
        // DB unavailable — fall through to hardcoded
    }

    if (dbTemplate) {
        const vars: Record<string, string> = {
            date: today,
            agentId: ctx.agentId,
            missionTitle: ctx.missionTitle,
            missionSlug: slugify(ctx.missionTitle),
            outputDir,
            payload: payloadStr,
        };
        const rendered = renderTemplate(dbTemplate.template, vars);
        const prompt = header + rendered;
        return opts?.withVersion
            ? { prompt, templateVersion: dbTemplate.version }
            : prompt;
    }

    // Fall back to hardcoded instructions
    let body: string;
    const stepInstructions = STEP_INSTRUCTIONS[kind];
    if (stepInstructions) {
        body = stepInstructions(ctx, today, outputDir);
    } else {
        body = `Execute this step thoroughly. Write your results to ${outputDir}/ using file_write.\n`;
        body += `Provide a detailed summary of what you accomplished.\n`;
    }

    const prompt = header + body;
    return opts?.withVersion
        ? { prompt, templateVersion: null }
        : prompt;
}

type StepInstructionFn = (ctx: StepPromptContext, today: string, outputDir: string) => string;

const STEP_INSTRUCTIONS: Partial<Record<StepKind, StepInstructionFn>> = {
    research_topic: (ctx, today, outputDir) =>
        `Use web_search to research the topic described in the payload.\n` +
        `Search for 3-5 relevant queries to build a comprehensive picture.\n` +
        `Use web_fetch to read the most relevant pages.\n` +
        `Write your research notes to ${outputDir}/${today}__research__notes__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n` +
        `Include: key findings, sources, quotes, and your analysis.\n`,

    scan_signals: (ctx, today, outputDir) =>
        `Use web_search to scan for signals related to the payload topic.\n` +
        `Look for recent developments, trends, and notable changes.\n` +
        `Write a signal report to ${outputDir}/${today}__scan__signals__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n` +
        `Format: bullet points grouped by signal type (opportunity, threat, trend, noise).\n`,

    draft_essay: (ctx, today) =>
        `Read any research notes from agents/${ctx.agentId}/notes/ using file_read.\n` +
        `Draft an essay based on the payload and your research.\n` +
        `Write the draft to output/reports/${today}__draft__essay__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n` +
        `Include YAML front matter with artifact_id, created_at, agent_id, workflow_stage: "draft", status: "draft".\n`,

    draft_thread: (ctx, today) =>
        `Read any research notes from agents/${ctx.agentId}/notes/ using file_read.\n` +
        `Draft a concise thread (5-10 punchy points) based on the payload.\n` +
        `Write to output/reports/${today}__draft__thread__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n`,

    critique_content: (ctx, today) =>
        `Read the artifact or content referenced in the payload using file_read.\n` +
        `Write a structured critique to output/reviews/${today}__critique__review__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md.\n` +
        `Cover: strengths, weaknesses, factual accuracy, tone, suggestions for improvement.\n`,

    audit_system: (ctx, today) =>
        `Use bash to run system checks relevant to the payload.\n` +
        `Check file permissions, exposed ports, running services, or whatever the payload specifies.\n` +
        `Write findings to output/reviews/${today}__audit__security__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n` +
        `Rate findings by severity: critical, high, medium, low, info.\n`,

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    patch_code: (_ctx) =>
        `Read the relevant source files from projects/ using file_read.\n` +
        `Use bash to make code changes as described in the payload.\n` +
        `Write changed files using file_write to the projects/ directory.\n` +
        `Provide a summary of all changes made and why.\n`,

    distill_insight: (ctx, today) =>
        `Read recent outputs from output/ and agents/${ctx.agentId}/notes/ using file_read.\n` +
        `Synthesize into a concise digest of key insights.\n` +
        `Write to output/digests/${today}__distill__insight__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n`,

    document_lesson: (ctx, today) =>
        `Document the lesson or knowledge described in the payload.\n` +
        `Write clear, reusable documentation to the appropriate projects/ docs/ directory.\n` +
        `If no specific project, write to output/reports/${today}__docs__lesson__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md.\n`,

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    convene_roundtable: (_ctx) =>
        `This step triggers a roundtable conversation.\n` +
        `The payload should specify the format and topic.\n` +
        `Provide a summary of what the roundtable should discuss and why.\n`,

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    propose_workflow: (_ctx) =>
        `Based on the payload, propose a multi-step workflow.\n` +
        `Each step should specify: agent, step kind, and expected output.\n` +
        `Write the workflow proposal as a structured plan.\n`,

    memory_archaeology: (ctx, today, outputDir) =>
        `Perform a memory archaeology dig to analyze agent memories for patterns, contradictions, emergence, echoes, and drift.\n` +
        `Use the memory_search tool to retrieve relevant memories from the collective.\n` +
        `Analyze the memories for:\n` +
        `  - **Patterns**: Recurring themes, behaviors, or ideas across multiple memories\n` +
        `  - **Contradictions**: Conflicting memories or opposing viewpoints\n` +
        `  - **Emergence**: New behaviors, ideas, or perspectives that appear in recent memories\n` +
        `  - **Echoes**: Specific phrases, metaphors, or ideas that reappear across contexts\n` +
        `  - **Drift**: How perspectives, tone, or beliefs have shifted over time\n` +
        `Write your findings to ${outputDir}/${today}__archaeology__findings__${slugify(ctx.missionTitle)}__${ctx.agentId}__v01.md using file_write.\n` +
        `For each finding, include:\n` +
        `  1. Finding type (pattern/contradiction/emergence/echo/drift)\n` +
        `  2. A concise title\n` +
        `  3. Detailed description with evidence from specific memories\n` +
        `  4. Confidence level (0.0 to 1.0)\n` +
        `  5. Related agent IDs\n` +
        `Be specific and evidence-based. Include memory IDs and excerpts to support your findings.\n`,
};

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
}
