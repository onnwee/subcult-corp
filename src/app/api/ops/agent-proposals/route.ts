// /api/ops/agent-proposals — Agent design proposals CRUD
// GET: list proposals with optional status filter
// POST: approve, reject, or spawn proposals
import { NextRequest, NextResponse } from 'next/server';
import {
    getProposals,
    getProposalById,
    setHumanApproval,
    type AgentProposalStatus,
} from '@/lib/ops/agent-designer';
import { tallyVotes } from '@/lib/ops/agent-proposal-voting';
import { prepareSpawn, executeSpawn } from '@/lib/ops/agent-spawner';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<AgentProposalStatus>([
    'proposed',
    'voting',
    'approved',
    'rejected',
    'spawned',
]);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const proposedBy = searchParams.get('proposed_by');
    const limit = Math.min(
        parseInt(searchParams.get('limit') ?? '50', 10),
        200,
    );

    const status =
        statusParam && VALID_STATUSES.has(statusParam as AgentProposalStatus) ?
            (statusParam as AgentProposalStatus)
        :   undefined;

    try {
        const proposals = await getProposals({
            status,
            proposedBy: proposedBy ?? undefined,
            limit,
        });

        // Enrich with vote summary
        const enriched = await Promise.all(
            proposals.map(async p => {
                const votes =
                    typeof p.votes === 'object' && p.votes !== null ?
                        (p.votes as Record<
                            string,
                            { vote: string; reasoning: string }
                        >)
                    :   {};
                const approvals = Object.values(votes).filter(
                    v => v.vote === 'approve',
                ).length;
                const rejections = Object.values(votes).filter(
                    v => v.vote === 'reject',
                ).length;

                return {
                    ...p,
                    vote_summary: {
                        approvals,
                        rejections,
                        total: Object.keys(votes).length,
                    },
                };
            }),
        );

        return NextResponse.json({ proposals: enriched });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, proposal_id } = body as {
            action: string;
            proposal_id: string;
        };

        if (!action || !proposal_id) {
            return NextResponse.json(
                { error: 'Missing action or proposal_id' },
                { status: 400 },
            );
        }

        // Verify proposal exists
        const proposal = await getProposalById(proposal_id);
        if (!proposal) {
            return NextResponse.json(
                { error: 'Proposal not found' },
                { status: 404 },
            );
        }

        switch (action) {
            case 'approve': {
                await setHumanApproval(proposal_id, true);
                return NextResponse.json({
                    ok: true,
                    message: `Proposal "${proposal.agent_name}" approved by human`,
                });
            }

            case 'reject': {
                await setHumanApproval(proposal_id, false);
                return NextResponse.json({
                    ok: true,
                    message: `Proposal "${proposal.agent_name}" rejected by human`,
                });
            }

            case 'preview': {
                if (proposal.status !== 'approved') {
                    return NextResponse.json(
                        {
                            error: `Cannot preview spawn — proposal status is "${proposal.status}" (must be "approved")`,
                        },
                        { status: 400 },
                    );
                }
                const preview = await prepareSpawn(proposal_id);
                return NextResponse.json({ preview });
            }

            case 'spawn': {
                if (proposal.status !== 'approved') {
                    return NextResponse.json(
                        {
                            error: `Cannot spawn — proposal status is "${proposal.status}" (must be "approved")`,
                        },
                        { status: 400 },
                    );
                }
                if (proposal.human_approved !== true) {
                    return NextResponse.json(
                        {
                            error: 'Cannot spawn — human approval required first',
                        },
                        { status: 403 },
                    );
                }
                const result = await executeSpawn(proposal_id);
                return NextResponse.json({ ok: true, result });
            }

            default:
                return NextResponse.json(
                    {
                        error: `Unknown action "${action}". Valid: approve, reject, preview, spawn`,
                    },
                    { status: 400 },
                );
        }
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
