// spawn_droid tool — create a focused sub-agent for a specific task
// Droids are short-lived agent sessions with restricted workspace access.
import { sql } from '@/lib/db';
import { execInToolbox } from '../executor';
import { randomUUID } from 'node:crypto';
import type { NativeTool } from '../types';

const MAX_DROID_TIMEOUT = 300;
const DEFAULT_DROID_TIMEOUT = 120;

export const spawnDroidTool: NativeTool = {
    name: 'spawn_droid',
    description: 'Spawn a droid (sub-agent) to handle a focused task. The droid runs as an agent session with its own workspace under /workspace/droids/. Returns a droid_id to check status later with check_droid.',
    agents: ['praxis', 'mux', 'primus'],
    parameters: {
        type: 'object',
        properties: {
            task: {
                type: 'string',
                description: 'Clear description of what the droid should do',
            },
            output_path: {
                type: 'string',
                description: 'Where to write results relative to the droid workspace (e.g., "report.md")',
            },
            timeout_seconds: {
                type: 'number',
                description: `Max execution time in seconds (default ${DEFAULT_DROID_TIMEOUT}, max ${MAX_DROID_TIMEOUT})`,
            },
        },
        required: ['task'],
    },
    execute: async (params) => {
        const task = params.task as string;
        const rawOutputFilename = (params.output_path as string) ?? 'output.md';
        
        // Sanitize output_path: remove all path traversal attempts and unsafe characters
        const outputFilename = rawOutputFilename
            .replace(/\.\./g, '')                 // Remove all .. sequences (including ../ and ..\)
            .replace(/[^a-zA-Z0-9._-]/g, '_')     // Replace unsafe chars with underscore
            .replace(/^[._-]+/, '')               // Remove leading dots/dashes
            .slice(0, 128);                       // Limit length
        
        // Fallback to default if sanitization results in empty string
        const safeOutputFilename = outputFilename || 'output.md';
        
        const timeout = Math.min(
            (params.timeout_seconds as number) ?? DEFAULT_DROID_TIMEOUT,
            MAX_DROID_TIMEOUT,
        );

        const droidId = `droid-${randomUUID().slice(0, 8)}`;
        const droidDir = `/workspace/droids/${droidId}`;
        const outputPath = `droids/${droidId}/${safeOutputFilename}`;

        // Create droid workspace
        try {
            await execInToolbox(`mkdir -p ${droidDir}/output`, 5_000);

            // Write task description
            const taskContent = `# Droid Task\n\nID: ${droidId}\nCreated: ${new Date().toISOString()}\n\n## Task\n\n${task}\n\n## Output\n\nWrite results to: ${outputPath}\n`;
            const b64 = Buffer.from(taskContent).toString('base64');
            await execInToolbox(`echo '${b64}' | base64 -d > ${droidDir}/task.md`, 5_000);
        } catch {
            return { error: 'Failed to create droid workspace' };
        }

        // Build droid prompt with security boundaries
        const prompt = `You are a droid (focused sub-agent) with ID: ${droidId}.\n\n` +
            `## Your Task\n${task}\n\n` +
            `## Security Boundaries\n` +
            `- You can ONLY write files to droids/${droidId}/ using file_write\n` +
            `- You can read any file in /workspace/ using file_read\n` +
            `- You can use bash and web_search as needed\n` +
            `- You CANNOT write to /workspace/output/ directly — your parent agent must promote your work\n` +
            `- You CANNOT modify /workspace/projects/ source code — write patches to your droid workspace\n\n` +
            `## Output\n` +
            `Write your results to ${outputPath} using file_write.\n` +
            `When done, provide a clear summary of what you accomplished.\n`;

        // Create agent session for the droid
        try {
            const [session] = await sql<[{ id: string }]>`
                INSERT INTO ops_agent_sessions (
                    agent_id, prompt, source, source_id,
                    timeout_seconds, max_tool_rounds, status,
                    result
                ) VALUES (
                    ${droidId},
                    ${prompt},
                    'droid',
                    ${droidId},
                    ${timeout},
                    8,
                    'pending',
                    ${sql.json({ droid_id: droidId, output_path: outputPath })}::jsonb
                )
                RETURNING id
            `;

            return {
                droid_id: droidId,
                session_id: session.id,
                status: 'spawned',
                workspace: droidDir,
                output_path: outputPath,
            };
        } catch (err) {
            return { error: `Failed to spawn droid: ${(err as Error).message}` };
        }
    },
};
