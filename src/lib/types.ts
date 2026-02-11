// Core type definitions for the multi-agent system

// ─── Agent Types ───

export type AgentId =
    | 'chora'
    | 'subrosa'
    | 'thaum'
    | 'praxis'
    | 'mux'
    | 'primus';

export interface AgentConfig {
    id: AgentId;
    displayName: string;
    role: string;
    description: string;
    color: string;
    avatarKey: string;
    pixelSpriteKey: string;
    tailwindTextColor: string;
    tailwindBgColor: string;
    tailwindBorderBg: string;
}

// ─── Proposal Types ───

export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export type ProposalSource =
    | 'agent'
    | 'trigger'
    | 'reaction'
    | 'initiative'
    | 'conversation';

export interface ProposalInput {
    agent_id: string;
    title: string;
    description?: string;
    proposed_steps: ProposedStep[];
    source?: ProposalSource;
    source_trace_id?: string;
}

export interface ProposedStep {
    kind: StepKind;
    payload?: Record<string, unknown>;
}

export interface Proposal {
    id: string;
    agent_id: string;
    title: string;
    description?: string;
    status: ProposalStatus;
    rejection_reason?: string;
    proposed_steps: ProposedStep[];
    source: ProposalSource;
    source_trace_id?: string;
    auto_approved: boolean;
    created_at: string;
    updated_at: string;
}

// ─── Mission Types ───

export type MissionStatus =
    | 'approved'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled';

export interface Mission {
    id: string;
    proposal_id?: string;
    title: string;
    description?: string;
    status: MissionStatus;
    created_by: string;
    completed_at?: string;
    failure_reason?: string;
    created_at: string;
    updated_at: string;
}

// ─── Step Types ───

export type StepKind =
    | 'analyze_discourse'
    | 'scan_signals'
    | 'research_topic'
    | 'distill_insight'
    | 'classify_pattern'
    | 'trace_incentive'
    | 'identify_assumption'
    | 'draft_thread'
    | 'draft_essay'
    | 'critique_content'
    | 'refine_narrative'
    | 'prepare_statement'
    | 'write_issue'
    | 'audit_system'
    | 'review_policy'
    | 'consolidate_memory'
    | 'map_dependency'
    | 'patch_code'
    | 'document_lesson'
    | 'log_event'
    | 'tag_memory'
    | 'escalate_risk'
    | 'convene_roundtable'
    | 'propose_workflow';

export type StepStatus =
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'skipped';

export interface MissionStep {
    id: string;
    mission_id: string;
    kind: StepKind;
    status: StepStatus;
    payload: Record<string, unknown>;
    result?: Record<string, unknown>;
    reserved_by?: string;
    failure_reason?: string;
    started_at?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
}

// ─── Event Types ───

