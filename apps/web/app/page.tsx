'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import ScanWidget from '../components/ScanWidget';

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
function HeroSubtitle() {
  return (
    <p className="animate-slide-up-1 text-corpus-muted text-base md:text-lg max-w-2xl leading-relaxed mt-6">
      AI writes your code. Corpus intercepts every file, catches{' '}
      <span className="text-white font-bold">CVE-linked vulnerabilities</span>,{' '}
      <span className="text-white font-bold">hallucinated dependencies</span>, and{' '}
      <span className="text-white font-bold">broken contracts</span> — then heals them automatically.
      <br />
      <span className="text-emerald-400/80 text-sm font-mono mt-2 inline-block">Zero human intervention. The code fixes itself.</span>
    </p>
  );
}

function LiveStats() {
  const [stats, setStats] = useState({
    cvePatterns: 30,
    vulnsBlocked: 711,
    packagesVerified: 12000,
    autoFixes: 49
  });
  const [animated, setAnimated] = useState({ cvePatterns: 0, vulnsBlocked: 0, packagesVerified: 0, autoFixes: 0 });

  useEffect(() => {
    // Fetch real stats if available
    fetch('/benchmarks.json').then(r => r.json()).then(d => {
      setStats(prev => ({
        ...prev,
        vulnsBlocked: d.totalFindings || 711,
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const t = Math.min(step / steps, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setAnimated({
        cvePatterns: Math.round(stats.cvePatterns * ease),
        vulnsBlocked: Math.round(stats.vulnsBlocked * ease),
        packagesVerified: Math.round(stats.packagesVerified * ease),
        autoFixes: Math.round(stats.autoFixes * ease),
      });
      if (step >= steps) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [stats]);

  const fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : String(n);

  return (
    <div className="grid grid-cols-4 gap-8 text-center">
      <div>
        <div className="font-mono text-4xl md:text-5xl font-bold text-red-400 stat-glow">{animated.cvePatterns}</div>
        <div className="text-corpus-muted text-sm mt-2 font-mono">CVE patterns tracked</div>
      </div>
      <div>
        <div className="font-mono text-4xl md:text-5xl font-bold text-emerald-400 stat-glow">{fmt(animated.vulnsBlocked)}</div>
        <div className="text-corpus-muted text-sm mt-2 font-mono">findings detected</div>
      </div>
      <div>
        <div className="font-mono text-4xl md:text-5xl font-bold text-gradient">{fmt(animated.packagesVerified)}</div>
        <div className="text-corpus-muted text-sm mt-2 font-mono">packages verified</div>
      </div>
      <div>
        <div className="font-mono text-4xl md:text-5xl font-bold text-emerald-400 stat-glow">15</div>
        <div className="text-corpus-muted text-sm mt-2 font-mono">defense layers</div>
      </div>
    </div>
  );
}

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

  return <div ref={containerRef} className="p-5 font-mono text-sm leading-7" style={{ height: 280, overflow: 'hidden' }} />;
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

/* ---- Jac Walker data (summary for landing page) ---- */
const JAC_WALKERS = [
  { name: 'Action Safety', icon: '\u26A1', color: 'red' as const, tagline: 'Blocks destructive actions universally' },
  { name: 'Scope Guard', icon: '\uD83D\uDEE1\uFE0F', color: 'emerald' as const, tagline: 'Enforces action scope boundaries' },
  { name: 'Rate Guard', icon: '\u23F1\uFE0F', color: 'amber' as const, tagline: 'Rate limiting for AI actions' },
  { name: 'Confidence Calibrator', icon: '\uD83C\uDFAF', color: 'indigo' as const, tagline: 'Detects AI overconfidence & underconfidence' },
  { name: 'Injection Firewall', icon: '\uD83D\uDD25', color: 'red' as const, tagline: 'Blocks prompt injection attacks' },
  { name: 'Exfiltration Guard', icon: '\uD83D\uDD12', color: 'red' as const, tagline: 'Prevents PII data exfiltration' },
  { name: 'Session Hijack', icon: '\uD83D\uDC7E', color: 'amber' as const, tagline: 'Detects automated session injection' },
  { name: 'Cross-User Firewall', icon: '\uD83D\uDC65', color: 'red' as const, tagline: 'Prevents cross-user data access' },
  { name: 'Context Poisoning', icon: '\u2620\uFE0F', color: 'amber' as const, tagline: 'Detects poisoned memory chunks' },
  { name: 'Undo Integrity', icon: '\u21A9\uFE0F', color: 'indigo' as const, tagline: 'Validates undo capability before execution' },
];

const JAC_COLOR_MAP = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400' },
};

/* ======== MAIN PAGE ======== */

export default function HomePage(): React.ReactElement {
  const handleCardGlow = useCardGlow();

  return (
    <main className="min-h-screen bg-corpus-bg bg-grid relative overflow-hidden">
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
          <span className="font-mono text-base tracking-tight font-bold text-gradient-shimmer">
            Corpus
          </span>
        </a>
        <div className="flex items-center gap-6">
          <a href="/scan" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Scan</a>
          <a href="/graph" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Explorer</a>
          <a href="/evolution" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Evolution</a>
          <a href="/policies" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Jac</a>
          <a href="/demo" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Demo</a>
          <a href="https://github.com/FluentFlier/corpus" target="_blank" rel="noopener noreferrer" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">GitHub</a>
          <a href="/live" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow-pulse" />
            Live
          </a>
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

        <h1 className="animate-slide-up font-mono font-bold tracking-tighter leading-[0.95] max-w-4xl">
          <span className="text-gradient-shimmer text-6xl sm:text-7xl md:text-8xl lg:text-9xl">Corpus</span>
          <br />
          <span className="text-white/80 text-3xl sm:text-4xl md:text-5xl">the immune system for your code</span>
        </h1>

        <p className="animate-slide-up-1 mt-5 text-xl sm:text-2xl font-mono font-bold">
          <span className="text-gradient">Self-healing code. Zero human intervention.</span>
        </p>

        <HeroSubtitle />

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
            href="/scan"
            className="text-corpus-muted text-sm font-mono hover:text-corpus-text transition-colors duration-200 flex items-center gap-1.5"
          >
            Scan a repo
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

      {/* ======== SCAN ANY REPO CTA ======== */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-24 animate-fade-in-5">
        <div className="card-glow p-8 md:p-10 text-center">
          <h2 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mb-3">
            Try it now -- <span className="text-gradient">scan any GitHub repository</span>
          </h2>
          <p className="text-corpus-muted text-sm mb-8">
            Paste a repo URL and Corpus builds the structural graph, runs security scanners, and shows findings.
          </p>
          <ScanWidget />
        </div>
      </section>

      {/* ======== FEATURES (mouse-follow glow) ======== */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24 animate-fade-in-5" aria-labelledby="features-heading" onMouseMove={handleCardGlow}>
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

      {/* ======== 15 DEFENSE LAYERS ======== */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24 animate-fade-in" aria-labelledby="layers-heading">
        <div className="text-center mb-12">
          <h2 id="layers-heading" className="font-mono text-2xl md:text-3xl font-bold tracking-tight mb-4">
            <span className="text-gradient">15 Defense Layers</span>
          </h2>
          <p className="text-corpus-muted text-sm max-w-2xl mx-auto">
            Two tiers of protection. Code scanners catch file-level issues. Agent guardrails enforce behavioral safety.
          </p>
        </div>

        {/* Tier 1: Code Scanners */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-sm font-bold text-corpus-text">CODE SCANNERS</span>
            <span className="text-corpus-muted text-xs font-mono">File-level analysis in milliseconds</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: 'Graph Contracts', desc: 'Diffs against structural graph. Catches removed functions, deleted guards, broken exports.', color: '#10b981' },
              { name: 'CVE Patterns', desc: '30 vulnerability patterns mapped to real CVE IDs. SQL injection, SSRF, prototype pollution.', color: '#ef4444' },
              { name: 'Secret Detection', desc: 'API keys, tokens, private keys, database URLs, webhook secrets in source code.', color: '#ef4444' },
              { name: 'Code Safety', desc: 'eval(), exec(), innerHTML, disabled SSL, SQL concatenation, wildcard CORS.', color: '#f59e0b' },
              { name: 'Dependency Check', desc: 'Hallucinated npm packages, typosquats, non-existent imports. Checks against 12K+ known packages.', color: '#6366f1' },
              { name: 'Pattern Intelligence', desc: 'Learned from 280 repos. Context-aware: eval() in webpack = suppress, eval() in route = critical.', color: '#10b981' },
              { name: 'Trust Scoring', desc: 'Per-file and codebase-wide trust scores. 0-100 based on finding density and severity.', color: '#8b5cf6' },
            ].map(s => (
              <div key={s.name} className="card-glow p-4 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <h4 className="font-mono text-xs font-bold text-corpus-text">{s.name}</h4>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: s.color + 'cc' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tier 2: Agent Guardrails */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="font-mono text-sm font-bold text-corpus-text">AGENT GUARDRAILS</span>
            <span className="text-corpus-muted text-xs font-mono">Behavioral safety via Jac walkers</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: 'Injection Firewall', desc: 'Scans external content for prompt injection before it enters LLM context.', color: '#ef4444' },
              { name: 'Exfiltration Guard', desc: 'Detects PII in outbound payloads — emails, SSNs, credit cards — and redacts.', color: '#ef4444' },
              { name: 'Context Poisoning', desc: 'Scans stored memory for poisoning signatures like "ignore previous instructions."', color: '#f59e0b' },
              { name: 'Cross-User Firewall', desc: 'Enforces user context isolation. Prevents data from user A bleeding into user B.', color: '#ef4444' },
              { name: 'Session Hijack', desc: 'Detects rapid-fire events and timing anomalies that indicate automated injection.', color: '#f59e0b' },
              { name: 'Confidence Calibrator', desc: 'Audits action logs for overconfidence and underconfidence per intent category.', color: '#6366f1' },
              { name: 'Scope Enforcer', desc: 'Checks if proposed action falls within developer-declared scope boundaries.', color: '#10b981' },
              { name: 'Undo Integrity', desc: 'Classifies actions as reversible, best-effort, or irreversible before execution.', color: '#6366f1' },
            ].map(s => (
              <div key={s.name} className="card-glow p-4 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <h4 className="font-mono text-xs font-bold text-corpus-text">{s.name}</h4>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: s.color + 'cc' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======== STATS ======== */}
      <section className="relative z-10 py-20 border-t border-b border-corpus-line/20 animate-fade-in-7" aria-label="Project statistics">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-corpus-muted text-sm text-center mb-10 font-mono">
            Real-time immune intelligence. Learned from 280+ open-source repos.
          </p>
          <LiveStats />
        </div>
      </section>

      {/* ======== PREVIOUSLY SCANNED REPOS ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-24 animate-fade-in" aria-labelledby="scanned-heading">
        <h2 id="scanned-heading" className="font-mono text-2xl md:text-3xl font-bold text-center tracking-tight mb-4">
          <span className="text-gradient">Previously Scanned Repos</span>
        </h2>
        <p className="text-corpus-muted text-sm text-center mb-10 font-mono">
          Benchmarked against popular open-source projects
        </p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="border-b border-corpus-line/30">
                <th className="text-left py-3 px-4 text-corpus-muted text-xs font-normal uppercase tracking-wider">Repository</th>
                <th className="text-right py-3 px-4 text-corpus-muted text-xs font-normal uppercase tracking-wider">Files</th>
                <th className="text-right py-3 px-4 text-corpus-muted text-xs font-normal uppercase tracking-wider">Nodes</th>
                <th className="text-right py-3 px-4 text-corpus-muted text-xs font-normal uppercase tracking-wider">Findings</th>
                <th className="text-right py-3 px-4 text-corpus-muted text-xs font-normal uppercase tracking-wider">Scan Time</th>
              </tr>
            </thead>
            <tbody>
              {[
                { repo: 'honojs/hono', files: 362, nodes: 1567, findings: 69, timeMs: 107 },
                { repo: 'drizzle-team/drizzle-orm', files: 966, nodes: 4874, findings: 37, timeMs: 334 },
                { repo: 'trpc/trpc', files: 909, nodes: 2936, findings: 8, timeMs: 255 },
                { repo: 'shadcn-ui/ui', files: 3383, nodes: 12840, findings: null, timeMs: 933 },
                { repo: 'calcom/cal.com', files: 7508, nodes: 22794, findings: null, timeMs: 2118 },
                { repo: 'prisma/prisma', files: 2813, nodes: 6782, findings: null, timeMs: 642 },
                { repo: 't3-oss/create-t3-app', files: 178, nodes: 322, findings: 0, timeMs: 73 },
              ].map((row) => (
                <tr key={row.repo} className="border-b border-corpus-line/15 hover:bg-emerald-500/[0.03] transition-colors">
                  <td className="py-3 px-4">
                    <a
                      href={`https://github.com/${row.repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-corpus-text hover:text-emerald-400 transition-colors"
                    >
                      {row.repo}
                    </a>
                  </td>
                  <td className="py-3 px-4 text-right text-corpus-muted">{row.files.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-corpus-muted">{row.nodes.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    {row.findings === null ? (
                      <span className="text-corpus-muted/40">--</span>
                    ) : row.findings === 0 ? (
                      <span className="text-emerald-400">0</span>
                    ) : (
                      <span className="text-amber-400">{row.findings}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-corpus-muted">
                    {row.timeMs < 1000 ? `${row.timeMs}ms` : `${(row.timeMs / 1000).toFixed(1)}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ======== HOW IT WORKS ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-24 animate-fade-in" aria-labelledby="how-heading">
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
      <section className="relative z-10 text-center px-6 pb-16 animate-fade-in">
        <p className="text-corpus-muted text-sm font-mono mb-6">
          Corpus watches so you don&apos;t have to.
        </p>
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-corpus-line bg-[#0a0a0a]">
          <span className="text-emerald-400 font-mono text-sm">$</span>
          <code className="text-corpus-text font-mono text-sm">npm install -g corpus-cli</code>
        </div>
      </section>

      {/* ======== JAC POLICIES SECTION ======== */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-24 animate-fade-in" aria-labelledby="jac-heading">
        <div className="text-center mb-12">
          <h2 id="jac-heading" className="font-mono text-2xl md:text-3xl font-bold tracking-tight mb-4">
            <span className="text-gradient-shimmer">10 Jac Walkers</span> guarding your AI agent
          </h2>
          <p className="text-corpus-muted text-sm max-w-2xl mx-auto leading-relaxed">
            Deterministic policy evaluation powered by{' '}
            <a href="https://jaseci.org" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Jac</a>.
            No LLM opinions. No probabilistic guessing. Pure graph traversal that returns{' '}
            <span className="text-emerald-400 font-mono">PASS</span>,{' '}
            <span className="text-amber-400 font-mono">CONFIRM</span>, or{' '}
            <span className="text-red-400 font-mono">BLOCK</span>.
          </p>
        </div>

        {/* Why Jac pillars */}
        <div className="card-glow p-8 mb-10">
          <h3 className="font-mono text-lg font-bold text-corpus-text mb-5">
            Why <a href="https://jaseci.org" target="_blank" rel="noopener noreferrer" className="text-gradient hover:underline">Jac</a> for Policy Evaluation?
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-mono text-sm font-bold text-emerald-400 mb-2">Deterministic</h4>
              <p className="text-corpus-muted text-sm leading-relaxed">
                LLMs are probabilistic -- ask the same question twice, get different answers. Safety policies must be deterministic. Jac walkers traverse a graph and return the same verdict every time.
              </p>
            </div>
            <div>
              <h4 className="font-mono text-sm font-bold text-indigo-400 mb-2">Graph-Native</h4>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Jac is built around graphs. Policy evaluation is graph traversal -- walkers visit nodes, check conditions, and report verdicts. No ORM, no SQL.
              </p>
            </div>
            <div>
              <h4 className="font-mono text-sm font-bold text-amber-400 mb-2">Composable</h4>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Each walker is independent. Stack 10 built-in policies, then add your own custom walkers. Each one checks a specific concern -- no tangled if-else chains.
              </p>
            </div>
          </div>
        </div>

        {/* Walker grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {JAC_WALKERS.map((w) => {
            const c = JAC_COLOR_MAP[w.color];
            return (
              <div key={w.name} className="card-glow p-4 transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center text-base flex-shrink-0`}>
                    {w.icon}
                  </div>
                  <h4 className="font-mono text-xs font-bold text-corpus-text leading-tight">{w.name}</h4>
                </div>
                <p className={`text-[11px] font-mono ${c.text}`}>{w.tagline}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <a
            href="/policies"
            className="inline-flex items-center gap-2 text-sm font-mono text-corpus-muted hover:text-emerald-400 transition-colors duration-200"
          >
            See full policy details &amp; Jac source code
            <span aria-hidden="true">&rarr;</span>
          </a>
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
            <span className="font-mono text-xs text-corpus-muted">Corpus</span>
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
