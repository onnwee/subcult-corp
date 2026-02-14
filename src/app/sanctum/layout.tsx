import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'SubCult — Sanctum',
    description: 'Multi-agent chat interface',
};

export default function SanctumLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className='min-h-screen bg-[#0a0a14] text-foreground'>
            {children}
        </div>
    );
}
