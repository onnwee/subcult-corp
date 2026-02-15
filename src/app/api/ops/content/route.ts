// /api/ops/content — List and manage content drafts
import { NextRequest, NextResponse } from 'next/server';
import { sql, jsonb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_NOTES_LENGTH = 5000;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const author = searchParams.get('author');
    const contentType = searchParams.get('content_type');
    const limit = Math.min(
        parseInt(searchParams.get('limit') ?? '20', 10),
        100,
    );

    try {
        const rows = await sql`
            SELECT * FROM ops_content_drafts
            WHERE 1=1
            ${status ? sql`AND status = ${status}` : sql``}
            ${author ? sql`AND author_agent = ${author}` : sql``}
            ${contentType ? sql`AND content_type = ${contentType}` : sql``}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;

        return NextResponse.json({ drafts: rows });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}

export async function PATCH(req: NextRequest) {
    // Auth check
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = (await req.json()) as {
            id?: string;
            status?: string;
            notes?: string;
        };

        if (!body.id || !body.status) {
            return NextResponse.json(
                { error: 'Missing required fields: id, status' },
                { status: 400 },
            );
        }

        // Validate notes field type and length
        if (body.notes !== undefined) {
            if (typeof body.notes !== 'string') {
                return NextResponse.json(
                    { error: 'Notes field must be a string' },
                    { status: 400 },
                );
            }
            if (body.notes.length > MAX_NOTES_LENGTH) {
                return NextResponse.json(
                    {
                        error: `Notes field too long (max ${MAX_NOTES_LENGTH} characters)`,
                    },
                    { status: 400 },
                );
            }
        }

        // Validate status value
        const validStatuses = [
            'draft',
            'review',
            'approved',
            'rejected',
            'published',
        ];
        if (!validStatuses.includes(body.status)) {
            return NextResponse.json(
                {
                    error: `Invalid status: ${body.status}. Must be one of: ${validStatuses.join(', ')}`,
                },
                { status: 400 },
            );
        }

        // Load current draft to validate transition
        const [draft] = await sql<[{ id: string; status: string }?]>`
            SELECT id, status FROM ops_content_drafts WHERE id = ${body.id}
        `;

        if (!draft) {
            return NextResponse.json(
                { error: 'Draft not found' },
                { status: 404 },
            );
        }

        // Validate status transitions
        const validTransitions: Record<string, string[]> = {
            draft: ['review'],
            review: ['approved', 'rejected'],
            approved: ['published'],
            rejected: ['draft'], // Allow re-drafting
            published: [],
        };

        const allowed = validTransitions[draft.status] ?? [];
        if (!allowed.includes(body.status)) {
            return NextResponse.json(
                {
                    error: `Invalid transition: ${draft.status} → ${body.status}. Allowed: ${allowed.join(', ') || 'none'}`,
                },
                { status: 400 },
            );
        }

        // Build update
        const updates: Record<string, unknown> = {
            status: body.status,
        };

        if (body.status === 'published') {
            updates.published_at = new Date().toISOString();
        }

        if (body.notes) {
            // Append note to reviewer_notes array
            // Map status to verdict value
            const verdict =
                body.status === 'approved' ? 'approve'
                : body.status === 'rejected' ? 'reject'
                : 'mixed';
            await sql`
                UPDATE ops_content_drafts
                SET status = ${body.status},
                    reviewer_notes = reviewer_notes || ${jsonb([{ reviewer: 'manual', verdict, notes: body.notes }])}::jsonb,
                    ${body.status === 'published' ? sql`published_at = NOW(),` : sql``}
                    updated_at = NOW()
                WHERE id = ${body.id}
            `;
        } else {
            await sql`
                UPDATE ops_content_drafts
                SET status = ${body.status},
                    ${body.status === 'published' ? sql`published_at = NOW(),` : sql``}
                    updated_at = NOW()
                WHERE id = ${body.id}
            `;
        }

        return NextResponse.json({
            success: true,
            id: body.id,
            status: body.status,
        });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
