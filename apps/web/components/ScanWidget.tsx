'use client';

import { useState, useCallback } from 'react';

interface ScanStats {
  files: number;
  functions: number;
  nodes: number;
  edges: number;
  exports: number;
  healthScore: number;
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

interface ScanResult {
  repo: string;
  stats: ScanStats;
  findings: Finding[];
  findingsTotal: number;
  scanTimeMs: number;
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

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
  WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  INFO: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

export default function ScanWidget() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    const trimmed = url.trim();
    if (!isValidGithubUrl(trimmed)) {
      setError('Please enter a valid GitHub URL (e.g. https://github.com/owner/repo)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

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
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) handleScan();
    },
    [handleScan, loading]
  );

  return (
    <div>
      {/* Input */}
      <div className="flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto">
        <div className="relative flex-1 w-full group">
          <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-emerald-500/40 to-indigo-500/40 opacity-0 group-focus-within:opacity-100 blur-[1px] transition-opacity duration-300" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://github.com/..."
            disabled={loading}
            className="relative w-full bg-[#111] rounded-xl border border-corpus-line/60 px-5 py-3.5 font-mono text-sm text-corpus-text placeholder:text-corpus-muted/40 outline-none focus:border-transparent transition-colors disabled:opacity-50"
            aria-label="GitHub repository URL"
          />
        </div>
        <button
          onClick={handleScan}
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-mono text-sm font-medium bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              Scanning...
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

      {/* Quick examples */}
      <div className="mt-6 flex items-center justify-center gap-2 text-xs font-mono text-corpus-muted">
        <span>or try:</span>
        {[
          { label: 'hono', url: 'https://github.com/honojs/hono' },
          { label: 'trpc', url: 'https://github.com/trpc/trpc' },
          { label: 'drizzle-orm', url: 'https://github.com/drizzle-team/drizzle-orm' },
        ].map((example, i) => (
          <span key={example.label} className="flex items-center gap-2">
            {i > 0 && <span className="text-corpus-line">|</span>}
            <button
              onClick={() => { setUrl(example.url); setError(null); setResult(null); }}
              className="text-emerald-400/80 hover:text-emerald-400 transition-colors"
            >
              {example.label}
            </button>
          </span>
        ))}
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 max-w-xl mx-auto">
          <p className="font-mono text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-[#111] border border-corpus-line/30">
            <svg className="animate-spin w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
            <span className="font-mono text-sm text-corpus-muted">Cloning and scanning repository...</span>
          </div>
        </div>
      )}

      {/* Inline results */}
      {result && !loading && (
        <div className="mt-8 max-w-xl mx-auto space-y-5 animate-fade-in">
          {/* Stats row */}
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-sm font-bold text-corpus-text">
              {repoNameFromUrl(result.repo)}
            </span>
            <span className="font-mono text-xs text-corpus-muted">
              {formatTime(result.scanTimeMs)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Files', value: result.stats.files, color: 'text-emerald-400' },
              { label: 'Nodes', value: result.stats.nodes, color: 'text-emerald-400' },
              { label: 'Functions', value: result.stats.functions, color: 'text-indigo-400' },
              { label: 'Findings', value: result.findingsTotal, color: result.findingsTotal > 0 ? 'text-amber-400' : 'text-emerald-400' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-[#0a0a0a] border border-corpus-line/30 p-3 text-center">
                <div className={`font-mono text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                <div className="font-mono text-[10px] text-corpus-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Top 5 findings */}
          {result.findings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-mono text-xs text-corpus-muted uppercase tracking-wider">Top findings</h4>
              {result.findings.slice(0, 5).map((finding, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0a0a0a] border border-corpus-line/30">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${SEVERITY_STYLES[finding.severity] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
                    {finding.severity}
                  </span>
                  <span className="font-mono text-xs text-corpus-text flex-1 truncate">{finding.message}</span>
                  <span className="font-mono text-[10px] text-corpus-muted flex-shrink-0">{finding.file}:{finding.line}</span>
                </div>
              ))}
            </div>
          )}

          {result.findings.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="font-mono text-sm text-emerald-400">No security findings detected</span>
            </div>
          )}

          {/* View full results link */}
          <div className="text-center pt-2">
            <a
              href={`/scan?url=${encodeURIComponent(result.repo)}`}
              className="inline-flex items-center gap-1.5 font-mono text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View full results
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
