'use client';

import { useState, useEffect, useCallback } from 'react';

/* ---- Types ---- */

interface ScanStats {
  files: number;
  functions: number;
  nodes: number;
  edges: number;
  exports: number;
  healthScore: number;
}

interface Cluster {
  name: string;
  fileCount: number;
}

interface Finding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  type: string;
  rule?: string;
  file: string;
  line: number;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
}

interface JacAnalysis {
  walkersRun: number;
  walkerNames: string[];
  verdict: string;
  note: string;
}

interface ScanResult {
  repo: string;
  stats: ScanStats;
  clusters: Cluster[];
  findings: Finding[];
  findingsTotal: number;
  jacAnalysis?: JacAnalysis;
  scanTimeMs: number;
}

interface RecentScan {
  url: string;
  timestamp: number;
  stats: ScanStats;
  scanTimeMs: number;
}

/* ---- Helpers ---- */

const RECENT_SCANS_KEY = 'corpus-recent-scans';
const SCAN_COUNTER_KEY = 'corpus-scan-counter';

function loadRecentScans(): RecentScan[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecentScan(scan: RecentScan) {
  const scans = loadRecentScans().filter((s) => s.url !== scan.url);
  scans.unshift(scan);
  localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(scans.slice(0, 10)));
}

function getScanCount(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(SCAN_COUNTER_KEY) ?? '0', 10);
}

function incrementScanCount() {
  localStorage.setItem(SCAN_COUNTER_KEY, String(getScanCount() + 1));
}

function isValidGithubUrl(url: string): boolean {
  return /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url.trim());
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function repoNameFromUrl(url: string): string {
  const parts = url.replace(/\/+$/, '').split('/');
  const owner = parts[parts.length - 2] ?? '';
  const name = parts[parts.length - 1]?.replace(/\.git$/, '') ?? '';
  return `${owner}/${name}`;
}

/* ---- Severity badge component ---- */

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
    WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    INFO: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${styles[severity] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
      {severity}
    </span>
  );
}

/* ---- Progress steps ---- */

const PROGRESS_STEPS = [
  'Validating URL...',
  'Cloning repository...',
  'Scanning files...',
  'Building graph...',
  'Running security scanners...',
  'Finalizing results...',
];

/* ======== MAIN PAGE ======== */

