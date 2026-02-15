// Content Pipeline — extract content from writing_room sessions, process reviews
import { sql, jsonb } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { emitEvent } from '@/lib/ops/events';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'content-pipeline' });

// ─── Constants ───

const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 50000;

// ─── Types ───

export type ContentType =
    | 'essay'
    | 'thread'
    | 'statement'
    | 'poem'
    | 'manifesto';
export type ContentStatus =
    | 'draft'
    | 'review'
    | 'approved'
    | 'rejected'
    | 'published';

export interface ContentDraft {
    id: string;
    author_agent: string;
    content_type: ContentType;
    title: string;
    body: string;
    status: ContentStatus;
    review_session_id: string | null;
    reviewer_notes: ReviewerNote[];
    source_session_id: string | null;
    published_at: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface ReviewerNote {
    reviewer: string;
    verdict: 'approve' | 'reject' | 'mixed';
    notes: string;
}

// ─── Content Extraction ───

/**
 * Extract creative content from a completed writing_room session.
 * Parses the session transcript, uses LLM to separate creative work from discussion,
 * and stores the result as a draft in ops_content_drafts.
 *
 * @returns Draft ID on success, null if no extractable content or draft already exists.
 */
export async function extractContentFromSession(
    sessionId: string,
): Promise<string | null> {
    // Deduplication — skip if a draft already exists for this session
    const [existing] = await sql<[{ id: string }?]>`
        SELECT id FROM ops_content_drafts WHERE source_session_id = ${sessionId} LIMIT 1
    `;
    if (existing) {
        log.info('Draft already exists for session, skipping', {
            sessionId,
            draftId: existing.id,
        });
        return null;
    }

    // Load session info
    const [session] = await sql<
        [{ format: string; participants: string[]; topic: string }?]
    >`
        SELECT format, participants, topic FROM ops_roundtable_sessions WHERE id = ${sessionId}
    `;
    if (!session) {
        log.warn('Session not found', { sessionId });
        return null;
    }

    // Load transcript
    const turns = await sql<
        { speaker: string; dialogue: string; turn_number: number }[]
    >`
        SELECT speaker, dialogue, turn_number
        FROM ops_roundtable_turns
        WHERE session_id = ${sessionId}
        ORDER BY turn_number ASC
    `;

    if (turns.length === 0) {
        log.warn('No turns found for session', { sessionId });
        return null;
    }

    // Build transcript text
    const transcript = turns
        .map(t => `[${t.speaker}]: ${t.dialogue}`)
        .join('\n\n');

    // LLM extraction — temperature 0.3 for precision
    const extractionPrompt = `You are analyzing a creative writing session transcript. Extract the creative content that was produced during this session.

Session topic: ${session.topic}
Participants: ${session.participants.join(', ')}

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
1. Separate the actual creative work (the content being written) from the meta-discussion about the work
2. If multiple pieces of creative content exist, extract the primary/most complete one
3. Determine the content type based on the form and structure

Respond ONLY with valid JSON (no markdown fencing):
{
    "title": "Title of the creative work",
    "body": "The full creative content text",
    "contentType": "essay|thread|statement|poem|manifesto",
    "hasContent": true
}

If no extractable creative content exists, respond with:
{ "hasContent": false }`;

    try {
        const result = await llmGenerate({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a content extraction engine. Output only valid JSON.',
                },
                { role: 'user', content: extractionPrompt },
            ],
            temperature: 0.3,
            maxTokens: 4000,
            trackingContext: {
                context: 'content_extraction',
            },
        });

