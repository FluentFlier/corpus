'use client';

import { useEffect, useState } from 'react';

/* ---- Types ---- */
interface TimelinePoint {
  reposScanned: number;
  totalFindings: number;
  patternsLearned: number;
  suppressed: number;
  note: string;
}

interface Insight {
  pattern: string;
  insight: string;
  repos: string;
}

interface Summary {
  totalRepos: number;
  totalFiles: number;
  totalNodes: number;
  totalFindings: number;
  patternsLearned: number;
  patternsSuppressed: number;
  falsePositiveReduction: string;
  note: string;
}

interface EvolutionData {
  timeline: TimelinePoint[];
  insights: Insight[];
  summary: Summary;
}

/* ---- Pattern visual data: test% for each insight ---- */
const patternTestPct: Record<string, number> = {
  eval_usage: 89,
  hardcoded_ip: 86,
  console_log_sensitive: 41,
  disabled_auth: 80,
  wildcard_cors: 70,
};

/* ---- SVG Timeline Chart ---- */
function TimelineChart({ timeline }: { timeline: TimelinePoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const W = 720;
  const H = 340;
  const PAD = { top: 40, right: 40, bottom: 60, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxX = 32;
  const maxY = 14;

  function xPos(repos: number) {
    return PAD.left + (repos / maxX) * plotW;
  }
  function yPos(val: number) {
    return PAD.top + plotH - (val / maxY) * plotH;
  }

  const learnedPoints = timeline.map((t) => `${xPos(t.reposScanned)},${yPos(t.patternsLearned)}`).join(' ');
  const suppressedPoints = timeline.map((t) => `${xPos(t.reposScanned)},${yPos(t.suppressed)}`).join(' ');

  /* area fill under learned line */
  const learnedArea =
    `M ${xPos(timeline[0]!.reposScanned)},${yPos(0)} ` +
    timeline.map((t) => `L ${xPos(t.reposScanned)},${yPos(t.patternsLearned)}`).join(' ') +
    ` L ${xPos(timeline[timeline.length - 1]!.reposScanned)},${yPos(0)} Z`;

  const xTicks = [0, 5, 10, 15, 20, 25, 30];
  const yTicks = [0, 2, 4, 6, 8, 10, 12, 14];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W, minWidth: 480 }}>
        {/* grid lines */}
        {yTicks.map((v) => (
          <line key={`yg-${v}`} x1={PAD.left} x2={W - PAD.right} y1={yPos(v)} y2={yPos(v)} stroke="#1a1a1a" strokeWidth={1} />
        ))}

        {/* area */}
        <path d={learnedArea} fill="rgba(16,185,129,0.08)" />

        {/* lines */}
        <polyline points={learnedPoints} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinejoin="round" />
        <polyline points={suppressedPoints} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" strokeDasharray="6 3" />

        {/* data points - learned */}
        {timeline.map((t, i) => (
          <g key={`lp-${i}`}>
            <circle
              cx={xPos(t.reposScanned)}
              cy={yPos(t.patternsLearned)}
              r={hoveredIdx === i ? 7 : 5}
              fill="#10b981"
              stroke="#050505"
              strokeWidth={2}
              style={{ cursor: 'pointer', transition: 'r 0.15s' }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          </g>
        ))}

        {/* data points - suppressed */}
        {timeline.map((t, i) => (
          <circle
            key={`sp-${i}`}
            cx={xPos(t.reposScanned)}
            cy={yPos(t.suppressed)}
            r={4}
            fill="#f59e0b"
            stroke="#050505"
            strokeWidth={2}
          />
        ))}

        {/* axes */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#333" strokeWidth={1} />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke="#333" strokeWidth={1} />

        {/* x labels */}
        {xTicks.map((v) => (
          <text key={`xl-${v}`} x={xPos(v)} y={PAD.top + plotH + 24} fill="#666" fontSize={11} textAnchor="middle" fontFamily="system-ui">
            {v}
          </text>
        ))}
        <text x={PAD.left + plotW / 2} y={H - 8} fill="#888" fontSize={12} textAnchor="middle" fontFamily="system-ui">
          Repos scanned
        </text>

        {/* y labels */}
        {yTicks.map((v) => (
          <text key={`yl-${v}`} x={PAD.left - 12} y={yPos(v) + 4} fill="#666" fontSize={11} textAnchor="end" fontFamily="system-ui">
            {v}
          </text>
        ))}
        <text x={14} y={PAD.top + plotH / 2} fill="#888" fontSize={12} textAnchor="middle" fontFamily="system-ui" transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
          Count
        </text>

        {/* legend */}
        <circle cx={W - PAD.right - 180} cy={PAD.top + 8} r={4} fill="#10b981" />
        <text x={W - PAD.right - 170} y={PAD.top + 12} fill="#999" fontSize={11} fontFamily="system-ui">Patterns learned</text>
        <line x1={W - PAD.right - 184} x2={W - PAD.right - 176} y1={PAD.top + 28} y2={PAD.top + 28} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" />
        <circle cx={W - PAD.right - 180} cy={PAD.top + 28} r={3} fill="#f59e0b" />
        <text x={W - PAD.right - 170} y={PAD.top + 32} fill="#999" fontSize={11} fontFamily="system-ui">Suppressed</text>

        {/* tooltip */}
        {hoveredIdx !== null && (() => {
          const t = timeline[hoveredIdx]!;
          const tx = xPos(t.reposScanned);
          const ty = yPos(t.patternsLearned) - 16;
          const boxW = 280;
          const boxH = 58;
          const bx = Math.min(Math.max(tx - boxW / 2, 4), W - boxW - 4);
          const by = ty - boxH - 4;
          return (
            <g>
              <rect x={bx} y={by} width={boxW} height={boxH} rx={6} fill="#111" stroke="#333" strokeWidth={1} />
              <text x={bx + 10} y={by + 18} fill="#ccc" fontSize={11} fontFamily="system-ui">
                {t.reposScanned} repos | {t.patternsLearned} learned | {t.suppressed} suppressed
              </text>
              <text x={bx + 10} y={by + 36} fill="#888" fontSize={10} fontFamily="system-ui">
                {t.note.length > 50 ? t.note.slice(0, 50) + '...' : t.note}
              </text>
              <text x={bx + 10} y={by + 50} fill="#666" fontSize={10} fontFamily="system-ui">
                {t.totalFindings} total findings
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ---- Pattern Bar ---- */
function PatternBar({ testPct }: { testPct: number }) {
  const prodPct = 100 - testPct;
  return (
    <div className="flex items-center gap-3 mt-3">
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-[#1a1a1a] flex">
        <div className="h-full bg-amber-500/70 rounded-l-full" style={{ width: `${testPct}%` }} />
        <div className="h-full bg-emerald-500/70 rounded-r-full" style={{ width: `${prodPct}%` }} />
      </div>
      <div className="flex gap-3 text-xs shrink-0">
        <span className="text-amber-400">{testPct}% test</span>
        <span className="text-emerald-400">{prodPct}% prod</span>
      </div>
    </div>
  );
}

/* ---- Insight Card ---- */
function InsightCard({ insight }: { insight: Insight }) {
  const testPct = patternTestPct[insight.pattern] ?? 50;
  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-5 hover:border-[#2a2a2a] transition-colors duration-200">
      <div className="flex items-center gap-2 mb-2">
        <code className="text-emerald-400 text-sm font-mono bg-emerald-500/10 px-2 py-0.5 rounded">
          {insight.pattern}
        </code>
      </div>
      <p className="text-[#999] text-sm leading-relaxed">{insight.insight}</p>
      <PatternBar testPct={testPct} />
      <p className="text-[#555] text-xs mt-3 font-mono">
        Found in: {insight.repos}
      </p>
    </div>
  );
}

/* ---- How It Works Step ---- */
function Step({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-mono">
        {num}
      </div>
      <div>
        <p className="text-[#EDEDEA] text-sm font-medium">{title}</p>
        <p className="text-[#777] text-sm mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

/* ---- Main Page ---- */
export default function EvolutionPage() {
  const [data, setData] = useState<EvolutionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/evolution.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch: ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d as EvolutionData))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050505' }}>
        <p className="text-red-400 font-mono text-sm">Error loading evolution data: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050505' }}>
        <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const { timeline, insights, summary } = data;

  return (
    <div className="min-h-screen" style={{ background: '#050505', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4" style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #111' }}>
        <a href="/" className="flex items-center gap-2 text-[#EDEDEA] text-lg tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
          corpus
        </a>
        <div className="flex items-center gap-6">
          <a href="/scan" className="text-[#777] text-sm hover:text-[#EDEDEA] transition-colors duration-200">Scan</a>
          <a href="/graph" className="text-[#777] text-sm hover:text-[#EDEDEA] transition-colors duration-200">Explorer</a>
          <a href="/evolution" className="text-emerald-400 text-sm">Evolution</a>
          <a href="/demo" className="text-[#777] text-sm hover:text-[#EDEDEA] transition-colors duration-200">Demo</a>
          <a href="https://github.com/FluentFlier/corpus" target="_blank" rel="noopener noreferrer" className="text-[#777] text-sm hover:text-[#EDEDEA] transition-colors duration-200">GitHub</a>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 pt-28 pb-20">
        {/* Header */}
        <header className="mb-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[#EDEDEA] tracking-tight">
            How Corpus Learns
          </h1>
          <p className="text-[#777] text-lg mt-3">
            Pattern evolution across {summary.totalRepos}+ open-source repositories
          </p>
        </header>

        {/* Summary Stats Bar */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-12 py-4 px-5 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]">
          {[
            { val: summary.totalRepos, label: 'repos' },
            { val: `${Math.round(summary.totalFiles / 1000)}K`, label: 'files' },
            { val: `${summary.totalFindings}+`, label: 'findings' },
            { val: summary.patternsLearned, label: 'patterns learned' },
            { val: summary.falsePositiveReduction, label: 'noise reduction' },
          ].map(({ val, label }) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <span className="text-[#EDEDEA] text-sm font-mono font-bold">{val}</span>
              <span className="text-[#555] text-xs">{label}</span>
            </div>
          ))}
        </div>

        {/* Evolution Timeline Chart */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-[#EDEDEA] mb-6">Evolution Timeline</h2>
          <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
            <TimelineChart timeline={timeline} />
            <div className="mt-4 space-y-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className="text-emerald-400 font-mono shrink-0 w-14">{t.reposScanned} repos</span>
                  <span className="text-[#666]">{t.note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Insight Cards */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-[#EDEDEA] mb-6">Pattern Insights</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard key={insight.pattern} insight={insight} />
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-[#EDEDEA] mb-6">How It Works</h2>
          <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6 space-y-5">
            <Step num={1} title="Scan repos and collect findings" desc="Corpus scans the AST of every file, looking for security patterns across the codebase." />
            <Step num={2} title="Classify each finding" desc="Every finding is classified: production code, test file, or build tool configuration." />
            <Step num={3} title="Calculate false positive rate per pattern" desc="Patterns that appear mostly in test files get a high false-positive score." />
            <Step num={4} title="Suppress high-FP patterns, keep real issues" desc="Patterns above the threshold are suppressed. Real production issues stay flagged." />
            <div className="pt-3 border-t border-[#1a1a1a]">
              <p className="text-emerald-400 text-sm font-medium">
                The system gets smarter with every repo scanned.
              </p>
              <p className="text-[#666] text-xs mt-1">{summary.note}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