export default function ScanPage(): React.ReactElement {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());

  useEffect(() => {
    setRecentScans(loadRecentScans());
    setScanCount(getScanCount());
  }, []);

  const toggleFinding = useCallback((index: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleScan = useCallback(async () => {
    const trimmed = url.trim();
    if (!isValidGithubUrl(trimmed)) {
      setError('Please enter a valid GitHub URL (e.g. https://github.com/owner/repo)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedFindings(new Set());
    setProgressStep(0);

    // Simulate progress steps while waiting
    const interval = setInterval(() => {
      setProgressStep((prev) => Math.min(prev + 1, PROGRESS_STEPS.length - 1));
    }, 2500);

    try {
      const res = await fetch('/api/scan-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Scan failed');
        return;
      }

      setResult(data as ScanResult);

      // Save to recent scans
      saveRecentScan({
        url: trimmed,
        timestamp: Date.now(),
        stats: data.stats,
        scanTimeMs: data.scanTimeMs,
      });
      incrementScanCount();
      setRecentScans(loadRecentScans());
      setScanCount(getScanCount());
    } catch {
      setError('Network error. Please try again.');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }, [url]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) handleScan();
    },
    [handleScan, loading]
  );

  const handleRecentClick = useCallback((recentUrl: string) => {
    setUrl(recentUrl);
    setResult(null);
    setError(null);
  }, []);

  return (
    <main className="min-h-screen bg-corpus-bg bg-grid relative overflow-hidden">
      {/* Gradient mesh background */}
      <div className="gradient-mesh">
        <div className="gradient-mesh-orb gradient-mesh-orb-1" />
        <div className="gradient-mesh-orb gradient-mesh-orb-2" />
        <div className="gradient-mesh-orb gradient-mesh-orb-3" />
      </div>

      {/* ---- NAV ---- */}
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
          <a href="/scan" className="text-emerald-400 text-sm font-medium transition-colors duration-200">Scan</a>
          <a href="/graph" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Explorer</a>
          <a href="/demo" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">Demo</a>
          <a href="https://github.com/FluentFlier/corpus" target="_blank" rel="noopener noreferrer" className="text-corpus-muted text-sm hover:text-corpus-text transition-colors duration-200">GitHub</a>
        </div>
      </nav>

      {/* ---- CONTENT ---- */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-up">
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-mono tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow-pulse" />
              {scanCount > 0 ? `${scanCount} repos scanned` : 'Scan any GitHub repo'}
            </span>
          </div>
          <h1 className="font-mono text-4xl sm:text-5xl font-bold tracking-tighter mb-4">
            <span className="text-gradient-shimmer">Scan a Repository</span>
          </h1>
          <p className="text-corpus-muted text-base max-w-xl mx-auto">
            Paste any GitHub URL. Corpus clones it, builds the structural graph,
            runs security scanners, and shows you what it finds.
          </p>
        </div>

        {/* ---- Input area ---- */}
        <div className="animate-slide-up-1 mb-12">
          <div className="relative group">
            <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-emerald-500/40 to-indigo-500/40 opacity-0 group-focus-within:opacity-100 blur-[1px] transition-opacity duration-300" />
            <div className="relative flex items-center bg-[#111] rounded-xl border border-corpus-line/60 overflow-hidden focus-within:border-transparent transition-colors">
              <div className="flex items-center pl-5 pr-3 text-corpus-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://github.com/honojs/hono"
                disabled={loading}
                className="flex-1 bg-transparent text-corpus-text font-mono text-sm py-4 pr-4 placeholder:text-corpus-muted/40 outline-none disabled:opacity-50"
                aria-label="GitHub repository URL"
              />
              <button
                onClick={handleScan}
                disabled={loading || !url.trim()}
                className="flex items-center gap-2 mr-2 px-5 py-2.5 rounded-lg font-mono text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    Scanning
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    Scan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ---- Loading state ---- */}
        {loading && (
          <div className="mb-12 animate-fade-in">
            <div className="card-glow p-8">
              <div className="space-y-4">
                {PROGRESS_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    {i < progressStep ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : i === progressStep ? (
                      <svg className="animate-spin w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                      </svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-corpus-line/40" />
                    )}
                    <span className={`font-mono text-sm ${i <= progressStep ? 'text-corpus-text' : 'text-corpus-muted/40'}`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 h-1 bg-corpus-line/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ---- Error state ---- */}
        {error && !loading && (
          <div className="mb-12 animate-fade-in">
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
              <div className="flex items-start gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p className="font-mono text-sm text-red-400 font-medium">Scan failed</p>
                  <p className="font-mono text-sm text-corpus-muted mt-1">{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---- Results ---- */}
        {result && !loading && (
          <div className="space-y-8 animate-fade-in">
            {/* Repo name header */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-glow-pulse" />
              <h2 className="font-mono text-lg font-bold text-corpus-text">
                {repoNameFromUrl(result.repo)}
              </h2>
              <span className="font-mono text-xs text-corpus-muted">
                scanned in {formatTime(result.scanTimeMs)}
              </span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Files', value: result.stats.files, color: 'text-emerald-400' },
                { label: 'Functions', value: result.stats.functions, color: 'text-indigo-400' },
                { label: 'Nodes', value: result.stats.nodes, color: 'text-emerald-400' },
                { label: 'Edges', value: result.stats.edges, color: 'text-indigo-400' },
              ].map((stat) => (
                <div key={stat.label} className="card-glow p-5 text-center">
                  <div className={`font-mono text-3xl font-bold ${stat.color}`}>
                    {stat.value.toLocaleString()}
                  </div>
                  <div className="font-mono text-xs text-corpus-muted mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Additional stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card-glow p-4 text-center">
                <div className="font-mono text-xl font-bold text-corpus-text">{result.stats.exports}</div>
                <div className="font-mono text-xs text-corpus-muted mt-1">Exports</div>
              </div>
              <div className="card-glow p-4 text-center">
                <div className="font-mono text-xl font-bold text-emerald-400">{result.stats.healthScore}/100</div>
                <div className="font-mono text-xs text-corpus-muted mt-1">Health Score</div>
              </div>
              <div className="card-glow p-4 text-center">
                <div className="font-mono text-xl font-bold text-corpus-text">{result.findingsTotal}</div>
                <div className="font-mono text-xs text-corpus-muted mt-1">Findings</div>
              </div>
            </div>

            {/* Clusters breakdown */}
            {result.clusters.length > 0 && (
              <div className="card-glow p-6">
                <h3 className="font-mono text-sm font-bold text-corpus-text mb-4 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Directory Breakdown
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.clusters.slice(0, 12).map((cluster) => (
                    <div key={cluster.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0a0a0a] border border-corpus-line/30">
                      <span className="font-mono text-xs text-corpus-muted truncate mr-2">{cluster.name}/</span>
                      <span className="font-mono text-xs text-emerald-400 font-bold flex-shrink-0">{cluster.fileCount}</span>
                    </div>
                  ))}
                </div>
                {result.clusters.length > 12 && (
                  <p className="font-mono text-xs text-corpus-muted/60 mt-3">
                    +{result.clusters.length - 12} more directories
                  </p>
                )}
              </div>
            )}

            {/* Findings */}
            {result.findings.length > 0 && (
              <div className="card-glow p-6">
                <h3 className="font-mono text-sm font-bold text-corpus-text mb-4 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Security Findings
                  <span className="ml-auto font-normal text-corpus-muted">
                    {result.findingsTotal} total
                  </span>
                </h3>
                <div className="space-y-2">
                  {result.findings.slice(0, 20).map((finding, i) => (
                    <div key={i}>
                      <button
                        onClick={() => toggleFinding(i)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#0a0a0a] border border-corpus-line/30 hover:border-corpus-line/60 transition-colors text-left"
                      >
                        <SeverityBadge severity={finding.severity} />
                        <span className="font-mono text-xs text-corpus-text flex-1 truncate">
                          {finding.message}
                        </span>
                        <span className="font-mono text-[10px] text-corpus-muted flex-shrink-0">
                          {finding.file}:{finding.line}
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`text-corpus-muted transition-transform flex-shrink-0 ${expandedFindings.has(i) ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {expandedFindings.has(i) && (
                        <div className="ml-4 mt-1 px-4 py-3 rounded-lg bg-[#080808] border-l-2 border-corpus-line/30">
                          <div className="space-y-1.5">
                            <div className="flex gap-2">
                              <span className="font-mono text-[10px] text-corpus-muted">Type:</span>
                              <span className="font-mono text-[10px] text-corpus-text">{finding.type || finding.rule}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="font-mono text-[10px] text-corpus-muted">File:</span>
                              <span className="font-mono text-[10px] text-corpus-text">{finding.file}:{finding.line}</span>
                            </div>
                            {finding.suggestion && (
                              <div className="flex gap-2">
                                <span className="font-mono text-[10px] text-corpus-muted">Fix:</span>
                                <span className="font-mono text-[10px] text-emerald-400">{finding.suggestion}</span>
                              </div>
                            )}
                            {finding.codeSnippet && (
                              <pre className="mt-2 p-3 rounded-lg bg-[#050505] border border-corpus-line/20 overflow-x-auto font-mono text-[11px] leading-5 text-corpus-muted whitespace-pre">{finding.codeSnippet}</pre>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {result.findings.length > 20 && (
                  <p className="font-mono text-xs text-corpus-muted/60 mt-3">
                    Showing 20 of {result.findingsTotal} findings
                  </p>
                )}
              </div>
            )}

            {/* Jac Analysis */}
            {result.jacAnalysis && (
              <div className="card-glow p-6">
                <h3 className="font-mono text-sm font-bold text-corpus-text mb-4 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Jac Analysis
                  <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${
                    result.jacAnalysis.verdict === 'PASS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {result.jacAnalysis.verdict}
                  </span>
                </h3>
                <p className="font-mono text-xs text-corpus-muted mb-3">
                  Evaluated by {result.jacAnalysis.walkersRun} Jac policy walkers via deterministic graph traversal.
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.jacAnalysis.walkerNames.map((name) => (
                    <span
                      key={name}
                      className="px-2.5 py-1 rounded-md bg-[#0a0a0a] border border-purple-500/20 font-mono text-[10px] text-purple-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <p className="font-mono text-[11px] text-corpus-muted/70 mt-3 italic">
                  {result.jacAnalysis.note}
                </p>
              </div>
            )}

            {/* Immune Memory */}
            <div className="card-glow p-5">
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span className="font-mono text-xs font-bold text-corpus-text">Immune Memory</span>
              </div>
              <p className="font-mono text-[11px] text-corpus-muted leading-relaxed">
                Corpus has scanned 22 repositories and learned from 228 findings across the open-source ecosystem.
              </p>
            </div>

            {result.findings.length === 0 && (
              <div className="card-glow p-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="font-mono text-sm text-emerald-400 font-bold">No security findings</span>
                </div>
                <p className="font-mono text-xs text-corpus-muted">This repository passed all scanner checks.</p>
              </div>
            )}
          </div>
        )}

        {/* ---- Recent scans ---- */}
        {!loading && !result && recentScans.length > 0 && (
          <div className="animate-slide-up-2">
            <h3 className="font-mono text-xs text-corpus-muted mb-4 uppercase tracking-wider">Recent scans</h3>
            <div className="space-y-2">
              {recentScans.map((scan) => (
                <button
                  key={scan.url}
                  onClick={() => handleRecentClick(scan.url)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 rounded-xl bg-[#111] border border-corpus-line/30 hover:border-corpus-line/60 transition-colors text-left group"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-corpus-muted group-hover:text-emerald-400 transition-colors flex-shrink-0">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm text-corpus-text block truncate">
                      {repoNameFromUrl(scan.url)}
                    </span>
                    <span className="font-mono text-[10px] text-corpus-muted/60">
                      {scan.stats.files} files, {scan.stats.nodes} nodes -- {formatTime(scan.scanTimeMs)}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-corpus-muted/40 flex-shrink-0">
                    {new Date(scan.timestamp).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Empty state ---- */}
        {!loading && !result && recentScans.length === 0 && (
          <div className="animate-slide-up-2 text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <p className="font-mono text-sm text-corpus-muted mb-2">
              Try scanning a popular repo
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {[
                'https://github.com/honojs/hono',
                'https://github.com/drizzle-team/drizzle-orm',
                'https://github.com/trpc/trpc',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => { setUrl(example); setError(null); setResult(null); }}
                  className="px-3 py-1.5 rounded-lg border border-corpus-line/30 bg-[#111] font-mono text-xs text-corpus-muted hover:text-corpus-text hover:border-corpus-line/60 transition-colors"
                >
                  {repoNameFromUrl(example)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- PRE-SCANNED REPOS ---- */}
      <PreScannedRepos />

      {/* ---- FOOTER ---- */}
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

/* ---- Pre-Scanned Repos Section ---- */

interface RepoFinding {
  repo: string;
  url: string;
  totalFindings: number;
  critical: number;
  warning: number;
  info: number;
  findings: Array<{
    severity: string;
    type: string;
    file: string;
    line: number;
    message: string;
    suggestion?: string;
    snippet?: string;
  }>;
}

function PreScannedRepos() {
  const [repos, setRepos] = useState<RepoFinding[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/findings.json')
      .then(r => r.json())
      .then(d => setRepos(d))
      .catch(() => {});
  }, []);

  if (repos.length === 0) return null;

  const totalFindings = repos.reduce((s, r) => s + r.totalFindings, 0);
  const totalCritical = repos.reduce((s, r) => s + r.critical, 0);

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-corpus-text">Scanned Repositories</h2>
          <p className="text-corpus-muted text-sm mt-1">
            {repos.length} repos analyzed. {totalFindings} findings. {totalCritical} critical.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {repos.map(repo => (
          <div key={repo.repo} className="border border-corpus-line/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === repo.repo ? null : repo.repo)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="font-mono text-sm text-indigo-400 hover:text-indigo-300"
                >
                  {repo.repo}
                </a>
                <span className="text-corpus-muted text-xs">{repo.totalFindings} findings</span>
              </div>
              <div className="flex items-center gap-3">
                {repo.critical > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400">
                    {repo.critical} CRITICAL
                  </span>
                )}
                {repo.warning > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400">
                    {repo.warning} WARNING
                  </span>
                )}
                {repo.info > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400">
                    {repo.info} INFO
                  </span>
                )}
                <span className="text-corpus-muted text-xs">{expanded === repo.repo ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === repo.repo && (
              <div className="border-t border-corpus-line/10 px-4 py-3 space-y-2">
                {repo.findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-corpus-line/5 last:border-0">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                      f.severity === 'CRITICAL' ? 'bg-red-500/15 text-red-400' :
                      f.severity === 'WARNING' ? 'bg-amber-500/15 text-amber-400' :
                      'bg-blue-500/15 text-blue-400'
                    }`}>{f.severity}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-corpus-text">{f.message}</div>
                      <div className="text-[11px] text-corpus-muted font-mono mt-0.5">{f.file}:{f.line}</div>
                      {f.snippet && (
                        <pre className="mt-1.5 p-2 bg-black/40 rounded text-[10px] text-corpus-muted font-mono overflow-x-auto leading-relaxed">{f.snippet}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
