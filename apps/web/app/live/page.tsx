'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LiveEvent {
  id: string;
  type: 'scan' | 'violation' | 'verified' | 'health_update';
  timestamp: string;
  file: string;
  verdict: string;
  details: string;
}

interface LiveStats {
  filesWatched: number;
  functionsTracked: number;
  violationsCaught: number;
  autoFixes: number;
  uptimeStart: number;
}

/* ------------------------------------------------------------------ */
/*  Simulated activity (demo mode)                                     */
/* ------------------------------------------------------------------ */

const DEMO_FILES = [
  'src/auth/login.ts',
  'src/api/routes.ts',
  'src/db/queries.ts',
  'src/utils/validate.ts',
  'src/core/engine.ts',
  'src/hooks/useSession.ts',
  'src/middleware/cors.ts',
  'src/services/user.ts',
  'src/graph/traverse.ts',
  'src/policies/evaluate.ts',
  'src/config/env.ts',
  'src/workers/scan.ts',
];

const VIOLATION_MESSAGES = [
  'guard clause removed',
  'unused import introduced',
  'type assertion bypasses safety',
  'error handler removed',
  'hardcoded credential detected',
  'missing null check',
];

function generateDemoEvent(counter: number): LiveEvent {
  const isViolation = Math.random() < 0.15;
  const file = DEMO_FILES[Math.floor(Math.random() * DEMO_FILES.length)]!;
  return {
    id: `demo-${counter}-${Date.now()}`,
    type: isViolation ? 'violation' : 'verified',
    timestamp: new Date().toISOString(),
    file,
    verdict: isViolation ? 'VIOLATES' : 'VERIFIED',
    details: isViolation
      ? VIOLATION_MESSAGES[Math.floor(Math.random() * VIOLATION_MESSAGES.length)]!
      : 'All policies pass',
  };
}

/* ------------------------------------------------------------------ */
/*  Health Ring (SVG)                                                   */
/* ------------------------------------------------------------------ */

