// Barrel export for ops modules
export { createProposalAndMaybeAutoApprove } from './proposal-service';
export { checkCapGates } from './cap-gates';
export { getPolicy, setPolicy, clearPolicyCache } from './policy';
export { emitEvent, emitEventAndCheckReactions } from './events';
export { evaluateTriggers } from './triggers';
export { checkReactionMatrix, processReactionQueue } from './reaction-matrix';
export { recoverStaleSteps, maybeFinalializeMission } from './recovery';
export {
    queryAgentMemories,
    writeMemory,
    enforceMemoryCap,
    getCachedMemories,
    countTodayMemories,
} from './memory';
export { distillConversationMemories } from './memory-distiller';
export { learnFromOutcomes } from './outcome-learner';
export { enrichTopicWithMemory } from './memory-enrichment';
export {
    getRelationship,
    getAffinity,
    getAgentRelationships,
    loadAffinityMap,
    getAffinityFromMap,
    applyPairwiseDrifts,
    getInteractionType,
} from './relationships';
export {
    checkAndQueueInitiatives,
    maybeQueueInitiative,
    claimNextInitiative,
    completeInitiative,
    failInitiative,
} from './initiative';
export {
    deriveVoiceModifiers,
    clearVoiceModifierCache,
} from './voice-evolution';
