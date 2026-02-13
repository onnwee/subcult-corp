// check_droid tool — check the status and output of a previously spawned droid
import { sql } from '@/lib/db';
import { execInToolbox } from '../executor';
import type { NativeTool } from '../types';

export const checkDroidTool: NativeTool = {
    name: 'check_droid',
    description: 'Check the status and output of a previously spawned droid. Returns status, output summary, and file listing.',
    agents: ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'],
    parameters: {
        type: 'object',
        properties: {
            droid_id: {
                type: 'string',
                description: 'The droid ID returned by spawn_droid (e.g., "droid-a1b2c3d4")',
            },
        },
        required: ['droid_id'],
    },
    execute: async (params) => {
        const droidId = params.droid_id as string;

        // Strict validation: droid IDs must be exactly "droid-" followed by 8 hex chars
        const droidIdRegex = /^droid-[0-9a-f]{8}$/;
        if (!droidIdRegex.test(droidId)) {
            return { error: 'Invalid droid ID format. Expected "droid-<8-hex-chars>".' };
        }

        // Check agent session status
        const [session] = await sql<[{
            id: string;
            status: string;
            result: Record<string, unknown> | null;
            error: string | null;
            completed_at: string | null;
        }?]>`
            SELECT id, status, result, error, completed_at
            FROM ops_agent_sessions
            WHERE source = 'droid' AND source_id = ${droidId}
            ORDER BY created_at DESC
            LIMIT 1
        `;

        if (!session) {
            return { error: `No droid found with ID: ${droidId}` };
        }

        // List files in droid workspace
        // droidId is validated, but use single quotes for extra safety
        const droidDir = `/workspace/droids/${droidId}`;
        const lsResult = await execInToolbox(`ls -la '${droidDir}/' 2>/dev/null || echo "(empty)"`, 5_000);

        // Read output file if it exists
        let outputContent: string | null = null;
        const outputPath = (session.result as Record<string, unknown>)?.output_path as string;
        if (outputPath && session.status === 'succeeded') {
            // Validate outputPath to prevent path traversal
            // Remove all variants of path traversal and normalize
            const safePath = outputPath
                .replace(/\.\./g, '')    // Remove all .. sequences
                .replace(/\/+/g, '/')    // Normalize multiple slashes
                .replace(/^\//, '');     // Remove leading slash
            
            // Must start with droids/ and not contain any remaining suspicious patterns
            if (safePath.startsWith('droids/') && !safePath.includes('..') && !safePath.includes('//')) {
                const readResult = await execInToolbox(
                    `cat '/workspace/${safePath}' 2>/dev/null | head -c 5000`,
                    5_000,
                );
                if (readResult.exitCode === 0 && readResult.stdout.trim()) {
                    outputContent = readResult.stdout.trim();
                }
            }
        }

        return {
            droid_id: droidId,
            session_id: session.id,
            status: session.status,
            error: session.error,
            completed_at: session.completed_at,
            files: lsResult.stdout.trim(),
            output_preview: outputContent?.slice(0, 2000) ?? null,
            output_path: outputPath ?? null,
        };
    },
};
