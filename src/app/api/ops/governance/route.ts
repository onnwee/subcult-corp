// /api/ops/governance — List governance proposals
import { NextRequest, NextResponse } from 'next/server';
import {
    getGovernanceProposals,
    type ProposalStatus,
} from '@/lib/ops/governance';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<ProposalStatus>([
    'proposed',
    'voting',
    'accepted',
    'rejected',
]);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const proposer = searchParams.get('proposer');
    const limit = Math.min(
        parseInt(searchParams.get('limit') ?? '50', 10),
        200,
    );

    // Validate status
    const status =
        statusParam && VALID_STATUSES.has(statusParam as ProposalStatus) ?
            (statusParam as ProposalStatus)
        :   undefined;

    try {
        const proposals = await getGovernanceProposals({
            status,
            proposer: proposer ?? undefined,
            limit,
        });

        // Compute vote summary for each proposal
        const enriched = proposals.map(p => {
            const votes =
                typeof p.votes === 'object' && p.votes !== null ?
                    (p.votes as Record<
                        string,
                        { vote: string; reason: string }
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
                    required: p.required_votes,
                },
            };
        });

        return NextResponse.json({ proposals: enriched });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
