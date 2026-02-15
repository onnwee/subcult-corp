// Tool registry — maps agents to their available native tools
import type { AgentId, ToolDefinition } from '../types';
import type { NativeTool } from './types';
import { bashTool } from './tools/bash';
import { webSearchTool } from './tools/web-search';
import { webFetchTool } from './tools/web-fetch';
import { fileReadTool } from './tools/file-read';
import { fileWriteTool, createFileWriteExecute } from './tools/file-write';
import { sendToAgentTool } from './tools/send-to-agent';
import { spawnDroidTool } from './tools/spawn-droid';
import { checkDroidTool } from './tools/check-droid';
import { memorySearchTool } from './tools/memory-search';
import {
    proposePolicyChangeTool,
    createProposePolicyChangeExecute,
} from './tools/propose-policy-change';

/** All registered native tools */
const ALL_TOOLS: NativeTool[] = [
    bashTool,
    webSearchTool,
    webFetchTool,
    fileReadTool,
    fileWriteTool,
    sendToAgentTool,
    spawnDroidTool,
    checkDroidTool,
    memorySearchTool,
    proposePolicyChangeTool,
];

/**
 * Get all tools available to a specific agent.
 * Returns ToolDefinition[] suitable for passing directly to the LLM.
 * For file_write, binds the agentId into the execute function for ACL enforcement.
 * For propose_policy_change, binds the agentId to track who is proposing.
 */
export function getAgentTools(agentId: AgentId): ToolDefinition[] {
    return ALL_TOOLS
        .filter(tool => tool.agents.includes(agentId))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ agents: _agents, ...tool }) => {
            // Bind agentId into file_write's execute for path ACL enforcement
            if (tool.name === 'file_write') {
                return { ...tool, execute: createFileWriteExecute(agentId) };
            }
            // Bind agentId into propose_policy_change's execute to track proposer
            if (tool.name === 'propose_policy_change') {
                return {
                    ...tool,
                    execute: createProposePolicyChangeExecute(agentId),
                };
            }
            return tool;
        });
}

/**
 * Get a limited toolset for droid sub-agents.
 * Droids get file_read, file_write (ACL-bound to droids/ prefix), bash, web_search.
 */
export function getDroidTools(droidId: string): ToolDefinition[] {
    const droidToolNames = ['file_read', 'file_write', 'bash', 'web_search', 'web_fetch'];
    return ALL_TOOLS
        .filter(tool => droidToolNames.includes(tool.name))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ agents: _agents, ...tool }) => {
            if (tool.name === 'file_write') {
                return { ...tool, execute: createFileWriteExecute(droidId) };
            }
            return tool;
        });
}

/**
 * Get tool names available to a specific agent.
 */
export function getAgentToolNames(agentId: AgentId): string[] {
    return ALL_TOOLS
        .filter(tool => tool.agents.includes(agentId))
        .map(tool => tool.name);
}

/**
 * List all registered tools.
 */
export function listAllTools(): NativeTool[] {
    return [...ALL_TOOLS];
}
