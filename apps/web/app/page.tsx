'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ---- Scroll reveal hook ---- */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    el.querySelectorAll('.reveal-on-scroll').forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
}

/* ---- Floating dots component ---- */
function FloatingDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let scrollY = 0;

    const dots: { x: number; y: number; baseY: number; size: number; opacity: number; speed: number }[] = [];
    const DOT_COUNT = 60;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    function initDots() {
      dots.length = 0;
      for (let i = 0; i < DOT_COUNT; i++) {
        dots.push({
          x: Math.random() * (canvas?.offsetWidth ?? 1200),
          y: Math.random() * (canvas?.offsetHeight ?? 3000),
          baseY: Math.random() * (canvas?.offsetHeight ?? 3000),
          size: Math.random() * 2 + 1,
          opacity: Math.random() * 0.3 + 0.05,
          speed: Math.random() * 0.5 + 0.2,
        });
      }
    }

    function onScroll() {
      scrollY = window.scrollY;
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const dot of dots) {
        const y = dot.baseY + Math.sin(Date.now() * 0.001 * dot.speed + dot.x * 0.01) * 20 - scrollY * dot.speed * 0.1;
        ctx.beginPath();
        ctx.arc(dot.x, y, dot.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16, 185, 129, ${dot.opacity})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    }

    resize();
    initDots();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="floating-dots"
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    />
  );
}

/* ---- Terminal typing animation ---- */
function TerminalTyping() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lines: { prompt: boolean; text: string; color?: string }[] = [
      { prompt: true, text: 'corpus init' },
      { prompt: false, text: 'Scanning project structure...', color: 'emerald' },
      { prompt: false, text: 'Found 87 files across 12 modules', color: 'files' },
      { prompt: false, text: 'Mapped 172 functions and 43 dependencies', color: 'functions' },
      { prompt: false, text: 'Building structural graph...', color: 'emerald' },
      { prompt: false, text: 'MCP watchers attached to Claude Code, Cursor', color: 'mcp' },
      { prompt: true, text: 'corpus status' },
      { prompt: false, text: 'Health: 100/100 - All systems nominal', color: 'health' },
    ];

    let lineIdx = 0;
    let charIdx = 0;
    let timeout: ReturnType<typeof setTimeout>;

    function renderLine(idx: number, line: typeof lines[number]) {
      const div = document.createElement('div');
      div.className = 'flex gap-2';
      if (idx > 0 && line.prompt) div.style.marginTop = '12px';
      else if (idx > 0) div.style.marginTop = '2px';
      div.setAttribute('data-line', String(idx));

      if (line.prompt) {
        div.innerHTML = '<span style="color:#10b981">$</span><span style="color:#EDEDEA"></span>';
      } else if (line.color === 'health') {
        div.innerHTML = '<span style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981"></span><span style="color:#10b981;font-weight:bold"></span><span style="color:#888"></span></span>';
      } else {
        div.innerHTML = '<span style="color:#10b981">\u2713</span><span style="color:#888"></span>';
      }
      container?.appendChild(div);
      return div;
    }

    function fillNonPrompt(lineEl: Element, line: typeof lines[number]) {
      if (line.color === 'health') {
        const bold = lineEl.querySelector('span > span:nth-child(2)');
        const mute = lineEl.querySelector('span > span:nth-child(3)');
        if (bold) bold.textContent = 'Health: 100/100';
        if (mute) mute.textContent = ' - All systems nominal';
      } else if (line.color === 'files') {
        const t = lineEl.querySelector('span:nth-child(2)');
        if (t) t.innerHTML = ' Found <span style="color:#EDEDEA">87 files</span> across <span style="color:#EDEDEA">12 modules</span>';
      } else if (line.color === 'functions') {
        const t = lineEl.querySelector('span:nth-child(2)');
        if (t) t.innerHTML = ' Mapped <span style="color:#EDEDEA">172 functions</span> and <span style="color:#EDEDEA">43 dependencies</span>';
      } else if (line.color === 'mcp') {
        const t = lineEl.querySelector('span:nth-child(2)');
        if (t) t.innerHTML = ' MCP watchers attached to <span style="color:#818cf8">Claude Code</span>, <span style="color:#818cf8">Cursor</span>';
      } else {
        const t = lineEl.querySelector('span:nth-child(2)');
        if (t) t.textContent = ` ${line.text}`;
      }
    }

    function addChar() {
      if (!container) return;
      if (lineIdx >= lines.length) {
        const cursorDiv = document.createElement('div');
        cursorDiv.className = 'flex gap-2 items-center';
        cursorDiv.style.marginTop = '12px';
        cursorDiv.innerHTML = '<span style="color:#10b981">$</span><span style="width:2px;height:16px;border-right:2px solid #10b981;animation:blink-caret 1s step-end infinite"></span>';
        container.appendChild(cursorDiv);
        return;
      }

      const line = lines[lineIdx]!;

      if (charIdx === 0) {
        renderLine(lineIdx, line);
      }

      const lineEl = container.querySelector(`[data-line="${lineIdx}"]`);
      if (!lineEl) return;

      if (line.prompt) {
        const textSpan = lineEl.querySelector('span:nth-child(2)');
        const typed = line.text.slice(0, charIdx + 1);
        if (textSpan) textSpan.textContent = typed;
        charIdx++;
        if (charIdx >= line.text.length) {
          charIdx = 0;
          lineIdx++;
          timeout = setTimeout(addChar, 400);
        } else {
          timeout = setTimeout(addChar, 55 + Math.random() * 35);
        }
      } else {
        fillNonPrompt(lineEl, line);
        charIdx = 0;
        lineIdx++;
        timeout = setTimeout(addChar, 250 + Math.random() * 150);
      }
    }

    timeout = setTimeout(addChar, 800);
    return () => clearTimeout(timeout);
  }, []);

  return <div ref={containerRef} className="p-5 font-mono text-sm leading-7" />;
}

