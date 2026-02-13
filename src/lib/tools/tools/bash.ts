// bash tool — execute commands in the toolbox container
import type { NativeTool } from '../types';
import { execInToolbox } from '../executor';

export const bashTool: NativeTool = {
    name: 'bash',
    description: 'Execute a bash command in the toolbox environment. Has access to curl, jq, git, node, python3, gh CLI, ripgrep, and fd-find.',
    agents: ['praxis', 'mux'],
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The bash command to execute',
            },
            timeout_ms: {
                type: 'number',
                description: 'Timeout in milliseconds (default 30000, max 120000)',
            },
        },
        required: ['command'],
    },
    execute: async (params) => {
        const command = params.command as string;
        const timeoutMs = Math.min(
            (params.timeout_ms as number) || 30_000,
            120_000,
        );

        const result = await execInToolbox(command, timeoutMs);

        if (result.timedOut) {
            return { error: `Command timed out after ${timeoutMs}ms`, stderr: result.stderr };
        }

        return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            ...(result.stderr ? { stderr: result.stderr } : {}),
        };
    },
};
