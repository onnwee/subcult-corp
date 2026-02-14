// AskTheRoom — collapsible text input for submitting user questions to the collective
'use client';

import { useState, useCallback } from 'react';
import type { ConversationFormat } from '@/lib/types';

const FORMAT_OPTIONS: { value: ConversationFormat; label: string }[] = [
    { value: 'debate', label: 'Debate' },
    { value: 'brainstorm', label: 'Brainstorm' },
    { value: 'deep_dive', label: 'Deep Dive' },
    { value: 'cross_exam', label: 'Cross-Exam' },
    { value: 'risk_review', label: 'Risk Review' },
    { value: 'strategy', label: 'Strategy' },
    { value: 'reframe', label: 'Reframe' },
    { value: 'standup', label: 'Standup' },
    { value: 'checkin', label: 'Check-in' },
    { value: 'triage', label: 'Triage' },
    { value: 'planning', label: 'Planning' },
    { value: 'shipping', label: 'Shipping' },
    { value: 'retro', label: 'Retro' },
    { value: 'writing_room', label: 'Writing Room' },
    { value: 'content_review', label: 'Content Review' },
    { value: 'watercooler', label: 'Watercooler' },
];

const MAX_CHARS = 500;
const MIN_CHARS = 10;

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export function AskTheRoom() {
    const [isOpen, setIsOpen] = useState(false);
    const [question, setQuestion] = useState('');
    const [format, setFormat] = useState<ConversationFormat>('debate');
    const [submitState, setSubmitState] = useState<SubmitState>('idle');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [retryAfter, setRetryAfter] = useState(0);

    const charsRemaining = MAX_CHARS - question.length;
    const canSubmit =
        question.trim().length >= MIN_CHARS && submitState !== 'loading';

    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return;

        setSubmitState('loading');
        setErrorMessage('');
        setRetryAfter(0);

        try {
            const res = await fetch('/api/ops/roundtable/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: question.trim(), format }),
            });

            const data = await res.json();

            if (res.status === 429) {
                setSubmitState('error');
                setErrorMessage(data.error ?? 'Rate limited.');
                setRetryAfter(data.retryAfter ?? 60);
                return;
            }

            if (!res.ok) {
                setSubmitState('error');
                setErrorMessage(data.error ?? 'Something went wrong.');
                return;
            }

            setSubmitState('success');
            setSessionId(data.sessionId);
            setQuestion('');
        } catch {
            setSubmitState('error');
            setErrorMessage('Network error. Please try again.');
        }
    }, [canSubmit, question, format]);

    const handleReset = useCallback(() => {
        setSubmitState('idle');
        setSessionId(null);
        setErrorMessage('');
        setRetryAfter(0);
    }, []);

    return (
        <div className='rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden'>
            {/* Toggle header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className='w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors'
            >
                <div className='flex items-center gap-2'>
                    <span className='text-sm'>🎤</span>
                    <span className='text-xs font-medium text-zinc-300'>
                        Ask the Collective
                    </span>
                </div>
                <svg
                    className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                >
                    <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M19 9l-7 7-7-7'
                    />
                </svg>
            </button>

            {/* Collapsible body */}
            {isOpen && (
                <div className='px-4 pb-4 space-y-3 border-t border-zinc-800'>
                    {/* Success state */}
                    {submitState === 'success' && sessionId && (
                        <div className='pt-3 space-y-2'>
                            <div className='rounded-lg border border-green-800/50 bg-green-900/20 p-3'>
                                <p className='text-xs text-green-400 font-medium'>
                                    ✓ Question submitted! Session starting...
                                </p>
                                <p className='text-[10px] text-zinc-500 mt-1'>
                                    Session ID: {sessionId}
                                </p>
                            </div>
                            <button
                                onClick={handleReset}
                                className='text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors'
                            >
                                Ask another question
                            </button>
                        </div>
                    )}

                    {/* Input form */}
                    {submitState !== 'success' && (
                        <>
                            {/* Textarea */}
                            <div className='pt-3'>
                                <textarea
                                    value={question}
                                    onChange={e =>
                                        setQuestion(
                                            e.target.value.slice(0, MAX_CHARS),
                                        )
                                    }
                                    placeholder='Ask the collective a question...'
                                    disabled={submitState === 'loading'}
                                    rows={3}
                                    className='w-full rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none disabled:opacity-50'
                                />
                                <div className='flex justify-end mt-1'>
                                    <span
                                        className={`text-[10px] ${charsRemaining < 50 ? 'text-amber-500' : 'text-zinc-600'}`}
                                    >
                                        {charsRemaining} remaining
                                    </span>
                                </div>
                            </div>

                            {/* Format selector + submit */}
                            <div className='flex items-center gap-2'>
                                <select
                                    value={format}
                                    onChange={e =>
                                        setFormat(
                                            e.target
                                                .value as ConversationFormat,
                                        )
                                    }
                                    disabled={submitState === 'loading'}
                                    className='flex-shrink-0 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-600 disabled:opacity-50 appearance-none cursor-pointer'
                                >
                                    {FORMAT_OPTIONS.map(opt => (
                                        <option
                                            key={opt.value}
                                            value={opt.value}
                                        >
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>

                                <div className='flex-1' />

                                <button
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className='rounded-lg border border-green-700/50 bg-green-900/30 px-4 py-1.5 text-[11px] font-medium text-green-400 hover:bg-green-900/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5'
                                >
                                    {submitState === 'loading' ?
                                        <>
                                            <svg
                                                className='animate-spin h-3 w-3'
                                                viewBox='0 0 24 24'
                                            >
                                                <circle
                                                    className='opacity-25'
                                                    cx='12'
                                                    cy='12'
                                                    r='10'
                                                    stroke='currentColor'
                                                    strokeWidth='4'
                                                    fill='none'
                                                />
                                                <path
                                                    className='opacity-75'
                                                    fill='currentColor'
                                                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
                                                />
                                            </svg>
                                            Submitting...
                                        </>
                                    :   'Submit'}
                                </button>
                            </div>

                            {/* Error state */}
                            {submitState === 'error' && (
                                <div className='rounded-lg border border-red-800/50 bg-red-900/20 p-3'>
                                    <p className='text-[11px] text-red-400'>
                                        {errorMessage}
                                    </p>
                                    {retryAfter > 0 && (
                                        <p className='text-[10px] text-zinc-500 mt-1'>
                                            Retry in {retryAfter}s
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
