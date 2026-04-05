import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <main className="min-h-screen bg-corpus-bg flex flex-col items-center justify-center">
      <span className="font-mono text-corpus-text text-8xl font-bold">404</span>
      <p className="text-corpus-muted mt-4 text-sm">Page not found.</p>
      <Link
        href="/"
        className="mt-8 text-corpus-green text-sm hover:underline"
      >
        Go to corpus.run
      </Link>
    </main>
  );
}
