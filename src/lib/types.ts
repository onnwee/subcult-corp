// Core type definitions for the multi-agent system

// ─── Agent Types ───

export type AgentId = 'opus' | 'brain' | 'observer';

export interface AgentConfig {
    id: AgentId;
    displayName: string;
    role: string;
    description: string;
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
    | 'draft_tweet'
    | 'post_tweet'
    | 'crawl'
    | 'analyze'
    | 'write_content'
    | 'research'
    | 'deploy'
    | 'review'
    | 'summarize'
    | 'scan_signals';

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

export type ConversationFormat = 'standup' | 'debate' | 'watercooler';
export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface RoundtableVoice {
    displayName: string;
    tone: string;
    quirk: string;
    systemDirective: string;
}

export interface FormatConfig {
    minAgents: number;
    maxAgents: number;
    minTurns: number;
    maxTurns: number;
    temperature: number;
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
