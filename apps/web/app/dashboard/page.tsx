'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';

interface DashboardEvent {
  time: string;
  file: string;
  severity: string;
  message: string;
}

interface DashboardData {
  score: number;
  filesScanned: number;
  issues: { critical: number; warning: number; info: number };
  events: DashboardEvent[];
  uptime: string;
  lastUpdate: string | null;
  status?: string;
}

interface MemoryStats {
  totalEntries: number;
  totalViolations: number;
  totalFixes: number;
  sessionsTracked: number;
  lastUpdated: string | null;
}

interface MemoryViolation {
  file: string;
  functionName?: string;
  content: string;
  timestamp: string;
  severity?: string;
  rule?: string;
}

interface MemoryData {
  stats: MemoryStats;
  recentViolations: MemoryViolation[];
  flagCounts: Record<string, number>;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? '#16A34A' : score >= 70 ? '#D97706' : '#DC2626';

  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#222" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-mono font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-[#888] font-mono mt-0.5">TRUST</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4 text-center">
      <div className="text-2xl font-mono font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[#888] mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { text: string; color: string }> = {
    CRIT: { text: 'CRIT', color: '#DC2626' },
    WARN: { text: 'WARN', color: '#D97706' },
    INFO: { text: 'INFO', color: '#888' },
    PASS: { text: 'PASS', color: '#16A34A' },
  };
  const c = config[severity] ?? config.INFO;
  return (
    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: c.color, background: `${c.color}15` }}>
      {c.text}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setConnected(true);
        setError(false);
      }
    } catch {
      setError(true);
      setConnected(false);
    }
  }, []);

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch('/api/memory', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setMemoryData(json);
      }
    } catch {
      // Memory endpoint may not have data yet
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/memory/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json();
      if (res.ok) {
        setSyncResult(`Synced ${json.synced} memories to Backboard.io${json.errors > 0 ? ` (${json.errors} errors)` : ''}`);
      } else {
        setSyncResult(json.error || 'Sync failed');
      }
    } catch {
      setSyncResult('Sync request failed');
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchMemory();
    const interval = setInterval(fetchData, 2000);
    const memInterval = setInterval(fetchMemory, 5000);
    return () => { clearInterval(interval); clearInterval(memInterval); };
  }, [fetchData, fetchMemory]);

  const waiting = !data || data.status === 'waiting';

  return (
    <AppShell>
    <main className="min-h-screen bg-[#0D0D0D] text-[#EDEDEA]">
      {/* Status bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-[#1a1a1a]">
        <span className="text-xs text-[#888] font-mono">Live Dashboard</span>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#16A34A]' : error ? 'bg-[#DC2626]' : 'bg-[#D97706]'}`} />
          <span className="text-[10px] text-[#888] font-mono">
            {connected ? 'Connected' : error ? 'Disconnected' : 'Connecting...'}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8">
        {waiting ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-[#222] border-t-[#16A34A] rounded-full animate-spin mb-6" />
            <p className="text-[#888] text-sm font-mono mb-2">Waiting for scan data...</p>
            <p className="text-[#555] text-xs">
              Run <code className="text-[#16A34A]">corpus watch</code> or <code className="text-[#16A34A]">corpus dashboard</code> to start scanning
            </p>
          </div>
        ) : (
          <>
            {/* Score + Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
              <div className="md:col-span-1 bg-[#111] border border-[#222] rounded-xl p-6 flex items-center justify-center">
                <ScoreRing score={data.score} />
              </div>
              <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Files scanned" value={data.filesScanned} color="#EDEDEA" />
                <StatCard label="Critical" value={data.issues.critical} color={data.issues.critical > 0 ? '#DC2626' : '#16A34A'} />
                <StatCard label="Warnings" value={data.issues.warning} color={data.issues.warning > 0 ? '#D97706' : '#16A34A'} />
                <StatCard label="Uptime" value={data.uptime} color="#888" />
              </div>
            </div>

            {/* Events */}
            <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#222]">
                <span className="text-xs text-[#888] font-mono uppercase tracking-wider">Recent Events</span>
                <span className="text-[10px] text-[#555] font-mono">
                  {data.lastUpdate ? `Last: ${data.lastUpdate}` : ''}
                </span>
              </div>
              {data.events.length === 0 ? (
                <div className="px-5 py-8 text-center text-[#555] text-sm">
                  No events yet. Save a file to trigger a scan.
                </div>
              ) : (
                <div className="divide-y divide-[#1a1a1a]">
                  {data.events.slice(-20).reverse().map((event, i) => (
                    <div
                      key={`${event.time}-${event.file}-${i}`}
                      className="flex items-center gap-4 px-5 py-2.5 hover:bg-[#1a1a1a] transition-colors"
                    >
                      <span className="text-[10px] text-[#555] font-mono w-14 shrink-0">{event.time}</span>
                      <SeverityBadge severity={event.severity} />
                      <span className="text-xs text-[#EDEDEA] font-mono truncate flex-1">{event.file}</span>
                      <span className="text-[10px] text-[#555] truncate max-w-[200px]">{event.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Immune Memory */}
            <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden mt-8">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#222]">
                <span className="text-xs text-[#888] font-mono uppercase tracking-wider">Immune Memory</span>
                <div className="flex items-center gap-3">
                  {syncResult && (
                    <span className="text-[10px] text-[#888] font-mono">{syncResult}</span>
                  )}
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="text-[10px] font-mono font-bold px-3 py-1.5 rounded border border-[#333] hover:border-[#16A34A] hover:text-[#16A34A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncing ? 'Syncing...' : 'Sync to Backboard'}
                  </button>
                </div>
              </div>

              {memoryData ? (
                <>
                  {/* Memory Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
                    <div className="text-center">
                      <div className="text-xl font-mono font-bold text-[#EDEDEA]">{memoryData.stats.totalEntries || 0}</div>
                      <div className="text-[10px] text-[#888] mt-0.5 uppercase tracking-wider">Total Memories</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-mono font-bold" style={{ color: (memoryData.stats.totalViolations || 0) > 0 ? '#DC2626' : '#16A34A' }}>
                        {memoryData.stats.totalViolations || 0}
                      </div>
                      <div className="text-[10px] text-[#888] mt-0.5 uppercase tracking-wider">Violations</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-mono font-bold text-[#16A34A]">{memoryData.stats.totalFixes || 0}</div>
                      <div className="text-[10px] text-[#888] mt-0.5 uppercase tracking-wider">Fixes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-mono font-bold text-[#888]">{memoryData.stats.sessionsTracked || 0}</div>
                      <div className="text-[10px] text-[#888] mt-0.5 uppercase tracking-wider">Sessions</div>
                    </div>
                  </div>

                  {/* Flag Counts */}
                  {Object.keys(memoryData.flagCounts).length > 0 && (
                    <div className="px-5 pb-4">
                      <div className="text-[10px] text-[#555] font-mono uppercase tracking-wider mb-2">Flag Counts by Function</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(memoryData.flagCounts).map(([key, count]) => (
                          <span key={key} className="text-[10px] font-mono px-2 py-1 rounded bg-[#1a1a1a] border border-[#222]">
                            <span className="text-[#888]">{key}:</span>{' '}
                            <span className="text-[#D97706] font-bold">{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Violations */}
                  {memoryData.recentViolations.length > 0 && (
                    <div className="border-t border-[#222]">
                      <div className="px-5 py-2 text-[10px] text-[#555] font-mono uppercase tracking-wider">
                        Recent Violations
                      </div>
                      <div className="divide-y divide-[#1a1a1a]">
                        {memoryData.recentViolations.slice(0, 10).map((v, i) => (
                          <div key={`violation-${v.timestamp}-${i}`} className="flex items-center gap-4 px-5 py-2 hover:bg-[#1a1a1a] transition-colors">
                            <span className="text-[10px] text-[#555] font-mono w-32 shrink-0">
                              {v.timestamp ? new Date(v.timestamp).toLocaleString() : '--'}
                            </span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-[#DC2626] bg-[#DC262615]">
                              {v.severity || 'WARN'}
                            </span>
                            <span className="text-xs text-[#EDEDEA] font-mono truncate flex-1">
                              {v.file}{v.functionName ? ` > ${v.functionName}` : ''}
                            </span>
                            <span className="text-[10px] text-[#555] truncate max-w-[250px]">
                              {v.content || v.rule || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {memoryData.recentViolations.length === 0 && Object.keys(memoryData.flagCounts).length === 0 && (
                    <div className="px-5 pb-5 text-center text-[#555] text-xs">
                      No violations recorded yet. Memory builds over time as Corpus scans your codebase.
                    </div>
                  )}
                </>
              ) : (
                <div className="px-5 py-8 text-center text-[#555] text-sm">
                  No memory data available. Run <code className="text-[#16A34A]">corpus watch</code> to start tracking.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
    </AppShell>
  );
}
