// Step Prompts — maps mission step kinds to explicit prompts with tool instructions
// Used when routing mission steps through agent sessions instead of bare LLM calls.

import type { StepKind } from '../types';

interface StepPromptContext {
    missionTitle: string;
    agentId: string;
    payload: Record<string, unknown>;
    outputPath?: string;
}

/**
 * Build an explicit, tool-aware prompt for a mission step.
 * Each step kind gets specific instructions on which tools to use
 * and where to write output.
 */
export function buildStepPrompt(kind: StepKind, ctx: StepPromptContext): string {
    const today = new Date().toISOString().split('T')[0];
    const payloadStr = JSON.stringify(ctx.payload, null, 2);
    const outputDir = ctx.outputPath ?? `agents/${ctx.agentId}/notes`;

    let prompt = `Mission: ${ctx.missionTitle}\n`;
    prompt += `Step: ${kind}\n`;
    prompt += `Payload: ${payloadStr}\n\n`;

    const stepInstructions = STEP_INSTRUCTIONS[kind];
    if (stepInstructions) {
        prompt += stepInstructions(ctx, today, outputDir);
    } else {
        prompt += `Execute this step thoroughly. Write your results to ${outputDir}/ using file_write.\n`;
        prompt += `Provide a detailed summary of what you accomplished.\n`;
    }

    return prompt;
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

    patch_code: (ctx) =>
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

    convene_roundtable: (ctx) =>
        `This step triggers a roundtable conversation.\n` +
        `The payload should specify the format and topic.\n` +
        `Provide a summary of what the roundtable should discuss and why.\n`,

    propose_workflow: (ctx) =>
        `Based on the payload, propose a multi-step workflow.\n` +
        `Each step should specify: agent, step kind, and expected output.\n` +
        `Write the workflow proposal as a structured plan.\n`,
};

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
}
