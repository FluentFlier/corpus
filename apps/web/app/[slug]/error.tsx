'use client';

export default function TrustPageError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen bg-corpus-bg flex flex-col items-center justify-center px-6">
      <div className="w-2 h-2 rounded-full bg-corpus-red mb-6" />
      <h1 className="font-mono text-2xl text-corpus-text mb-2">Something went wrong</h1>
      <p className="text-corpus-muted text-sm mb-8">Could not load the trust page.</p>
      <button
        onClick={reset}
        className="font-mono text-sm text-corpus-green border border-corpus-green/30 px-4 py-2 rounded hover:bg-corpus-green/10 transition-colors"
      >
        Try again
      </button>
    </main>
  );
}
