import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corpus - The Immune System for Vibe-Coded Software',
  description: 'Corpus watches your AI-generated code, catches breakage before it lands, and self-heals your project. No more AI slop.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://corpus.run'),
  openGraph: {
    title: 'Corpus - The Immune System for Vibe-Coded Software',
    description: 'Corpus watches your AI-generated code, catches breakage before it lands, and self-heals your project. No more AI slop.',
    siteName: 'Corpus',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Corpus - The Immune System for Vibe-Coded Software',
    description: 'Corpus watches your AI-generated code, catches breakage before it lands, and self-heals your project.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
