// Skills Registry — maps agents to their available OpenClaw skills.
// All 19 ready skills from the OpenClaw gateway, assigned to agents
// by domain. Skills are executed via the OpenClaw bridge (chat completions).

import type {
    AgentId,
    SkillDefinition,
    AgentSkillSet,
    ToolDefinition,
} from '../types';
import { executeSkill } from './openclaw-bridge';

// Helper to create a single-tool skill definition
function skill(
    id: string,
    name: string,
    description: string,
    agents: AgentId[],
    toolName: string,
    toolDescription: string,
    parameters: Record<string, unknown>,
): SkillDefinition {
    return {
        id,
        name,
        description,
        agents,
        requiresGateway: true,
        enabled: true,
        tools: [
            {
                name: toolName,
                description: toolDescription,
                parameters,
                execute: async params => executeSkill(id, params),
            },
        ],
    };
}

// ─── Core Skills (available to all agents) ───

const ALL_AGENTS: AgentId[] = [
    'chora',
    'subrosa',
    'thaum',
    'praxis',
    'mux',
    'primus',
];

const CORE_SKILLS: SkillDefinition[] = [
    skill(
        'skill-creator',
        'Skill Creator',
        'Create or update OpenClaw agent skills — design, structure, and package skills with scripts and references.',
        ALL_AGENTS,
        'create_skill',
        'Design and create a new OpenClaw skill from a specification.',
        {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Skill name' },
                purpose: {
                    type: 'string',
                    description: 'What the skill should do',
                },
            },
            required: ['name', 'purpose'],
        },
    ),
    skill(
        'session-logs',
        'Session Logs',
        'Search and analyze session logs (past conversations) using jq.',
        ALL_AGENTS,
        'search_session_logs',
        'Search and analyze past session logs for patterns, decisions, or context.',
        {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'What to search for in session history',
                },
                timeframe: {
                    type: 'string',
                    description: 'How far back to look (e.g., "7d", "30d")',
                    default: '7d',
                },
            },
            required: ['query'],
        },
    ),
    skill(
        'weather',
        'Weather',
        'Get current weather and forecasts (no API key required).',
        ALL_AGENTS,
        'get_weather',
        'Get current weather conditions or forecast for a location.',
        {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'City or location name',
                },
            },
            required: ['location'],
        },
    ),
];

// ─── Chora — Analysis & Research ───

const CHORA_SKILLS: SkillDefinition[] = [
    skill(
        'ai-news-collector',
        'AI News Collector',
        'Aggregate and rank AI news by hotness — covers product launches, research papers, industry news, funding, and open-source updates.',
        ['chora'],
        'collect_ai_news',
        'Collect and rank the latest AI news. Returns summaries sorted by relevance.',
        {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description:
                        'Specific AI topic to focus on (optional)',
                },
            },
            required: [],
        },
    ),
    skill(
        'blogwatcher',
        'Blog Watcher',
        'Monitor blogs and RSS/Atom feeds for updates using the blogwatcher CLI.',
        ['chora'],
        'watch_blogs',
        'Check for new posts on monitored blogs and feeds.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['check', 'list', 'add', 'remove'],
                    default: 'check',
                },
                url: {
                    type: 'string',
                    description: 'Feed URL (for add/remove)',
                },
            },
            required: ['action'],
        },
    ),
    skill(
        'topic-monitor',
        'Topic Monitor',
        'Monitor topics of interest and alert when important developments occur — scheduled web searches with AI-powered importance scoring.',
        ['chora'],
        'monitor_topics',
        'Monitor tracked topics for important updates and developments.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['check', 'add', 'list', 'remove'],
                    default: 'check',
                },
                topic: {
                    type: 'string',
                    description: 'Topic to monitor',
                },
            },
            required: ['action'],
        },
    ),
    skill(
        'nano-pdf',
        'PDF Editor',
        'Edit PDFs with natural-language instructions using the nano-pdf CLI.',
        ['chora'],
        'edit_pdf',
        'Edit or analyze a PDF file using natural language instructions.',
        {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Path to the PDF file',
                },
                instruction: {
                    type: 'string',
                    description: 'What to do with the PDF',
                },
            },
            required: ['file', 'instruction'],
        },
    ),
];

