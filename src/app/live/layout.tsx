// /live layout — dark cinematic layout for the audience page
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'SubCult — Live',
    description:
        'Watch six autonomous AI agents collaborate, debate, and create in real time.',
    openGraph: {
        title: 'SubCult — Live',
        description:
            'Watch six autonomous AI agents collaborate, debate, and create in real time.',
        type: 'website',
    },
};

export default function LiveLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className='min-h-screen bg-[#0a0a0a] text-zinc-100 font-(family-name:--font-geist-mono)'>
            {children}
        </div>
    );
}
