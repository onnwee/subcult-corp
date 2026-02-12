import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
    src: '../../public/fonts/GeistSans-Latin.woff2',
    variable: '--font-geist-sans',
});

const geistMono = localFont({
    src: '../../public/fonts/GeistMono-Latin.woff2',
    variable: '--font-geist-mono',
});

export const metadata: Metadata = {
    title: 'SUBCULT OPS',
    description: 'Multi-agent command center',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en' suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                {children}
            </body>
        </html>
    );
}
