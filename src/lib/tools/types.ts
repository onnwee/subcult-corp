// Native tool types — extends the base ToolDefinition for local execution
import type { ToolDefinition, AgentId } from '../types';

/** Result from executing a command in the toolbox container */
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}

/** Native tool — extends ToolDefinition, executes locally or in toolbox */
export interface NativeTool extends ToolDefinition {
    /** Which agents can use this tool */
    agents: AgentId[];
}

/** Agent session status */
export type AgentSessionStatus =
    | 'pending'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'timed_out';

/** Agent session record (maps to ops_agent_sessions table) */
export interface AgentSession {
    id: string;
    agent_id: string;
    prompt: string;
    source: string;
    source_id?: string;
    status: AgentSessionStatus;
    model?: string;
    result?: Record<string, unknown>;
    tool_calls?: Record<string, unknown>[];
    llm_rounds: number;
    total_tokens: number;
    cost_usd: number;
    timeout_seconds: number;
    max_tool_rounds: number;
    error?: string;
    started_at?: string;
    completed_at?: string;
    created_at: string;
}

/** Cron schedule record (maps to ops_cron_schedules table) */
export interface CronSchedule {
    id: string;
    name: string;
    agent_id: string;
    cron_expression: string;
    timezone: string;
    prompt: string;
    timeout_seconds: number;
    max_tool_rounds: number;
    model?: string;
    enabled: boolean;
    last_fired_at?: string;
    next_fire_at?: string;
    created_at: string;
    updated_at: string;
}