        // Parse the JSON response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn('No JSON found in extraction result', { sessionId });
            return null;
        }

        let parsed: {
            title?: string;
            body?: string;
            contentType?: string;
            hasContent?: boolean;
        };
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            log.warn('Invalid JSON in extraction result', {
                sessionId,
                error: parseErr,
            });
            return null;
        }

        if (!parsed.hasContent || !parsed.title || !parsed.body) {
            log.info('No extractable content found', { sessionId });
            return null;
        }

        // Validate that title and body are strings (LLM could return non-string types)
        if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
            log.warn('Title or body not strings, rejecting', {
                sessionId,
                titleType: typeof parsed.title,
                bodyType: typeof parsed.body,
            });
            return null;
        }

        // Validate content length
        if (parsed.title.length > MAX_TITLE_LENGTH) {
            log.warn('Title too long, truncating', { sessionId });
            parsed.title = parsed.title.slice(0, MAX_TITLE_LENGTH);
        }
        if (parsed.body.length > MAX_BODY_LENGTH) {
            log.warn('Body too long, truncating', { sessionId });
            parsed.body = parsed.body.slice(0, MAX_BODY_LENGTH);
        }

        // Validate content type
        const validTypes: ContentType[] = [
            'essay',
            'thread',
            'statement',
            'poem',
            'manifesto',
        ];
        const contentType: ContentType =
            validTypes.includes(parsed.contentType as ContentType) ?
                (parsed.contentType as ContentType)
            :   'essay';

        // Determine author — use the first participant (or coordinator)
        const authorAgent = session.participants[0] ?? 'mux';

        // Insert draft
        const [draft] = await sql<[{ id: string }]>`
            INSERT INTO ops_content_drafts (
                author_agent, content_type, title, body, status,
                source_session_id, metadata
            ) VALUES (
                ${authorAgent},
                ${contentType},
                ${parsed.title},
                ${parsed.body},
                'draft',
                ${sessionId},
                ${jsonb({ extractedFrom: 'writing_room', topic: session.topic })}
            )
            RETURNING id
        `;

        log.info('Content draft created', {
            draftId: draft.id,
            sessionId,
            contentType,
            author: authorAgent,
            titlePreview: parsed.title.slice(0, 60),
        });

        // Emit event for trigger system
        await emitEvent({
            agent_id: authorAgent,
            kind: 'content_draft_created',
            title: `Content draft created: ${parsed.title}`,
            summary: `${contentType} by ${authorAgent} extracted from writing_room session`,
            tags: ['content', 'draft', contentType],
            metadata: {
                draftId: draft.id,
                sessionId,
                contentType,
                titlePreview: parsed.title.slice(0, 100),
            },
        });

        return draft.id;
    } catch (err) {
        log.error('Content extraction failed', {
            error: err,
            sessionId,
        });
        return null;
    }
}

// ─── Review Processing ───

/**
 * Process a completed content_review session.
 * Parses reviewer consensus from the transcript and updates the draft status.
 *
 * - Majority approve → status 'approved'
 * - Majority reject → status 'rejected' with notes
 * - Mixed/unclear → stays in 'review' for manual review
 */
export async function processReviewSession(sessionId: string): Promise<void> {
    // Find the draft linked to this review session
    const [draft] = await sql<[ContentDraft?]>`
        SELECT * FROM ops_content_drafts WHERE review_session_id = ${sessionId} LIMIT 1
    `;

    if (!draft) {
        // Also check session metadata for draft_id
        const [session] = await sql<[{ metadata: Record<string, unknown> }?]>`
            SELECT metadata FROM ops_roundtable_sessions WHERE id = ${sessionId}
        `;
        const draftId =
            typeof session?.metadata?.draft_id === 'string' ?
                session.metadata.draft_id
            :   undefined;
        if (!draftId) {
            log.warn('No draft linked to review session', { sessionId });
            return;
        }

        // Try to find draft by ID
        const [draftById] = await sql<[ContentDraft?]>`
            SELECT * FROM ops_content_drafts WHERE id = ${draftId} LIMIT 1
        `;
        if (!draftById) {
            log.warn('Draft not found for review session', {
                sessionId,
                draftId,
            });
            return;
        }
        log.info('Found draft via metadata lookup', {
            sessionId,
            draftId,
        });
        return processReviewForDraft(draftById, sessionId);
    }

    return processReviewForDraft(draft, sessionId);
}

