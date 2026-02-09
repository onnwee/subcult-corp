// Outcome Learner — extracts lessons from tweet performance and mission results
// Called by the heartbeat as Phase 5 to periodically review outcomes.
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeMemory, countTodayMemories } from './memory';

const MAX_LESSONS_PER_AGENT_PER_DAY = 3;

/**
 * Review recent outcomes and extract learning memories.
 * Sources:
 * 1. Tweet performance — strong/weak engagement patterns
 * 2. Mission outcomes — strategies that worked or failed
 */
export async function learnFromOutcomes(
    sb: SupabaseClient,
): Promise<{ tweetsLearned: number; missionsLearned: number }> {
    const tweetsLearned = await learnFromTweets(sb);
    const missionsLearned = await learnFromMissions(sb);

    if (tweetsLearned + missionsLearned > 0) {
        console.log(
            `[outcome-learner] Learned ${tweetsLearned} tweet + ${missionsLearned} mission lessons`,
        );
    }

    return { tweetsLearned, missionsLearned };
}

/**
 * Learn from tweet engagement performance.
 * Looks at steps with kind='post_tweet' that succeeded in the last 48h.
 * Compares engagement to the group median to find strong/weak performers.
 */
async function learnFromTweets(sb: SupabaseClient): Promise<number> {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Find tweet steps with engagement results
    const { data: tweetSteps } = await sb
        .from('ops_mission_steps')
        .select('id, mission_id, reserved_by, result')
        .eq('kind', 'post_tweet')
        .eq('status', 'succeeded')
        .gte('completed_at', since)
        .not('result', 'is', null);

    if (!tweetSteps?.length) return 0;

    // Extract engagement scores
    const scored = tweetSteps
        .map(step => {
            const result = step.result as Record<string, unknown>;
            const engagement =
                ((result.likes as number) ?? 0) +
                ((result.retweets as number) ?? 0) * 2 +
                ((result.replies as number) ?? 0) * 3;

            return {
                id: step.id as string,
                agentId: (step.reserved_by as string) ?? 'brain',
                engagement,
                topic: (result.topic as string) ?? 'unknown',
            };
        })
        .filter(s => s.engagement > 0);

    if (scored.length < 2) return 0; // Need at least 2 for comparison

    // Compute median engagement
    const engagements = scored.map(s => s.engagement).sort((a, b) => a - b);
    const median = engagements[Math.floor(engagements.length / 2)];

    let written = 0;

    for (const tweet of scored) {
        // Check daily cap for this agent
        const todayCount = await countTodayMemories(sb, tweet.agentId);
        if (todayCount >= MAX_LESSONS_PER_AGENT_PER_DAY) continue;

        if (tweet.engagement > median * 2) {
            // Strong performer — record as lesson
            const id = await writeMemory(sb, {
                agent_id: tweet.agentId,
                type: 'lesson',
                content: `Strong tweet engagement (${tweet.engagement}) on "${tweet.topic}". This topic/style resonates well.`,
                confidence: 0.7,
                tags: ['tweet', 'engagement', 'strong', tweet.topic],
                source_trace_id: `tweet-lesson:${tweet.id}`,
            });
            if (id) written++;
        } else if (tweet.engagement < median * 0.3 && median > 0) {
            // Weak performer — record as lesson
            const id = await writeMemory(sb, {
                agent_id: tweet.agentId,
                type: 'lesson',
                content: `Weak tweet engagement (${tweet.engagement}) on "${tweet.topic}". Consider adjusting approach for this topic.`,
                confidence: 0.6,
                tags: ['tweet', 'engagement', 'weak', tweet.topic],
                source_trace_id: `tweet-lesson:${tweet.id}`,
            });
            if (id) written++;
        }
    }

    return written;
}

/**
 * Learn from mission outcomes.
 * Successful missions → strategy memories. Failed missions → lesson memories.
 * Only processes missions completed in the last 24h that haven't been learned from yet.
 */
async function learnFromMissions(sb: SupabaseClient): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find recently completed missions
    const { data: missions } = await sb
        .from('ops_missions')
        .select('id, agent_id, title, status, failure_reason')
        .in('status', ['succeeded', 'failed'])
        .gte('completed_at', since)
        .limit(20);

    if (!missions?.length) return 0;

    let written = 0;

    for (const mission of missions) {
        const agentId = (mission.agent_id as string) ?? 'brain';

        // Check daily cap
        const todayCount = await countTodayMemories(sb, agentId);
        if (todayCount >= MAX_LESSONS_PER_AGENT_PER_DAY) continue;

        if (mission.status === 'succeeded') {
            const id = await writeMemory(sb, {
                agent_id: agentId,
                type: 'strategy',
                content: `Mission succeeded: "${mission.title}". This approach works.`,
                confidence: 0.65,
                tags: ['mission', 'succeeded'],
                source_trace_id: `mission-lesson:${mission.id}`,
            });
            if (id) written++;
        } else if (mission.status === 'failed') {
            const reason =
                (mission.failure_reason as string) ??
                'One or more steps failed';
            const id = await writeMemory(sb, {
                agent_id: agentId,
                type: 'lesson',
                content: `Mission failed: "${mission.title}". Reason: ${reason}`,
                confidence: 0.7,
                tags: ['mission', 'failed'],
                source_trace_id: `mission-lesson:${mission.id}`,
            });
            if (id) written++;
        }
    }

    return written;
}
