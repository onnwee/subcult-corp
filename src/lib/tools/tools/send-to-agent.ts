// send_to_agent tool — drop a file in another agent's inbox
import type { NativeTool } from '../types';
import { execInToolbox } from '../executor';

export const sendToAgentTool: NativeTool = {
    name: 'send_to_agent',
    description: 'Send a message or file to another agent by writing to their inbox. The file will appear in /workspace/agents/{target}/inbox/.',
    agents: ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'],
    parameters: {
        type: 'object',
        properties: {
            target_agent: {
                type: 'string',
                description: 'The agent to send to (chora, subrosa, thaum, praxis, mux, primus)',
                enum: ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'],
            },
            filename: {
                type: 'string',
                description: 'Filename for the message (e.g., "request-review.md")',
            },
            content: {
                type: 'string',
                description: 'The content of the message or file',
            },
        },
        required: ['target_agent', 'filename', 'content'],
    },
    execute: async (params) => {
        const target = params.target_agent as string;
        const filename = params.filename as string;
        const content = params.content as string;

        const validAgents = ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'];
        if (!validAgents.includes(target)) {
            return { error: `Invalid target agent: ${target}` };
        }

        // Sanitize filename
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fullPath = `/workspace/agents/${target}/inbox/${safeName}`;

        const b64 = Buffer.from(content).toString('base64');
        const dir = `/workspace/agents/${target}/inbox`;
        const command = `mkdir -p '${dir}' && echo '${b64}' | base64 -d > '${fullPath}'`;

        const result = await execInToolbox(command, 10_000);

        if (result.exitCode !== 0) {
            return { error: `Send failed: ${result.stderr || 'unknown error'}` };
        }

        return { sent_to: target, path: fullPath, bytes: content.length };
    },
};
