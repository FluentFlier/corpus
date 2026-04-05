import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corpus - Runtime Safety for AI Agents',
  description: 'Define what your AI agent is allowed to do. Enforce at runtime. Prove compliance with a public trust page. Zero user data stored.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://corpus.run'),
  openGraph: {
    title: 'Corpus - Runtime Safety for AI Agents',
    description: 'Define what your AI agent is allowed to do. Enforce at runtime. Prove compliance publicly.',
    siteName: 'Corpus',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Corpus - Runtime Safety for AI Agents',
    description: 'The safety layer between your AI agent and the real world.',
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
