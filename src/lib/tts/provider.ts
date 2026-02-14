// TTS Provider — abstraction layer for text-to-speech
// Default: BrowserTTSProvider using window.speechSynthesis
// Designed for swappability — future providers (ElevenLabs, OpenAI TTS) implement same interface

// ─── Types ───

export interface VoiceConfig {
    pitch: number; // 0–2, default 1
    rate: number; // 0.1–10, default 1
    volume: number; // 0–1, default 1
    preferredVoiceNames: string[];
}

// ─── Interface ───

export interface TTSProvider {
    /** Speak text with the given voice config. Resolves when speech completes. */
    speak(text: string, voice?: VoiceConfig): Promise<void>;
    /** Stop all speech immediately and clear the queue. */
    stop(): void;
    /** Whether speech is currently playing. */
    isSpeaking(): boolean;
    /** Get available voice names in the current browser/OS. */
    getAvailableVoices(): string[];
}

// ─── BrowserTTSProvider ───

export class BrowserTTSProvider implements TTSProvider {
    private synth: SpeechSynthesis | null = null;
    private voices: SpeechSynthesisVoice[] = [];
    private queue: Array<{
        text: string;
        voice?: VoiceConfig;
        resolve: () => void;
        reject: (e: Error) => void;
    }> = [];
    private processing = false;
    private voicesLoaded = false;

    constructor() {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            this.synth = window.speechSynthesis;
            this.loadVoices();
            // Voices may load async in some browsers
            this.synth.addEventListener('voiceschanged', () =>
                this.loadVoices(),
            );
        }
    }

    private loadVoices(): void {
        if (!this.synth) return;
        this.voices = this.synth.getVoices();
        this.voicesLoaded = this.voices.length > 0;
    }

    /** Find best matching voice from preferred names list */
    private findVoice(preferredNames: string[]): SpeechSynthesisVoice | null {
        if (this.voices.length === 0) return null;

        // Try exact match on name
        for (const name of preferredNames) {
            const match = this.voices.find(v =>
                v.name.toLowerCase().includes(name.toLowerCase()),
            );
            if (match) return match;
        }

        // Fall back to first English voice
        const english = this.voices.find(v => v.lang.startsWith('en'));
        return english ?? this.voices[0] ?? null;
    }

    async speak(text: string, voice?: VoiceConfig): Promise<void> {
        if (!this.synth) {
            // No speech synthesis available — resolve silently
            return;
        }

        return new Promise<void>((resolve, reject) => {
            this.queue.push({ text, voice, resolve, reject });
            this.processQueue();
        });
    }

    private processQueue(): void {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const item = this.queue.shift()!;

        // Wait for voices to load if not yet available
        if (!this.voicesLoaded && this.synth) {
            this.loadVoices();
        }

        const utterance = new SpeechSynthesisUtterance(item.text);

        // Apply voice config
        if (item.voice) {
            utterance.pitch = item.voice.pitch;
            utterance.rate = item.voice.rate;
            utterance.volume = item.voice.volume;

            const selectedVoice = this.findVoice(
                item.voice.preferredVoiceNames,
            );
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
        }

        utterance.onend = () => {
            this.processing = false;
            item.resolve();
            this.processQueue();
        };

        utterance.onerror = event => {
            this.processing = false;
            // 'interrupted' and 'canceled' are expected when stop() is called
            if (event.error === 'interrupted' || event.error === 'canceled') {
                item.resolve();
            } else {
                item.reject(new Error(`TTS error: ${event.error}`));
            }
            this.processQueue();
        };

        this.synth!.speak(utterance);
    }

    stop(): void {
        if (!this.synth) return;
        this.synth.cancel();
        // Reject all queued items
        for (const item of this.queue) {
            item.resolve(); // Resolve (not reject) — stop is an expected action
        }
        this.queue = [];
        this.processing = false;
    }

    isSpeaking(): boolean {
        return this.synth?.speaking ?? false;
    }

    getAvailableVoices(): string[] {
        return this.voices.map(v => v.name);
    }
}

// ─── Singleton ───

let _provider: TTSProvider | null = null;

/** Get the global TTS provider instance (browser-safe, SSR-safe). */
export function getTTSProvider(): TTSProvider {
    if (!_provider) {
        _provider = new BrowserTTSProvider();
    }
    return _provider;
}