function HealthRing({ score, size = 200 }: { score: number; size?: number }) {
  const radius = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  const color = score >= 90 ? '#10b981' : score >= 70 ? '#d97706' : '#dc2626';
  const glowColor = score >= 90 ? 'rgba(16,185,129,0.3)' : score >= 70 ? 'rgba(217,119,6,0.3)' : 'rgba(220,38,38,0.3)';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `0 0 40px 10px ${glowColor}, 0 0 80px 20px ${glowColor}`,
          animation: 'live-ring-pulse 3s ease-in-out infinite',
        }}
      />
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        {/* Background track */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#1a1a1a" strokeWidth="6"
        />
        {/* Score arc */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s ease',
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-5xl font-bold" style={{ color, textShadow: `0 0 20px ${glowColor}` }}>
          {score}
        </span>
        <span className="font-mono text-[10px] text-[#555] mt-1 tracking-[0.2em] uppercase">Health</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline                                                          */
/* ------------------------------------------------------------------ */

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const width = 600;
  const height = 60;
  const padding = 4;
  const min = Math.min(...data) - 2;
  const max = Math.max(...data) + 2;
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M${points.join(' L')}`;
  const areaD = `${pathD} L${width - padding},${height} L${padding},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkFill)" />
      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
      {/* Current point */}
      <circle
        cx={parseFloat(points[points.length - 1]!.split(',')[0]!)}
        cy={parseFloat(points[points.length - 1]!.split(',')[1]!)}
        r="4" fill="#10b981"
        style={{ filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.6))' }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Scan Line (radar sweep)                                            */
/* ------------------------------------------------------------------ */

function ScanLine() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 h-[1px]"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.4) 30%, rgba(16,185,129,0.6) 50%, rgba(16,185,129,0.4) 70%, transparent 100%)',
        animation: 'live-scan-sweep 4s ease-in-out infinite',
        boxShadow: '0 0 12px 2px rgba(16,185,129,0.15)',
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Uptime display                                                     */
/* ------------------------------------------------------------------ */

function formatUptime(startMs: number): string {
  const diff = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ------------------------------------------------------------------ */
/*  Main Live Page                                                     */
/* ------------------------------------------------------------------ */

export default function LivePage() {
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState(100);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [stats, setStats] = useState<LiveStats>({
    filesWatched: 87,
    functionsTracked: 172,
    violationsCaught: 0,
    autoFixes: 0,
    uptimeStart: Date.now(),
  });
  const [healthHistory, setHealthHistory] = useState<number[]>([100]);
  const [uptime, setUptime] = useState('0s');
  const eventCounterRef = useRef(0);
  const eventListRef = useRef<HTMLDivElement>(null);

  // SSE connection
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/events');

      es.addEventListener('connected', () => {
        setConnected(true);
      });

      es.addEventListener('health_update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (typeof data.score === 'number') {
            setHealth(data.score);
            setHealthHistory((prev) => {
              const next = [...prev, data.score];
              return next.length > 20 ? next.slice(-20) : next;
            });
          }
        } catch { /* ignore */ }
      });

      es.addEventListener('scan', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          addRealEvent(data);
        } catch { /* ignore */ }
      });

      es.addEventListener('violation', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          addRealEvent({ ...data, type: 'violation' });
        } catch { /* ignore */ }
      });

      es.addEventListener('verified', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          addRealEvent({ ...data, type: 'verified' });
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        setConnected(false);
        es?.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    function addRealEvent(data: Partial<LiveEvent>) {
      const evt: LiveEvent = {
        id: `real-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: (data.type as LiveEvent['type']) || 'scan',
        timestamp: data.timestamp || new Date().toISOString(),
        file: data.file || 'unknown',
        verdict: data.verdict || 'SCAN',
        details: data.details || '',
      };
      pushEvent(evt);
    }

    connect();
    return () => {
      es?.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  // Demo event generator
  useEffect(() => {
    const interval = setInterval(() => {
      eventCounterRef.current++;
      const evt = generateDemoEvent(eventCounterRef.current);
      pushEvent(evt);
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(interval);
  }, []);

  const pushEvent = useCallback((evt: LiveEvent) => {
    setEvents((prev) => {
      const next = [evt, ...prev];
      return next.length > 50 ? next.slice(0, 50) : next;
    });

    if (evt.type === 'violation') {
      setStats((prev) => ({ ...prev, violationsCaught: prev.violationsCaught + 1 }));
      // Dip health briefly
      setHealth((prev) => Math.max(0, prev - Math.floor(Math.random() * 3 + 1)));
    }
    if (evt.type === 'verified') {
      // Recover health
      setHealth((prev) => Math.min(100, prev + 1));
    }
  }, []);

  // Uptime ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatUptime(stats.uptimeStart));
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.uptimeStart]);

  // Health history tracking
  useEffect(() => {
    const interval = setInterval(() => {
      setHealthHistory((prev) => {
        const next = [...prev, health];
        return next.length > 20 ? next.slice(-20) : next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [health]);

  const timeStr = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--:--:--';
    }
  };

  return (
    <div className="min-h-screen bg-[#060608] text-[#EDEDEA] font-mono relative overflow-hidden">
      {/* ---- Scan line ---- */}
      <ScanLine />

      {/* ---- Background grid ---- */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ---- Top bar ---- */}
      <header className="relative z-20 flex items-center justify-between px-6 md:px-10 py-4 border-b border-[#111]">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-3 h-3">
              <div className="absolute inset-0 rounded-full bg-emerald-500" style={{ animation: 'live-ring-pulse 3s ease-in-out infinite' }} />
              <div className="absolute inset-[2px] rounded-full bg-emerald-400" />
            </div>
            <span className="text-sm font-bold tracking-tight text-[#EDEDEA]">corpus</span>
          </a>
          <div className="h-4 w-px bg-[#222]" />
          <span className="text-xs tracking-[0.15em] uppercase text-[#555]">Live Monitoring</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-xs text-[#555]">
            <a href="/graph" className="hover:text-[#EDEDEA] transition-colors">Graph</a>
            <a href="/demo" className="hover:text-[#EDEDEA] transition-colors">Demo</a>
            <a href="/dashboard" className="hover:text-[#EDEDEA] transition-colors">Dashboard</a>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`}
              style={{ animation: connected ? 'live-ring-pulse 2s ease-in-out infinite' : 'none' }}
            />
            <span className={`text-[10px] uppercase tracking-wider ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {connected ? 'Connected' : 'Reconnecting'}
            </span>
          </div>
        </div>
      </header>

      {/* ---- Main grid ---- */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_1fr] gap-6">

          {/* ---- Left panel: Event feed ---- */}
          <div className="order-2 lg:order-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#555]">Event Feed</h2>
              <span className="text-[10px] text-[#333]">{events.length} events</span>
            </div>
            <div
              ref={eventListRef}
              className="bg-[#0a0a0c] border border-[#151518] rounded-xl overflow-hidden"
              style={{ maxHeight: 480 }}
            >
              <div className="divide-y divide-[#111] overflow-y-auto" style={{ maxHeight: 480 }}>
                {events.length === 0 ? (
                  <div className="px-5 py-12 text-center text-[#333] text-xs">
                    Waiting for events...
                  </div>
                ) : (
                  events.map((evt) => (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#0e0e12] transition-colors"
                      style={{ animation: 'live-event-slide-in 0.3s ease-out' }}
                    >
                      <span className="text-[10px] text-[#333] w-[62px] shrink-0 tabular-nums">
                        {timeStr(evt.timestamp)}
                      </span>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          color: evt.type === 'violation' ? '#dc2626' : '#10b981',
                          background: evt.type === 'violation' ? 'rgba(220,38,38,0.1)' : 'rgba(16,185,129,0.1)',
                        }}
                      >
                        {evt.verdict}
                      </span>
                      <span className="text-[11px] text-[#888] truncate flex-1">{evt.file}</span>
                      {evt.type === 'violation' && (
                        <span className="text-[10px] text-[#444] truncate max-w-[140px]">{evt.details}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ---- Center: Health ring ---- */}
          <div className="order-1 lg:order-2 flex flex-col items-center justify-start pt-4">
            <HealthRing score={health} size={200} />
            <div className="mt-6 text-center">
              <div className="text-[10px] text-[#333] uppercase tracking-[0.2em] mb-1">System Status</div>
              <div className={`text-xs font-bold ${health >= 90 ? 'text-emerald-400' : health >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                {health >= 90 ? 'All Systems Nominal' : health >= 70 ? 'Degraded' : 'Critical'}
              </div>
            </div>
          </div>

          {/* ---- Right panel: Stats ---- */}
          <div className="order-3">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-3">System Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Files Watched" value={stats.filesWatched} color="#EDEDEA" />
              <StatBox label="Functions" value={stats.functionsTracked} color="#EDEDEA" />
              <StatBox
                label="Violations"
                value={stats.violationsCaught}
                color={stats.violationsCaught > 0 ? '#dc2626' : '#10b981'}
                glow={stats.violationsCaught > 0}
              />
              <StatBox label="Auto-fixes" value={stats.autoFixes} color="#10b981" />
              <div className="col-span-2 bg-[#0a0a0c] border border-[#151518] rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-[#888] tabular-nums">{uptime}</div>
                <div className="text-[9px] text-[#333] mt-1 uppercase tracking-[0.2em]">Uptime</div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Bottom: Health trend sparkline ---- */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#555]">Health Trend</h2>
            <span className="text-[10px] text-[#333]">Last {healthHistory.length} samples</span>
          </div>
          <div className="bg-[#0a0a0c] border border-[#151518] rounded-xl p-4">
            <Sparkline data={healthHistory} />
          </div>
        </div>
      </div>

      {/* ---- Inline styles for animations ---- */}
      <style>{`
        @keyframes live-ring-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes live-scan-sweep {
          0% { top: -2px; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes live-event-slide-in {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Box                                                           */
/* ------------------------------------------------------------------ */

function StatBox({
  label,
  value,
  color,
  glow = false,
}: {
  label: string;
  value: number;
  color: string;
  glow?: boolean;
}) {
  return (
    <div className="bg-[#0a0a0c] border border-[#151518] rounded-xl p-4 text-center">
      <div
        className="text-2xl font-bold tabular-nums"
        style={{
          color,
          textShadow: glow ? `0 0 12px ${color}` : 'none',
        }}
      >
        {value}
      </div>
      <div className="text-[9px] text-[#333] mt-1 uppercase tracking-[0.2em]">{label}</div>
    </div>
  );
}
