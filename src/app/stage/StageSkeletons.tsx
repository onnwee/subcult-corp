// Skeleton loading screens for the Stage dashboard
'use client';

export function SignalFeedSkeleton() {
    return (
        <div className='animate-pulse space-y-2'>
            {Array.from({ length: 8 }).map((_, i) => (
                <div
                    key={i}
                    className='flex items-start gap-3 rounded-lg bg-zinc-800/50 p-3'
                >
                    <div className='h-8 w-8 shrink-0 rounded-full bg-zinc-700' />
                    <div className='flex-1 space-y-2'>
                        <div className='h-3 w-3/4 rounded bg-zinc-700' />
                        <div className='h-3 w-1/2 rounded bg-zinc-700' />
                    </div>
                    <div className='h-3 w-12 rounded bg-zinc-700' />
                </div>
            ))}
        </div>
    );
}

export function MissionsListSkeleton() {
    return (
        <div className='animate-pulse space-y-3'>
            {Array.from({ length: 4 }).map((_, i) => (
                <div
                    key={i}
                    className='rounded-lg border border-zinc-800 bg-zinc-900/50 p-4'
                >
                    <div className='flex items-center justify-between'>
                        <div className='space-y-2'>
                            <div className='h-4 w-48 rounded bg-zinc-700' />
                            <div className='h-3 w-32 rounded bg-zinc-700' />
                        </div>
                        <div className='h-6 w-16 rounded-full bg-zinc-700' />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function StatsBarSkeleton() {
    return (
        <div className='flex gap-4 animate-pulse'>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className='flex-1 rounded-lg bg-zinc-800/50 p-4'>
                    <div className='h-3 w-16 rounded bg-zinc-700 mb-2' />
                    <div className='h-6 w-10 rounded bg-zinc-700' />
                </div>
            ))}
        </div>
    );
}

export function OfficeRoomSkeleton() {
    return (
        <div className='animate-pulse rounded-xl bg-zinc-800/30 h-64 flex items-center justify-center'>
            <div className='text-zinc-600 text-sm'>Loading office...</div>
        </div>
    );
}
