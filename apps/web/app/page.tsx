'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export default function HomePage(): React.ReactElement {
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter a project slug');
      return;
    }
    if (!SLUG_REGEX.test(trimmed)) {
      setError('Lowercase letters, numbers, and hyphens only');
      return;
    }
    setError('');
    router.push(`/${trimmed}`);
  }

  return (
    <main className="min-h-screen bg-corpus-bg bg-grid flex flex-col">
      {/* Nav */}
      <nav aria-label="Main navigation" className="flex items-center justify-between px-8 py-5 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-corpus-green" aria-hidden="true" />
          <span className="font-mono text-sm tracking-tight font-bold text-corpus-text">corpus</span>
        </div>
        <a
          href="https://github.com/fluentflier/corpus"
          target="_blank"
          rel="noopener noreferrer"
          className="text-corpus-muted text-xs hover:text-corpus-text transition-colors"
          aria-label="View Corpus source code on GitHub"
        >
          GitHub
        </a>
      </nav>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <h1 className="font-mono text-6xl md:text-8xl font-bold tracking-tighter mb-6 animate-fade-in">
          corpus
        </h1>

        <p className="text-corpus-muted text-sm max-w-md text-center leading-relaxed mb-12 animate-fade-in-1">
          Runtime behavioral safety for AI agents. Define what your agent is
          allowed to do. Enforce at runtime. Prove compliance publicly.
        </p>

        {/* Slug input */}
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm animate-fade-in-2"
          role="search"
          aria-label="Find a project trust page"
        >
          <div className="flex items-center gap-0">
            <span className="bg-[#141414] border border-corpus-line border-r-0 rounded-l-lg px-3 py-2.5 text-corpus-muted text-sm font-mono" aria-hidden="true">
              corpus.run/
            </span>
            <label htmlFor="slug-input" className="sr-only">Project slug</label>
            <input
              id="slug-input"
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setError(''); }}
              placeholder="your-agent"
              autoComplete="off"
              aria-describedby={error ? 'slug-error' : undefined}
              aria-invalid={error ? true : undefined}
              className="flex-1 bg-[#0C0C0C] border border-corpus-line text-corpus-text text-sm font-mono px-3 py-2.5 outline-none focus:border-corpus-green/50 transition-colors placeholder:text-[#444]"
            />
            <button
              type="submit"
              className="bg-corpus-green text-white text-sm font-mono px-4 py-2.5 rounded-r-lg hover:opacity-90 transition-opacity"
              aria-label="View trust page"
            >
              View
            </button>
          </div>
          {error && (
            <p id="slug-error" className="text-corpus-red text-xs mt-2 ml-1" role="alert">
              {error}
            </p>
          )}
        </form>

        {/* How it works */}
        <section className="mt-20 max-w-lg w-full space-y-4 animate-fade-in-3" aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-xs text-corpus-muted uppercase tracking-wider mb-3">How it works</h2>
          <ol className="space-y-4 list-none p-0">
            <li className="flex items-start gap-3 text-xs">
              <span className="text-corpus-green font-mono mt-0.5" aria-hidden="true">01</span>
              <p className="text-corpus-muted leading-relaxed">
                Policies are YAML files (or Jac for complex rules) that declare what your agent can do.
              </p>
            </li>
            <li className="flex items-start gap-3 text-xs">
              <span className="text-corpus-amber font-mono mt-0.5" aria-hidden="true">02</span>
              <p className="text-corpus-muted leading-relaxed">
                At runtime, every action is evaluated against your policies before it executes.
              </p>
            </li>
            <li className="flex items-start gap-3 text-xs">
              <span className="text-corpus-red font-mono mt-0.5" aria-hidden="true">03</span>
              <p className="text-corpus-muted leading-relaxed">
                Results are logged (no user content) and visible at corpus.run/your-slug.
              </p>
            </li>
          </ol>
        </section>

        {/* Install */}
        <section className="mt-12 max-w-lg w-full animate-fade-in-4" aria-label="Installation">
          <div className="bg-[#0C0C0C] border border-corpus-line rounded-lg overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-corpus-line/50" aria-hidden="true">
              <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
              <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
              <div className="w-2 h-2 rounded-full bg-[#28C840]" />
              <span className="ml-2 text-[10px] text-corpus-muted font-mono">terminal</span>
            </div>
            <pre className="p-4 text-xs font-mono leading-relaxed text-corpus-muted" aria-label="Installation commands">
<span className="text-corpus-green">$</span> npm install corpus-sdk{'\n'}
<span className="text-corpus-green">$</span> npx corpus init{'\n'}
<span className="text-corpus-green">$</span> npx corpus check
            </pre>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-corpus-line/20 py-6 text-center">
        <div className="flex items-center justify-center gap-6 text-[11px] text-corpus-muted">
          <span>Built with Jac</span>
          <span className="opacity-15" aria-hidden="true">|</span>
          <span>Open source, MIT</span>
          <span className="opacity-15" aria-hidden="true">|</span>
          <span>No user data stored</span>
        </div>
      </footer>
    </main>
  );
}
