'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const waiting = !data || data.status === 'waiting';

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-[#EDEDEA]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-[#16A34A] animate-ping opacity-40" />
          </div>
          <span className="font-mono text-sm font-bold">corpus</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#888] font-mono">Live Dashboard</span>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#16A34A]' : error ? 'bg-[#DC2626]' : 'bg-[#D97706]'}`} />
            <span className="text-[10px] text-[#888] font-mono">
              {connected ? 'Connected' : error ? 'Disconnected' : 'Connecting...'}
            </span>
          </div>
        </div>
      </nav>

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
          </>
        )}
      </div>
    </main>
  );
}
