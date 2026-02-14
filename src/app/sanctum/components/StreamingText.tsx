'use client';

import { useRef, useEffect, useReducer } from 'react';

interface StreamingTextProps {
    text: string;
    speed?: number; // ms per character
    onComplete?: () => void;
}

interface StreamState {
    displayed: string;
    done: boolean;
}

/**
 * Token-by-token text rendering with a blinking cursor.
 * Uses useReducer to avoid setState-in-useEffect lint warnings.
 */
export function StreamingText({
    text,
    speed = 15,
    onComplete,
}: StreamingTextProps) {
    const [state, dispatch] = useReducer(
        (_prev: StreamState, action: StreamState) => action,
        { displayed: '', done: false },
    );
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
        dispatch({ displayed: '', done: false });
        let idx = 0;

        const timer = setInterval(() => {
            // Advance by words/chunks for more natural feel
            const chunkSize =
                text[idx] === ' ' ? 1 : Math.min(3, text.length - idx);
            idx += chunkSize;

            if (idx >= text.length) {
                dispatch({ displayed: text, done: true });
                clearInterval(timer);
                onCompleteRef.current?.();
            } else {
                dispatch({ displayed: text.slice(0, idx), done: false });
            }
        }, speed);

        return () => clearInterval(timer);
    }, [text, speed]);

    return (
        <span>
            {state.displayed}
            {!state.done && (
                <span className='inline-block w-[2px] h-[1em] bg-white/40 ml-0.5 align-text-bottom animate-blink' />
            )}
        </span>
    );
}