/* ---- Live Graph Preview SVG ---- */
function LiveGraphPreview() {
  return (
    <svg viewBox="0 0 400 250" className="w-full h-auto" style={{ maxWidth: 400 }}>
      <defs>
        <linearGradient id="graphGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {[
        { x1: 200, y1: 80, x2: 120, y2: 140 },
        { x1: 200, y1: 80, x2: 280, y2: 140 },
        { x1: 200, y1: 80, x2: 200, y2: 160 },
        { x1: 120, y1: 140, x2: 80, y2: 200 },
        { x1: 120, y1: 140, x2: 160, y2: 210 },
        { x1: 280, y1: 140, x2: 240, y2: 210 },
        { x1: 280, y1: 140, x2: 320, y2: 200 },
        { x1: 200, y1: 160, x2: 200, y2: 220 },
      ].map((line, i) => (
        <line
          key={`l-${i}`}
          x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
          stroke="rgba(16,185,129,0.2)" strokeWidth="1.5"
          strokeDasharray="100"
          style={{ animation: `graph-line-draw 2s ease-out ${i * 0.2}s both` }}
        />
      ))}

      {[
        { cx: 200, cy: 80, r: 8, color: '#10b981', delay: 0 },
        { cx: 120, cy: 140, r: 6, color: '#10b981', delay: 0.3 },
        { cx: 280, cy: 140, r: 6, color: '#6366f1', delay: 0.5 },
        { cx: 200, cy: 160, r: 5, color: '#10b981', delay: 0.4 },
        { cx: 80, cy: 200, r: 4, color: '#10b981', delay: 0.7 },
        { cx: 160, cy: 210, r: 4, color: '#10b981', delay: 0.8 },
        { cx: 240, cy: 210, r: 4, color: '#6366f1', delay: 0.9 },
        { cx: 320, cy: 200, r: 5, color: '#10b981', delay: 1.0 },
        { cx: 200, cy: 220, r: 4, color: '#10b981', delay: 1.1 },
      ].map((node, i) => (
        <g key={`n-${i}`}>
          <circle cx={node.cx} cy={node.cy} r={node.r + 6} fill={node.color} opacity="0.1"
            style={{ animation: `glow-pulse 3s ease-in-out ${node.delay}s infinite` }} />
          <circle cx={node.cx} cy={node.cy} r={node.r} fill={node.color} opacity="0"
            style={{ animation: `fade-in 0.6s ease-out ${node.delay + 0.5}s both` }} />
        </g>
      ))}

      <g style={{ animation: 'graph-orbit 8s linear infinite', transformOrigin: '200px 150px' }}>
        <circle cx="340" cy="150" r="2" fill="#10b981" opacity="0.6" />
      </g>

      <text x="200" y="55" textAnchor="middle" fill="#888" fontSize="10" fontFamily="monospace" opacity="0" style={{ animation: 'fade-in 0.8s ease-out 1.5s both' }}>app.ts</text>
      <text x="120" y="130" textAnchor="middle" fill="#888" fontSize="9" fontFamily="monospace" opacity="0" style={{ animation: 'fade-in 0.8s ease-out 1.8s both' }}>auth.ts</text>
      <text x="280" y="130" textAnchor="middle" fill="#888" fontSize="9" fontFamily="monospace" opacity="0" style={{ animation: 'fade-in 0.8s ease-out 2s both' }}>api.ts</text>
    </svg>
  );
}