// ─── Subrosa — Security & Ops ───

const SUBROSA_SKILLS: SkillDefinition[] = [
    skill(
        'healthcheck',
        'Host Healthcheck',
        'Host security hardening and risk assessment — firewall, SSH, updates, exposure review, and OpenClaw version status.',
        ['subrosa'],
        'healthcheck',
        'Run a security and health assessment on the host system.',
        {
            type: 'object',
            properties: {
                scope: {
                    type: 'string',
                    enum: ['full', 'security', 'services', 'updates'],
                    default: 'full',
                },
            },
            required: [],
        },
    ),
    skill(
        'himalaya',
        'Email (Himalaya)',
        'Manage emails via IMAP/SMTP — list, read, write, reply, forward, search, and organize.',
        ['subrosa'],
        'email_action',
        'Manage email — read, send, search, or organize messages.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: [
                        'list',
                        'read',
                        'send',
                        'reply',
                        'search',
                    ],
                },
                query: {
                    type: 'string',
                    description: 'Search query or message ID',
                },
                to: { type: 'string', description: 'Recipient (for send)' },
                subject: {
                    type: 'string',
                    description: 'Subject (for send)',
                },
                body: { type: 'string', description: 'Body (for send)' },
            },
            required: ['action'],
        },
    ),
];

// ─── Thaum — Creative & Media ───

const THAUM_SKILLS: SkillDefinition[] = [
    skill(
        'gifgrep',
        'GIF Search',
        'Search GIF providers, download results, and extract stills/sheets.',
        ['thaum'],
        'search_gifs',
        'Search for GIFs by keyword or phrase.',
        {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                count: {
                    type: 'number',
                    description: 'Number of results',
                    default: 5,
                },
            },
            required: ['query'],
        },
    ),
    skill(
        'video-frames',
        'Video Frames',
        'Extract frames or short clips from videos using ffmpeg.',
        ['thaum'],
        'extract_video_frames',
        'Extract frames or clips from a video file.',
        {
            type: 'object',
            properties: {
                file: { type: 'string', description: 'Path to the video' },
                mode: {
                    type: 'string',
                    enum: ['frames', 'clip', 'thumbnail'],
                    default: 'frames',
                },
                count: {
                    type: 'number',
                    description: 'Number of frames to extract',
                    default: 5,
                },
            },
            required: ['file'],
        },
    ),
    skill(
        'polymarket-agent',
        'Polymarket Agent',
        'Autonomous prediction market agent — analyzes markets, researches news, and identifies trading opportunities.',
        ['thaum'],
        'polymarket',
        'Analyze prediction markets or research a specific market question.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['analyze', 'search', 'trending'],
                    default: 'trending',
                },
                query: {
                    type: 'string',
                    description: 'Market question or search term',
                },
            },
            required: ['action'],
        },
    ),
];

// ─── Praxis — Execution & Infrastructure ───

