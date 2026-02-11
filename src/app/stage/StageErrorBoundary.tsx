// Error boundary + fallback UI for Stage components
'use client';

import { ErrorBoundary } from 'react-error-boundary';
import type { ReactNode } from 'react';

function ErrorFallback({
    error,
    resetErrorBoundary,
}: {
    error: unknown;
    resetErrorBoundary: () => void;
}) {
    const message = error instanceof Error ? error.message : String(error);
    return (
        <div className='rounded-lg border border-accent-red/50 bg-accent-red/20 p-4'>
            <div className='flex items-center gap-2 text-accent-red mb-2'>
                <svg
                    className='h-4 w-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                >
                    <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                    />
                </svg>
                <span className='text-sm font-medium'>
                    Something went wrong
                </span>
            </div>
            <p className='text-xs text-accent-red/70 mb-3 font-mono'>{message}</p>
            <button
                onClick={resetErrorBoundary}
                className='rounded bg-accent-red/50 px-3 py-1 text-xs text-accent-red transition-colors hover:bg-accent-red/70'
            >
                Retry
            </button>
        </div>
    );
}

export function StageErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            {children}
        </ErrorBoundary>
    );
}

/**
 * Wrap any section of the Stage in its own error boundary
 * so a crash in one panel won't take down the whole page.
 */
export function SectionErrorBoundary({
    children,
    label,
}: {
    children: ReactNode;
    label: string;
}) {
    return (
        <ErrorBoundary
            FallbackComponent={({
                error,
                resetErrorBoundary,
            }: {
                error: unknown;
                resetErrorBoundary: () => void;
            }) => (
                <div className='rounded-lg border border-zinc-800 bg-zinc-900/50 p-4'>
                    <p className='text-sm text-zinc-400 mb-1'>
                        <span className='text-accent-red'>Error</span> in {label}
                    </p>
                    <p className='text-xs text-zinc-500 font-mono mb-2'>
                        {error instanceof Error ? error.message : String(error)}
                    </p>
                    <button
                        onClick={resetErrorBoundary}
                        className='text-xs text-accent hover:text-accent/80'
                    >
                        Retry
                    </button>
                </div>
            )}
        >
            {children}
        </ErrorBoundary>
    );
}
