'use client';

interface SanctumHeaderProps {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    connected: boolean;
    whisperTarget: string | null;
    onExitWhisper: () => void;
}

export function SanctumHeader({
    sidebarOpen,
    onToggleSidebar,
    connected,
    whisperTarget,
    onExitWhisper,
}: SanctumHeaderProps) {
    return (
        <header className='flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0d0d18]/80 backdrop-blur-sm'>
            <div className='flex items-center gap-3'>
                <button
                    onClick={onToggleSidebar}
                    className='w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors'
                    aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                >
                    <svg
                        className='w-5 h-5 text-white/50'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                        strokeWidth={1.5}
                    >
                        {sidebarOpen ?
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                d='M6 18L18 6M6 6l12 12'
                            />
                        :   <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                d='M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5'
                            />
                        }
                    </svg>
                </button>

                <div className='flex items-center gap-2'>
                    <span className='text-sm font-mono tracking-[0.2em] text-white/70 uppercase'>
                        Sanctum
                    </span>
                    <div
                        className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}
                    />
                </div>
            </div>

            {whisperTarget && (
                <div className='flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] rounded-full border border-white/[0.08]'>
                    <span className='text-xs text-white/40'>
                        🔇 Whispering to
                    </span>
                    <span className='text-xs font-medium text-white/70 capitalize'>
                        {whisperTarget}
                    </span>
                    <button
                        onClick={onExitWhisper}
                        className='ml-1 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/[0.1] text-white/30 hover:text-white/60 transition-colors'
                        aria-label='Exit whisper mode'
                    >
                        ×
                    </button>
                </div>
            )}

            <div className='flex items-center gap-2 text-[10px] text-white/20 font-mono'>
                SUBCULT OPS
            </div>
        </header>
    );
}
