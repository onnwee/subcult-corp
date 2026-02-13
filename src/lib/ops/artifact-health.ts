// Artifact Health — checks artifact freshness and output production
// Used by the heartbeat to verify agents are producing tangible output.

import { sql } from '@/lib/db';
import { execInToolbox } from '@/lib/tools/executor';
import { emitEvent } from './events';

export interface ArtifactHealthResult {
    manifest_entries_today: number;
    artifacts_by_type: Record<string, number>;
    synthesis_sessions_today: number;
    synthesis_success_rate: number;
    output_dirs: Record<string, number>;
}

/**
 * Check artifact freshness:
 * 1. Count manifest entries written today
 * 2. Count synthesis sessions (source='conversation') today and their success rate
 * 3. Count files in output/ directories
 */
export async function checkArtifactFreshness(): Promise<ArtifactHealthResult> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Count synthesis sessions today
    const [synthCounts] = await sql<[{
        total: number;
        succeeded: number;
    }]>`
        SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int as succeeded
        FROM ops_agent_sessions
        WHERE source = 'conversation'
        AND created_at >= ${todayISO}
    `;

    // Count completed roundtables today (to compare against synthesis sessions)
    const [roundtableCounts] = await sql<[{ total: number }]>`
        SELECT COUNT(*)::int as total
        FROM ops_roundtable_sessions
        WHERE status = 'completed'
        AND completed_at >= ${todayISO}
    `;

    // Read manifest for today's entries
    let manifestEntriesToday = 0;
    const artifactsByType: Record<string, number> = {};

    try {
        const result = await execInToolbox(
            `cat /workspace/shared/manifests/index.jsonl 2>/dev/null | grep '"${todayISO.split('T')[0]}' || echo ''`,
            5_000,
        );
        if (result.stdout.trim()) {
            const lines = result.stdout.trim().split('\n').filter(Boolean);
            manifestEntriesToday = lines.length;
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    const type = entry.type ?? 'unknown';
                    artifactsByType[type] = (artifactsByType[type] ?? 0) + 1;
                } catch { /* skip malformed lines */ }
            }
        }
    } catch {
        // Manifest read failed — non-fatal
    }

    // Count files in output directories
    const outputDirs: Record<string, number> = {};
    for (const dir of ['briefings', 'reports', 'reviews', 'digests']) {
        try {
            const result = await execInToolbox(
                `ls /workspace/output/${dir}/ 2>/dev/null | wc -l`,
                3_000,
            );
            outputDirs[dir] = parseInt(result.stdout.trim(), 10) || 0;
        } catch {
            outputDirs[dir] = 0;
        }
    }

    const successRate = synthCounts.total > 0
        ? synthCounts.succeeded / synthCounts.total
        : 0;

    // Emit event if roundtables completed but no artifacts were produced
    if (roundtableCounts.total > 0 && manifestEntriesToday === 0) {
        await emitEvent({
            agent_id: 'system',
            kind: 'missing_artifacts',
            title: `${roundtableCounts.total} roundtables completed today but no artifacts produced`,
            tags: ['artifacts', 'health', 'warning'],
            metadata: {
                roundtables_completed: roundtableCounts.total,
                synthesis_sessions: synthCounts.total,
                manifest_entries: manifestEntriesToday,
            },
        });
    }

    return {
        manifest_entries_today: manifestEntriesToday,
        artifacts_by_type: artifactsByType,
        synthesis_sessions_today: synthCounts.total,
        synthesis_success_rate: Math.round(successRate * 100),
        output_dirs: outputDirs,
    };
}
