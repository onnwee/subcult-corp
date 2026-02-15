// /api/ops/roundtable/ask — Public endpoint for user questions to the collective
import { NextRequest, NextResponse } from 'next/server';
import { enqueueConversation } from '@/lib/roundtable/orchestrator';
import { AGENT_IDS } from '@/lib/agents';
import type { ConversationFormat } from '@/lib/types';
import { logger } from '@/lib/logger';

const log = logger.child({ route: 'roundtable/ask' });

export const dynamic = 'force-dynamic';

const VALID_FORMATS: ConversationFormat[] = [
    'standup',
    'checkin',
    'triage',
    'deep_dive',
    'risk_review',
    'strategy',
    'planning',
    'shipping',
    'retro',
    'debate',
    'cross_exam',
    'brainstorm',
    'reframe',
    'writing_room',
    'content_review',
    'watercooler',
];

// ─── Rate limiting (in-memory, per IP, 1 req / 60s) ───
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;
const MAX_RATE_LIMIT_ENTRIES = 10_000; // Prevent unbounded memory growth

function getClientIp(req: NextRequest): string {
    return (
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        req.headers.get('cf-connecting-ip') ??
        'unknown'
    );
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const lastRequest = rateLimitMap.get(ip);

    if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
        const retryAfter = Math.ceil(
            (RATE_LIMIT_MS - (now - lastRequest)) / 1000,
        );
        return { allowed: false, retryAfter };
    }

    // Prevent unbounded growth - if map is full, clear old entries immediately
    if (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
        const cutoff = now - RATE_LIMIT_MS * 2;
        for (const [key, timestamp] of rateLimitMap.entries()) {
            if (timestamp < cutoff) rateLimitMap.delete(key);
        }
    }

    rateLimitMap.set(ip, now);
    return { allowed: true };
}

// Clean up stale entries periodically (every 5 minutes)
setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_MS * 2;
    for (const [ip, timestamp] of rateLimitMap.entries()) {
        if (timestamp < cutoff) rateLimitMap.delete(ip);
    }
}, 5 * 60_000);

/**
 * Pick 3-4 random agents for a user question session.
 */
function pickParticipants(): string[] {
    const count = 3 + Math.floor(Math.random() * 2); // 3 or 4
    const shuffled = [...AGENT_IDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// POST — submit a user question to the collective
export async function POST(req: NextRequest) {
    // Rate limit check
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);

    if (!rateCheck.allowed) {
        return NextResponse.json(
            {
                error: `Rate limited. Try again in ${rateCheck.retryAfter} seconds.`,
                retryAfter: rateCheck.retryAfter,
            },
            { status: 429 },
        );
    }

    try {
        const body = await req.json();

        // Validate question
        const question =
            typeof body.question === 'string' ? body.question.trim() : '';

        if (question.length < 10) {
            return NextResponse.json(
                { error: 'Question must be at least 10 characters.' },
                { status: 400 },
            );
        }

        if (question.length > 500) {
            return NextResponse.json(
                { error: 'Question must be 500 characters or fewer.' },
                { status: 400 },
            );
        }

        // Validate format (optional, default: debate)
        const format = (body.format ?? 'debate') as ConversationFormat;
        if (!VALID_FORMATS.includes(format)) {
            return NextResponse.json(
                {
                    error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}`,
                },
                { status: 400 },
            );
        }

        // Pick participants
        const participants = pickParticipants();

        // Enqueue the session
        const sessionId = await enqueueConversation({
            format,
            topic: question,
            participants,
            source: 'user_question',
            metadata: {
                source: 'user_question',
                userQuestion: question,
            },
        });

        log.info('User question submitted', {
            sessionId,
            format,
            questionLength: question.length,
            participants,
        });

        return NextResponse.json({ success: true, sessionId }, { status: 200 });
    } catch (err) {
        log.error('POST error', { error: err });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
