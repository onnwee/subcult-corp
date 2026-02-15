// propose_policy_change tool — allows agents to propose governance changes
import type { NativeTool } from '../types';
import { proposeGovernanceChange } from '@/lib/ops/governance';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'propose-policy-change' });

/**
 * Create a propose_policy_change execute function bound to a specific agentId.
 * The agentId is captured via closure to identify who is proposing.
 */
export function createProposePolicyChangeExecute(agentId: string) {
    return async (params: Record<string, unknown>) => {
        const policyKey = params.policy_key as string;
        const proposedValue = params.proposed_value as Record<string, unknown>;
        const rationale = params.rationale as string;

        try {
            const proposalId = await proposeGovernanceChange(
                agentId,
                policyKey,
                proposedValue,
                rationale,
            );

            log.info('Governance proposal created via tool', {
                proposalId,
                agentId,
                policyKey,
            });

            return {
                success: true,
                proposal_id: proposalId,
                message: `Governance proposal created. A debate session will be scheduled with all agents to discuss this policy change. 4 out of 6 approvals required.`,
            };
        } catch (err) {
            const error = err as Error;
            log.error('Failed to create governance proposal', {
                error: error.message,
                agentId,
                policyKey,
            });

            return {
                success: false,
                error: error.message,
                message: `Failed to create proposal: ${error.message}`,
            };
        }
    };
}

export const proposePolicyChangeTool: NativeTool = {
    name: 'propose_policy_change',
    description:
        'Propose a change to a system policy. This will trigger a governance debate where all agents vote on the proposal. Requires 4/6 agent approval to pass.',
    agents: ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'],
    parameters: {
        type: 'object',
        properties: {
            policy_key: {
                type: 'string',
                description:
                    'The policy key to change (e.g., "auto_approve", "x_daily_quota", "content_policy"). Note: "system_enabled" is protected and cannot be changed.',
            },
            proposed_value: {
                type: 'object',
                description:
                    'The new value for the policy as a JSON object. Must match the expected structure for that policy.',
            },
            rationale: {
                type: 'string',
                description:
                    'Clear explanation of why this policy change is needed and what problem it solves. This will be shared in the governance debate.',
            },
        },
        required: ['policy_key', 'proposed_value', 'rationale'],
    },
    // Execute will be bound per-agent via createProposePolicyChangeExecute in registry
    execute: createProposePolicyChangeExecute('system'),
};
