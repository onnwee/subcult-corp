// useTTS — React hook for TTS playback control
// Provides play/stop/playAll for transcript turns
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { RoundtableTurn } from '@/lib/types';

// Lazy imports — TTS modules reference window.speechSynthesis
// so they must only load on the client
let _providerModule: typeof import('@/lib/tts/provider') | null = null;
let _profilesModule: typeof import('@/lib/tts/profiles') | null = null;

async function loadTTSModules() {
    if (!_providerModule) {
        _providerModule = await import('@/lib/tts/provider');
    }
    if (!_profilesModule) {
        _profilesModule = await import('@/lib/tts/profiles');
    }
    return {
        getTTSProvider: _providerModule.getTTSProvider,
        getVoiceProfile: _profilesModule.getVoiceProfile,
    };
}

// ─── Hook ───

export interface TTSState {
    /** Whether any speech is currently playing */
    isPlaying: boolean;
    /** Index of the currently speaking turn (-1 if none) */
    activeTurnIndex: number;
    /** Whether TTS is available in this browser */
    isAvailable: boolean;
    /** Whether user interaction is needed to unlock audio */
    needsUnlock: boolean;
}

export interface TTSControls {
    /** Play a single turn's dialogue */
    playTurn: (turn: RoundtableTurn, index: number) => void;
    /** Play all turns sequentially from a given index */
    playAll: (turns: RoundtableTurn[], fromIndex?: number) => void;
    /** Stop all playback */
    stop: () => void;
    /** Try to unlock audio (call from a click handler) */
    unlock: () => void;
}

export function useTTS(): [TTSState, TTSControls] {
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeTurnIndex, setActiveTurnIndex] = useState(-1);
    const [isAvailable, setIsAvailable] = useState(false);
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const cancelledRef = useRef(false);

    // Check availability on mount
    useEffect(() => {
        const available =
            typeof window !== 'undefined' && 'speechSynthesis' in window;
        setIsAvailable(available);
    }, []);

    const stop = useCallback(async () => {
        cancelledRef.current = true;
        try {
            const { getTTSProvider } = await loadTTSModules();
            getTTSProvider().stop();
        } catch {
            // ignore
        }
        setIsPlaying(false);
        setActiveTurnIndex(-1);
    }, []);

    const playTurn = useCallback(
        async (turn: RoundtableTurn, index: number) => {
            cancelledRef.current = false;
            try {
                const { getTTSProvider, getVoiceProfile } =
                    await loadTTSModules();
                const provider = getTTSProvider();
                const profile = getVoiceProfile(turn.speaker);

                provider.stop();
                setIsPlaying(true);
                setActiveTurnIndex(index);
                setNeedsUnlock(false);

                await provider.speak(turn.dialogue, profile);

                if (!cancelledRef.current) {
                    setIsPlaying(false);
                    setActiveTurnIndex(-1);
                }
            } catch {
                setNeedsUnlock(true);
                setIsPlaying(false);
                setActiveTurnIndex(-1);
            }
        },
        [],
    );

    const playAll = useCallback(
        async (turns: RoundtableTurn[], fromIndex = 0) => {
            cancelledRef.current = false;
            try {
                const { getTTSProvider, getVoiceProfile } =
                    await loadTTSModules();
                const provider = getTTSProvider();

                provider.stop();
                setIsPlaying(true);
                setNeedsUnlock(false);

                for (let i = fromIndex; i < turns.length; i++) {
                    if (cancelledRef.current) break;

                    const turn = turns[i];
                    const profile = getVoiceProfile(turn.speaker);
                    setActiveTurnIndex(i);

                    await provider.speak(turn.dialogue, profile);
                }

                if (!cancelledRef.current) {
                    setIsPlaying(false);
                    setActiveTurnIndex(-1);
                }
            } catch {
                setNeedsUnlock(true);
                setIsPlaying(false);
                setActiveTurnIndex(-1);
            }
        },
        [],
    );

    const unlock = useCallback(async () => {
        try {
            const { getTTSProvider } = await loadTTSModules();
            const provider = getTTSProvider();
            // Speak empty string to unlock
            await provider.speak('', {
                pitch: 1,
                rate: 1,
                volume: 0,
                preferredVoiceNames: [],
            });
            setNeedsUnlock(false);
        } catch {
            // Still locked
        }
    }, []);

    return [
        { isPlaying, activeTurnIndex, isAvailable, needsUnlock },
        { playTurn, playAll, stop, unlock },
    ];
}
