// file_read tool — read files from /workspace in the toolbox
import type { NativeTool } from '../types';
import { execInToolbox } from '../executor';

export const fileReadTool: NativeTool = {
    name: 'file_read',
    description: 'Read a file from the shared workspace. Returns the file contents as text.',
    agents: ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'],
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'File path relative to /workspace (e.g., "data/report.md")',
            },
            max_lines: {
                type: 'number',
                description: 'Maximum lines to read (default: all)',
            },
        },
        required: ['path'],
    },
    execute: async (params) => {
        const rawPath = params.path as string;
        const maxLines = params.max_lines as number | undefined;

        // Prevent path traversal
        const path = rawPath.replace(/\.\.\//g, '');
        const fullPath = path.startsWith('/workspace/')
            ? path
            : `/workspace/${path}`;

        let command = `cat '${fullPath.replace(/'/g, "'\\''")}'`;
        if (maxLines) {
            command = `head -n ${maxLines} '${fullPath.replace(/'/g, "'\\''")}'`;
        }

        const result = await execInToolbox(command, 10_000);

        if (result.exitCode !== 0) {
            return { error: `File read failed: ${result.stderr || 'file not found'}` };
        }

        return { path: fullPath, content: result.stdout, lines: result.stdout.split('\n').length };
    },
};