async function processReviewForDraft(
    draft: ContentDraft,
    sessionId: string,
): Promise<void> {
    // Load review transcript
    const turns = await sql<
        { speaker: string; dialogue: string; turn_number: number }[]
    >`
        SELECT speaker, dialogue, turn_number
        FROM ops_roundtable_turns
        WHERE session_id = ${sessionId}
        ORDER BY turn_number ASC
    `;

    if (turns.length === 0) {
        log.warn('No turns found for review session', { sessionId });
        return;
    }

    const transcript = turns
        .map(t => `[${t.speaker}]: ${t.dialogue}`)
        .join('\n\n');

    // LLM consensus extraction — temperature 0.2 for accuracy
    const reviewPrompt = `You are analyzing a content review session where agents reviewed a piece of creative writing.

CONTENT BEING REVIEWED:
Title: ${draft.title}
Type: ${draft.content_type}
Author: ${draft.author_agent}

REVIEW TRANSCRIPT:
${transcript}

INSTRUCTIONS:
Summarize each reviewer's verdict and reasoning. Determine the overall consensus.

Respond ONLY with valid JSON (no markdown fencing):
{
    "reviewers": [
        { "reviewer": "agent_name", "verdict": "approve|reject|mixed", "notes": "brief reasoning" }
    ],
    "consensus": "approved|rejected|mixed",
    "summary": "overall review summary"
}`;

    try {
        const result = await llmGenerate({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a review consensus analyzer. Output only valid JSON.',
                },
                { role: 'user', content: reviewPrompt },
            ],
            temperature: 0.2,
            maxTokens: 2000,
            trackingContext: {
                context: 'content_review',
            },
        });

        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn('No JSON found in review result', { sessionId });
            return;
        }

        let parsed: {
            reviewers?: ReviewerNote[];
            consensus?: string;
            summary?: string;
        };
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            log.warn('Invalid JSON in review result', {
                sessionId,
                draftId: draft.id,
                error: parseErr,
            });
            return;
        }

        const reviewerNotes: ReviewerNote[] = parsed.reviewers ?? [];
        const consensus = parsed.consensus ?? 'mixed';

        if (consensus === 'approved') {
            await sql`
                UPDATE ops_content_drafts
                SET status = 'approved',
                    reviewer_notes = ${jsonb(reviewerNotes)},
                    updated_at = NOW()
                WHERE id = ${draft.id}
            `;

            await emitEvent({
                agent_id: draft.author_agent,
                kind: 'content_approved',
                title: `Content approved: ${draft.title}`,
                summary: parsed.summary ?? 'Approved by reviewer consensus',
                tags: ['content', 'approved', draft.content_type],
                metadata: {
                    draftId: draft.id,
                    reviewSessionId: sessionId,
                    reviewerCount: reviewerNotes.length,
                },
            });

            log.info('Draft approved', {
                draftId: draft.id,
                reviewers: reviewerNotes.length,
            });
        } else if (consensus === 'rejected') {
            await sql`
                UPDATE ops_content_drafts
                SET status = 'rejected',
                    reviewer_notes = ${jsonb(reviewerNotes)},
                    updated_at = NOW()
                WHERE id = ${draft.id}
            `;

            await emitEvent({
                agent_id: draft.author_agent,
                kind: 'content_rejected',
                title: `Content rejected: ${draft.title}`,
                summary: parsed.summary ?? 'Rejected by reviewer consensus',
                tags: ['content', 'rejected', draft.content_type],
                metadata: {
                    draftId: draft.id,
                    reviewSessionId: sessionId,
                    reviewerCount: reviewerNotes.length,
                },
            });

            log.info('Draft rejected', {
                draftId: draft.id,
                reviewers: reviewerNotes.length,
            });
        } else {
            // Mixed — update notes but keep status as 'review' for manual review
            await sql`
                UPDATE ops_content_drafts
                SET reviewer_notes = ${jsonb(reviewerNotes)},
                    updated_at = NOW()
                WHERE id = ${draft.id}
            `;

            log.info('Draft review inconclusive, staying in review', {
                draftId: draft.id,
                consensus,
            });
        }
    } catch (err) {
        log.error('Review processing failed', {
            error: err,
            sessionId,
            draftId: draft.id,
        });
    }
}