/* ---- Mouse-follow card glow handler ---- */
function useCardGlow() {
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const cards = e.currentTarget.querySelectorAll('.card-glow-interactive');
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      (card as HTMLElement).style.setProperty('--mouse-x', `${x}px`);
      (card as HTMLElement).style.setProperty('--mouse-y', `${y}px`);
    });
  }, []);
  return handleMouseMove;
}

/* ======== MAIN PAGE ======== */

export default function HomePage(): React.ReactElement {
  const scrollRef = useScrollReveal();
  const handleCardGlow = useCardGlow();

  return (
    <main ref={scrollRef} className="min-h-screen bg-corpus-bg bg-grid relative overflow-hidden">
      {/* ---- Gradient mesh background ---- */}
      <div className="gradient-mesh">
        <div className="gradient-mesh-orb gradient-mesh-orb-1" />
        <div className="gradient-mesh-orb gradient-mesh-orb-2" />
        <div className="gradient-mesh-orb gradient-mesh-orb-3" />
      </div>

      {/* ---- Floating particles ---- */}
      <FloatingDots />

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
          <a href="/graph" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Graph</a>
          <a href="/demo" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Demo</a>
          <a href="/dashboard" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Dashboard</a>
          <a href="/live" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow-pulse" />
            Live
          </a>
          <a href="https://github.com/FluentFlier/corpus" target="_blank" rel="noopener noreferrer" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">GitHub</a>
        </div>
      </nav>

      {/* ======== HERO ======== */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 md:pt-32 pb-16">
        <div className="animate-fade-in-1 mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-mono tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow-pulse" />
            Built at JacHacks 2026
          </span>
        </div>

        <h1 className="animate-slide-up font-mono text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] max-w-4xl">
          Your codebase has
          <br />
          <span className="text-gradient-shimmer">an immune system</span>
        </h1>

        <p className="animate-slide-up-1 text-corpus-muted text-base md:text-lg max-w-2xl leading-relaxed mt-8">
          Corpus watches your AI-generated code, catches breakage before it
          lands, and self-heals your project.
        </p>

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
          <div className="flex items-center gap-2 px-4 py-3 border-b border-corpus-line/50">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
            <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
            <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            <span className="ml-3 text-[11px] text-corpus-muted font-mono">~/my-project</span>
          </div>
          <TerminalTyping />
        </div>
      </section>

      {/* ======== FEATURES (mouse-follow glow) ======== */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24 reveal-on-scroll" aria-labelledby="features-heading" onMouseMove={handleCardGlow}>
        <h2 id="features-heading" className="sr-only">Features</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="card-glow-interactive p-8 transition-transform duration-300 hover:-translate-y-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <h3 className="font-mono text-lg font-bold text-corpus-text mb-3">UNDERSTAND</h3>
            <p className="text-corpus-muted text-sm leading-relaxed">
              Auto-scans your codebase and builds a structural graph. Every file,
              function, and dependency mapped in seconds.
            </p>
            <div className="mt-5 pt-4 border-t border-corpus-line/30">
              <span className="text-xs font-mono text-emerald-400/70">corpus init --deep</span>
            </div>
          </div>

          <div className="card-glow-interactive p-8 transition-transform duration-300 hover:-translate-y-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h3 className="font-mono text-lg font-bold text-corpus-text mb-3">WATCH</h3>
            <p className="text-corpus-muted text-sm leading-relaxed">
              Hooks into Claude Code and Cursor via MCP. Intercepts broken
              changes and auto-fixes them before they land.
            </p>
            <div className="mt-5 pt-4 border-t border-corpus-line/30">
              <span className="text-xs font-mono text-indigo-400/70">MCP auto-fix enabled</span>
            </div>
          </div>

          <div className="card-glow-interactive p-8 transition-transform duration-300 hover:-translate-y-1">
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
            <h3 className="font-mono text-lg font-bold text-corpus-text mb-3">SHOW</h3>
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

      {/* ======== LIVE GRAPH PREVIEW ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24 reveal-on-scroll">
        <div className="text-center mb-12">
          <h2 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mb-4">
            <span className="text-gradient">Live Graph Preview</span>
          </h2>
          <p className="text-corpus-muted text-sm max-w-lg mx-auto">
            Every node is a function. Every edge is a dependency. Green means healthy. Watch your codebase breathe.
          </p>
        </div>
        <div className="flex justify-center">
          <div className="card-glow p-8 w-full max-w-lg">
            <LiveGraphPreview />
            <div className="flex items-center justify-center gap-6 mt-6 text-xs font-mono text-corpus-muted">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Healthy
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Modified
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Broken
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ======== STATS ======== */}
      <section className="relative z-10 py-20 border-t border-b border-corpus-line/20 reveal-on-scroll" aria-label="Project statistics">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-corpus-muted text-sm text-center mb-10 font-mono">
            Benchmarked on 7 repos: t3, shadcn/ui, cal.com, trpc, hono, drizzle, prisma
          </p>
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-emerald-400 stat-glow">16K+</div>
              <div className="text-corpus-muted text-sm mt-2 font-mono">files scanned</div>
            </div>
            <div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-gradient">52K+</div>
              <div className="text-corpus-muted text-sm mt-2 font-mono">graph nodes built</div>
            </div>
            <div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-emerald-400 stat-glow">4.5s</div>
              <div className="text-corpus-muted text-sm mt-2 font-mono">total scan time</div>
            </div>
          </div>
        </div>
      </section>

      {/* ======== HOW IT WORKS ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-24 reveal-on-scroll" aria-labelledby="how-heading">
        <h2 id="how-heading" className="font-mono text-2xl md:text-3xl font-bold text-center mb-16 tracking-tight">
          No more <span className="text-gradient">AI slop</span>
        </h2>
        <div className="space-y-10">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center font-mono text-sm text-emerald-400 font-bold">1</div>
            <div>
              <h3 className="font-mono text-base font-bold text-corpus-text mb-1">Your AI writes code</h3>
              <p className="text-corpus-muted text-sm leading-relaxed">Claude Code, Cursor, or any MCP-compatible tool generates changes to your codebase.</p>
            </div>
          </div>
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full border border-indigo-500/30 bg-indigo-500/5 flex items-center justify-center font-mono text-sm text-indigo-400 font-bold">2</div>
            <div>
              <h3 className="font-mono text-base font-bold text-corpus-text mb-1">Corpus intercepts and evaluates</h3>
              <p className="text-corpus-muted text-sm leading-relaxed">Deterministic policy evaluation powered by Jac catches regressions, broken imports, type errors, and structural damage.</p>
            </div>
          </div>
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center font-mono text-sm text-emerald-400 font-bold">3</div>
            <div>
              <h3 className="font-mono text-base font-bold text-corpus-text mb-1">Auto-fix or alert</h3>
              <p className="text-corpus-muted text-sm leading-relaxed">Broken code is healed automatically. If it cannot be fixed, you see it instantly in the visual graph -- red nodes, clear diagnostics.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== BOTTOM CTA ======== */}
      <section className="relative z-10 text-center px-6 pb-16 reveal-on-scroll">
        <p className="text-corpus-muted text-sm font-mono mb-6">
          Corpus watches so you don&apos;t have to.
        </p>
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-corpus-line bg-[#0a0a0a]">
          <span className="text-emerald-400 font-mono text-sm">$</span>
          <code className="text-corpus-text font-mono text-sm">npm install -g corpus-cli</code>
        </div>
      </section>

      {/* ======== SOCIAL PROOF ======== */}
      <section className="relative z-10 py-12 border-t border-corpus-line/20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-mono text-corpus-muted/60">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
              Built at JacHacks 2026
            </span>
            <span className="opacity-20" aria-hidden="true">|</span>
            <span>Powered by Jac</span>
            <span className="opacity-20" aria-hidden="true">|</span>
            <span>Backed by Backboard.io</span>
            <span className="opacity-20" aria-hidden="true">|</span>
            <span>Built on InsForge</span>
          </div>
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
              <a href="https://jaseci.org" target="_blank" rel="noopener noreferrer" className="text-corpus-text hover:text-emerald-400 transition-colors">Jac</a>
            </span>
            <span className="opacity-20" aria-hidden="true">|</span>
            <a href="https://github.com/FluentFlier/corpus" target="_blank" rel="noopener noreferrer" className="hover:text-corpus-text transition-colors">Open source</a>
            <span className="opacity-20" aria-hidden="true">|</span>
            <span>Made at JacHacks 2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