export interface AgentEvent {
    id: string;
    agent_id: string;
    kind: string;
    title: string;
    summary?: string;
    tags: string[];
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface EventInput {
    agent_id: string;
    kind: string;
    title: string;
    summary?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}

// ─── Policy Types ───

export interface Policy {
    key: string;
    value: Record<string, unknown>;
    description?: string;
    updated_at: string;
}

// ─── Trigger Types ───

export interface TriggerRule {
    id: string;
    name: string;
    trigger_event: string;
    conditions: Record<string, unknown>;
    action_config: Record<string, unknown>;
    cooldown_minutes: number;
    enabled: boolean;
    fire_count: number;
    last_fired_at?: string;
    created_at: string;
}

export interface TriggerCheckResult {
    fired: boolean;
    proposal?: ProposalInput;
    reason?: string;
}

// ─── Reaction Types ───

export interface ReactionPattern {
    source: string; // agent_id or '*' for any
    tags: string[]; // event tags to match
    target: string; // target agent_id
    type: string; // reaction type
    probability: number; // 0-1
    cooldown: number; // minutes
}

export interface ReactionMatrix {
    patterns: ReactionPattern[];
}

// ─── Cap Gate Types ───

export interface GateResult {
    ok: boolean;
    reason?: string;
}

// ─── Heartbeat Types ───

export interface HeartbeatResult {
    triggers: { evaluated: number; fired: number };
    reactions: { processed: number; created: number };
    stale: { recovered: number };
    duration_ms: number;
}

// ─── Action Run Types ───

export type ActionRunStatus = 'running' | 'succeeded' | 'failed';

export interface ActionRun {
    id: string;
    action: string;
    status: ActionRunStatus;
    result: Record<string, unknown>;
    error?: string;
    duration_ms?: number;
    created_at: string;
}

// ─── Roundtable Types ───

export type ConversationFormat =
    | 'standup'
    | 'checkin'
    | 'triage'
    | 'deep_dive'
    | 'risk_review'
    | 'strategy'
    | 'planning'
    | 'shipping'
    | 'retro'
    | 'debate'
    | 'cross_exam'
    | 'brainstorm'
    | 'reframe'
    | 'writing_room'
    | 'content_review'
    | 'watercooler';
export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface RoundtableVoice {
    displayName: string;
    symbol: string;
    pronouns: string;
    tone: string;
    quirk: string;
    failureMode: string;
    signaturePhrase: string;
    systemDirective: string;
}

export interface FormatConfig {
    coordinatorRole: AgentId;
    purpose: string;
    minAgents: number;
    maxAgents: number;
    minTurns: number;
    maxTurns: number;
    temperature: number;
    requires?: AgentId[];
    optional?: AgentId[];
    /** Default model for this format tier. Session-level override takes priority. */
    defaultModel?: string;
}

export interface ScheduleSlot {
    hour_utc: number;
    name: string;
    format: ConversationFormat;
    participants: string[];
    probability: number;
}

export interface RoundtableSession {
    id: string;
    format: ConversationFormat;
    topic: string;
    participants: string[];
    status: SessionStatus;
    scheduled_for?: string;
    schedule_slot?: string;
    model?: string;
    turn_count: number;
    metadata: Record<string, unknown>;
    created_at: string;
    started_at?: string;
    completed_at?: string;
}

export interface RoundtableTurn {
    id: string;
    session_id: string;
    turn_number: number;
    speaker: string;
    dialogue: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface ConversationTurnEntry {
    speaker: string;
    dialogue: string;
    turn: number;
}

// ─── LLM Types ───

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMGenerateOptions {
    messages: LLMMessage[];
    temperature?: number;
    maxTokens?: number;
    model?: string; // Override default model for this request
    tools?: ToolDefinition[];
    maxToolRounds?: number;
}

// ─── Tool / Skill Types ───

/**
 * A tool definition that the LLM can invoke.
 * Uses the OpenRouter SDK's callModel tool format with Zod schemas
 * and auto-execution via execute functions.
 */
export interface ToolDefinition {
    name: string;
    description: string;
    /** JSON Schema for tool parameters */
    parameters: Record<string, unknown>;
    /** If provided, the tool is auto-executed by the SDK */
    execute?: (params: Record<string, unknown>) => Promise<unknown>;
}

/** Result from an LLM call that may include tool invocations */
export interface LLMToolResult {
    text: string;
    toolCalls: ToolCallRecord[];
}

/** Record of a single tool invocation during generation */
export interface ToolCallRecord {
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
}

/**
 * Skill definition that maps to an OpenClaw skill.
 * Each skill becomes one or more tools available to specific agents.
 */
export interface SkillDefinition {
    /** Unique skill identifier (matches OpenClaw skill ID) */
    id: string;
    /** Human-readable name */
    name: string;
    /** What this skill does */
    description: string;
    /** Which agents can use this skill */
    agents: AgentId[];
    /** Whether this skill requires OpenClaw gateway (vs local execution) */
    requiresGateway: boolean;
    /** Tool definitions this skill provides */
    tools: ToolDefinition[];
    /** Whether the skill is currently enabled */
    enabled: boolean;
}

/** Agent-to-skills mapping (runtime registry) */
export interface AgentSkillSet {
    agentId: AgentId;
    skills: SkillDefinition[];
    tools: ToolDefinition[];
}

/** OpenClaw gateway connection config */
export interface OpenClawConfig {
    gatewayUrl: string;
    /** Auth token for the gateway */
    authToken?: string;
    /** Timeout for skill execution in ms */
    timeoutMs: number;
    /** Whether the gateway is available */
    available: boolean;
}

/** Result from executing a skill via OpenClaw */
export interface SkillExecutionResult {
    success: boolean;
    skillId: string;
    output: unknown;
    error?: string;
    durationMs: number;
}

// ─── Memory Types ───

export type MemoryType =
    | 'insight'
    | 'pattern'
    | 'strategy'
    | 'preference'
    | 'lesson';

export interface MemoryEntry {
    id: string;
    agent_id: string;
    type: MemoryType;
    content: string;
    confidence: number;
    tags: string[];
    source_trace_id?: string;
    superseded_by?: string;
    created_at: string;
}

export interface MemoryInput {
    agent_id: string;
    type: MemoryType;
    content: string;
    confidence?: number;
    tags?: string[];
    source_trace_id?: string;
}

export interface MemoryQuery {
    agentId: string;
    types?: MemoryType[];
    limit?: number;
    minConfidence?: number;
    tags?: string[];
}

export type MemoryCache = Map<string, MemoryEntry[]>;

export interface MemoryEnrichmentResult {
    topic: string;
    memoryInfluenced: boolean;
    memoryId?: string;
}

// ─── Relationship Types ───

export interface AgentRelationship {
    id: string;
    agent_a: string;
    agent_b: string;
    affinity: number;
    total_interactions: number;
    positive_interactions: number;
    negative_interactions: number;
    drift_log: DriftLogEntry[];
}

export interface DriftLogEntry {
    drift: number;
    reason: string;
    conversationId: string;
    at: string;
}

export interface PairwiseDrift {
    agent_a: string;
    agent_b: string;
    drift: number;
    reason: string;
}

export type InteractionType =
    | 'supportive'
    | 'agreement'
    | 'neutral'
    | 'critical'
    | 'challenge';

// ─── Initiative Types ───

export type InitiativeStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';

export interface InitiativeQueueEntry {
    id: string;
    agent_id: string;
    status: InitiativeStatus;
    context: Record<string, unknown>;
    created_at: string;
    processed_at?: string;
    result?: Record<string, unknown>;
}

export interface ActionItem {
    title: string;
    agent_id: string;
    step_kind: string;
}