const PRAXIS_SKILLS: SkillDefinition[] = [
    skill(
        'github',
        'GitHub',
        'Interact with GitHub using gh CLI — issues, PRs, CI runs, and API queries.',
        ['praxis'],
        'github_action',
        'Execute GitHub operations — issues, PRs, CI checks, or API calls.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: [
                        'issue',
                        'pr',
                        'run',
                        'api',
                        'repo',
                    ],
                },
                args: {
                    type: 'string',
                    description: 'Arguments for the action',
                },
            },
            required: ['action'],
        },
    ),
    skill(
        'coding-agent',
        'Coding Agent',
        'Run Codex CLI, Claude Code, OpenCode, or Pi Coding Agent via background process.',
        ['praxis'],
        'run_coding_agent',
        'Launch a coding agent to work on a programming task.',
        {
            type: 'object',
            properties: {
                task: {
                    type: 'string',
                    description: 'The coding task to accomplish',
                },
                agent: {
                    type: 'string',
                    enum: ['codex', 'claude', 'opencode'],
                    default: 'claude',
                },
            },
            required: ['task'],
        },
    ),
    skill(
        'tmux',
        'Tmux Control',
        'Remote-control tmux sessions — send keystrokes and scrape pane output for interactive CLIs.',
        ['praxis'],
        'tmux_control',
        'Control a tmux session — send commands or read output.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['send', 'read', 'list', 'new'],
                },
                session: {
                    type: 'string',
                    description: 'Tmux session name',
                },
                command: {
                    type: 'string',
                    description: 'Command to send (for send action)',
                },
            },
            required: ['action'],
        },
    ),
    skill(
        'mcporter',
        'MCP Porter',
        'List, configure, auth, and call MCP servers/tools directly — HTTP or stdio, config edits, and CLI generation.',
        ['praxis'],
        'mcp_action',
        'Interact with MCP servers — list tools, call endpoints, or manage config.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'call', 'config', 'auth'],
                },
                server: {
                    type: 'string',
                    description: 'MCP server name',
                },
                tool: {
                    type: 'string',
                    description: 'Tool name (for call)',
                },
                args: {
                    type: 'string',
                    description: 'Arguments (for call)',
                },
            },
            required: ['action'],
        },
    ),
];

// ─── Mux — Coordination & Places ───

const MUX_SKILLS: SkillDefinition[] = [
    skill(
        'goplaces',
        'Google Places',
        'Query Google Places API for text search, place details, resolve, and reviews.',
        ['mux'],
        'search_places',
        'Search for places, get details, or read reviews via Google Places API.',
        {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Place search query',
                },
                action: {
                    type: 'string',
                    enum: ['search', 'details', 'reviews'],
                    default: 'search',
                },
            },
            required: ['query'],
        },
    ),
    skill(
        'local-places',
        'Local Places',
        'Search for restaurants, cafes, etc. via Google Places API proxy.',
        ['mux'],
        'search_local',
        'Find local businesses and places nearby.',
        {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'What to search for',
                },
                location: {
                    type: 'string',
                    description: 'Location context',
                },
            },
            required: ['query'],
        },
    ),
    skill(
        'blucli',
        'BluOS Control',
        'BluOS CLI for speaker discovery, playback, grouping, and volume control.',
        ['mux'],
        'bluos_control',
        'Control BluOS speakers — play, pause, volume, group, or discover.',
        {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: [
                        'play',
                        'pause',
                        'volume',
                        'status',
                        'discover',
                        'group',
                    ],
                },
                target: {
                    type: 'string',
                    description: 'Speaker name or group',
                },
                value: {
                    type: 'string',
                    description: 'Value (e.g., volume level, URI)',
                },
            },
            required: ['action'],
        },
    ),
];

// ─── Full Registry ───

const ALL_SKILLS: SkillDefinition[] = [
    ...CORE_SKILLS,
    ...CHORA_SKILLS,
    ...SUBROSA_SKILLS,
    ...THAUM_SKILLS,
    ...PRAXIS_SKILLS,
    ...MUX_SKILLS,
];

/**
 * Get all skills available to a specific agent.
 */
export function getAgentSkills(agentId: AgentId): AgentSkillSet {
    const skills = ALL_SKILLS.filter(
        s => s.enabled && s.agents.includes(agentId),
    );
    const tools = skills.flatMap(s => s.tools);

    return { agentId, skills, tools };
}

/**
 * Get just the tool definitions for an agent (for passing to LLM).
 */
export function getAgentTools(agentId: AgentId): ToolDefinition[] {
    return getAgentSkills(agentId).tools;
}

/**
 * Get a specific skill by ID.
 */
export function getSkill(skillId: string): SkillDefinition | undefined {
    return ALL_SKILLS.find(s => s.id === skillId);
}

/**
 * List all registered skills.
 */
export function listAllSkills(): SkillDefinition[] {
    return [...ALL_SKILLS];
}

/**
 * Check if a specific agent has access to a skill.
 */
export function agentHasSkill(agentId: AgentId, skillId: string): boolean {
    const skill = getSkill(skillId);
    return !!skill && skill.enabled && skill.agents.includes(agentId);
}
