// TTS Voice Profiles — per-agent voice configuration
// Maps each AgentId to distinct voice parameters
import type { AgentId } from '@/lib/types';
import type { VoiceConfig } from './provider';

// ─── Voice Profiles ───

const VOICE_PROFILES: Record<AgentId, VoiceConfig> = {
    primus: {
        // Sovereign: deep, slow, authoritative
        pitch: 0.8,
        rate: 0.9,
        volume: 1.0,
        preferredVoiceNames: [
            'Google UK English Male',
            'Daniel',
            'Alex',
            'Microsoft David',
        ],
    },
    chora: {
        // Analyst: clear, measured, precise
        pitch: 1.0,
        rate: 1.0,
        volume: 0.95,
        preferredVoiceNames: [
            'Google UK English Female',
            'Karen',
            'Samantha',
            'Microsoft Zira',
        ],
    },
    subrosa: {
        // Protector: low, deliberate
        pitch: 0.7,
        rate: 0.85,
        volume: 0.9,
        preferredVoiceNames: [
            'Google US English',
            'Moira',
            'Tessa',
            'Microsoft Mark',
        ],
    },
    thaum: {
        // Innovator: high energy, fast
        pitch: 1.3,
        rate: 1.15,
        volume: 1.0,
        preferredVoiceNames: [
            'Google UK English Female',
            'Fiona',
            'Victoria',
            'Microsoft Hazel',
        ],
    },
    praxis: {
        // Executor: direct, clipped
        pitch: 1.0,
        rate: 1.1,
        volume: 1.0,
        preferredVoiceNames: [
            'Google US English',
            'Aaron',
            'Fred',
            'Microsoft David',
        ],
    },
    mux: {
        // Operations: neutral, steady
        pitch: 1.0,
        rate: 0.95,
        volume: 0.9,
        preferredVoiceNames: [
            'Google UK English Male',
            'Tom',
            'Ralph',
            'Microsoft George',
        ],
    },
};

// ─── Exports ───

/** Get voice profile for a given agent. Returns default if agent not found. */
export function getVoiceProfile(agentId: string): VoiceConfig {
    return (
        VOICE_PROFILES[agentId as AgentId] ?? {
            pitch: 1.0,
            rate: 1.0,
            volume: 1.0,
            preferredVoiceNames: [],
        }
    );
}

/** All available voice profiles. */
export { VOICE_PROFILES };
