export default function HomePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-corpus-bg bg-grid relative overflow-hidden">
      {/* ---- Ambient glow orbs ---- */}
      <div className="hero-glow top-[-200px] left-1/2 -translate-x-1/2" />
      <div
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none animate-glow-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
          top: '60%',
          right: '-100px',
        }}
      />

      {/* ======== NAV ======== */}
      <nav
        aria-label="Main navigation"
        className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 max-w-6xl mx-auto w-full animate-fade-in"
      >
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="relative w-3 h-3">
            <div className="absolute inset-0 rounded-full bg-emerald-500 animate-glow-pulse" />
            <div className="absolute inset-[2px] rounded-full bg-emerald-400" />
          </div>
          <span className="font-mono text-base tracking-tight font-bold text-corpus-text">
            corpus
          </span>
        </a>
        <div className="flex items-center gap-6">
          <a
            href="/graph"
            className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200"
          >
            Graph
          </a>
          <a
            href="/demo"
            className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200"
          >
            Demo
          </a>
          <a
            href="/dashboard"
            className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200"
          >
            Dashboard
          </a>
          <a
            href="https://github.com/FluentFlier/corpus"
            target="_blank"
            rel="noopener noreferrer"
            className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200"
          >
            GitHub
          </a>
        </div>
      </nav>

      {/* ======== HERO ======== */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 md:pt-32 pb-16">
        {/* Badge */}
        <div className="animate-fade-in-1 mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-mono tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow-pulse" />
            Built at JacHacks 2026
          </span>
        </div>

        {/* Headline */}
        <h1 className="animate-slide-up font-mono text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] max-w-4xl">
          Your codebase has
          <br />
          <span className="text-gradient-shimmer">an immune system</span>
        </h1>

        {/* Subtitle */}
        <p className="animate-slide-up-1 text-corpus-muted text-base md:text-lg max-w-2xl leading-relaxed mt-8">
          Corpus watches your AI-generated code, catches breakage before it
          lands, and self-heals your project.
        </p>

        {/* CTA */}
        <div className="animate-slide-up-2 mt-10 flex flex-col sm:flex-row items-center gap-4">
          <div className="group relative">
            <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-500 opacity-60 group-hover:opacity-100 blur-[2px] transition-opacity duration-300" />
            <a
              href="https://github.com/FluentFlier/corpus"
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex items-center gap-2 bg-[#0D0D0D] text-corpus-text font-mono text-sm px-6 py-3 rounded-xl hover:bg-[#111] transition-colors duration-200"
            >
              <span className="text-emerald-400">$</span>
              npm install -g corpus-cli
            </a>
          </div>
          <a
            href="/graph"
            className="text-corpus-muted text-sm font-mono hover:text-corpus-text transition-colors duration-200 flex items-center gap-1.5"
          >
            View live graph
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </section>

      {/* ======== TERMINAL MOCKUP ======== */}
      <section className="relative z-10 flex justify-center px-6 pb-24 animate-fade-in-4">
        <div className="terminal-window w-full max-w-2xl animate-float">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-corpus-line/50">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
            <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
            <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            <span className="ml-3 text-[11px] text-corpus-muted font-mono">
              ~/my-project
            </span>
          </div>
          {/* Terminal content */}
          <div className="p-5 font-mono text-sm leading-7">
            <div className="flex gap-2">
              <span className="text-emerald-400">$</span>
              <span className="text-corpus-text">corpus init</span>
            </div>
            <div className="text-corpus-muted mt-1">
              <span className="text-emerald-400">{'\u2713'}</span> Scanning project structure...
            </div>
            <div className="text-corpus-muted">
              <span className="text-emerald-400">{'\u2713'}</span> Found <span className="text-corpus-text">87 files</span> across <span className="text-corpus-text">12 modules</span>
            </div>
            <div className="text-corpus-muted">
              <span className="text-emerald-400">{'\u2713'}</span> Mapped <span className="text-corpus-text">172 functions</span> and <span className="text-corpus-text">43 dependencies</span>
            </div>
            <div className="text-corpus-muted">
              <span className="text-emerald-400">{'\u2713'}</span> Building structural graph...
            </div>
            <div className="text-corpus-muted">
              <span className="text-emerald-400">{'\u2713'}</span> MCP watchers attached to <span className="text-indigo-400">Claude Code</span>, <span className="text-indigo-400">Cursor</span>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="text-emerald-400">$</span>
              <span className="text-corpus-text">corpus status</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-bold">Health: 100/100</span>
              <span className="text-corpus-muted">- All systems nominal</span>
            </div>
            <div className="mt-3 flex gap-2 items-center">
              <span className="text-emerald-400">$</span>
              <span className="w-2 h-4 border-r-2 border-emerald-400" style={{ animation: 'blink-caret 1s step-end infinite' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ======== FEATURES ======== */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24" aria-labelledby="features-heading">
        <h2 id="features-heading" className="sr-only">Features</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* UNDERSTAND */}
          <div className="card-glow p-8 transition-transform duration-300 hover:-translate-y-1 animate-fade-in-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <h3 className="font-mono text-lg font-bold text-corpus-text mb-3">
              UNDERSTAND
            </h3>
            <p className="text-corpus-muted text-sm leading-relaxed">
              Auto-scans your codebase and builds a structural graph. Every file,
              function, and dependency mapped in seconds.
            </p>
            <div className="mt-5 pt-4 border-t border-corpus-line/30">
              <span className="text-xs font-mono text-emerald-400/70">
                corpus init --deep
              </span>
            </div>
          </div>

          {/* WATCH */}
          <div className="card-glow p-8 transition-transform duration-300 hover:-translate-y-1 animate-fade-in-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h3 className="font-mono text-lg font-bold text-corpus-text mb-3">
              WATCH
            </h3>
            <p className="text-corpus-muted text-sm leading-relaxed">
              Hooks into Claude Code and Cursor via MCP. Intercepts broken
              changes and auto-fixes them before they land.
            </p>
            <div className="mt-5 pt-4 border-t border-corpus-line/30">
              <span className="text-xs font-mono text-indigo-400/70">
                MCP auto-fix enabled
              </span>
            </div>
          </div>

          {/* SHOW */}
          <div className="card-glow p-8 transition-transform duration-300 hover:-translate-y-1 animate-fade-in-7">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <defs>
                  <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="url(#grad)" />
                <path d="M3 9h18M9 3v18" stroke="url(#grad)" />
              </svg>
            </div>
            <h3 className="font-mono text-lg font-bold text-corpus-text mb-3">
              SHOW
            </h3>
            <p className="text-corpus-muted text-sm leading-relaxed">
              A visual graph of your entire project. Green means healthy, red
              means broken. Know your codebase at a glance.
            </p>
            <div className="mt-5 pt-4 border-t border-corpus-line/30">
              <span className="text-xs font-mono text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">
                /graph &rarr; live view
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ======== STATS ======== */}
      <section className="relative z-10 py-20 border-t border-b border-corpus-line/20" aria-label="Project statistics">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-emerald-400 stat-glow">
                87
              </div>
              <div className="text-corpus-muted text-sm mt-2 font-mono">
                files scanned
              </div>
            </div>
            <div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-gradient">
                172
              </div>
              <div className="text-corpus-muted text-sm mt-2 font-mono">
                functions mapped
              </div>
            </div>
            <div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-emerald-400 stat-glow">
                100
              </div>
              <div className="text-corpus-muted text-sm mt-2 font-mono">
                health score
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======== HOW IT WORKS ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-24" aria-labelledby="how-heading">
        <h2
          id="how-heading"
          className="font-mono text-2xl md:text-3xl font-bold text-center mb-16 tracking-tight"
        >
          No more <span className="text-gradient">AI slop</span>
        </h2>
        <div className="space-y-10">
          {/* Step 1 */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center font-mono text-sm text-emerald-400 font-bold">
              1
            </div>
            <div>
              <h3 className="font-mono text-base font-bold text-corpus-text mb-1">
                Your AI writes code
              </h3>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Claude Code, Cursor, or any MCP-compatible tool generates changes
                to your codebase.
              </p>
            </div>
          </div>
          {/* Step 2 */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full border border-indigo-500/30 bg-indigo-500/5 flex items-center justify-center font-mono text-sm text-indigo-400 font-bold">
              2
            </div>
            <div>
              <h3 className="font-mono text-base font-bold text-corpus-text mb-1">
                Corpus intercepts and evaluates
              </h3>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Deterministic policy evaluation powered by Jac catches
                regressions, broken imports, type errors, and structural damage.
              </p>
            </div>
          </div>
          {/* Step 3 */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center font-mono text-sm text-emerald-400 font-bold">
              3
            </div>
            <div>
              <h3 className="font-mono text-base font-bold text-corpus-text mb-1">
                Auto-fix or alert
              </h3>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Broken code is healed automatically. If it cannot be fixed, you
                see it instantly in the visual graph -- red nodes, clear
                diagnostics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== BOTTOM CTA ======== */}
      <section className="relative z-10 text-center px-6 pb-24">
        <p className="text-corpus-muted text-sm font-mono mb-6">
          Corpus watches so you don&apos;t have to.
        </p>
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-corpus-line bg-[#0a0a0a]">
          <span className="text-emerald-400 font-mono text-sm">$</span>
          <code className="text-corpus-text font-mono text-sm">
            npm install -g corpus-cli
          </code>
        </div>
      </section>

      {/* ======== FOOTER ======== */}
      <footer className="relative z-10 border-t border-corpus-line/20 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-xs text-corpus-muted">corpus</span>
          </div>
          <div className="flex items-center gap-6 text-[11px] text-corpus-muted font-mono">
            <span>
              Built with{' '}
              <a
                href="https://jaseci.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-corpus-text hover:text-emerald-400 transition-colors"
              >
                Jac
              </a>
            </span>
            <span className="opacity-20" aria-hidden="true">|</span>
            <a
              href="https://github.com/FluentFlier/corpus"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-corpus-text transition-colors"
            >
              Open source
            </a>
            <span className="opacity-20" aria-hidden="true">|</span>
            <span>Made at JacHacks 2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
