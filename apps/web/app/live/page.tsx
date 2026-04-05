'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { NavBar } from '../../components/NavBar';

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
  fix?: string;
}

interface LiveStats {
  filesWatched: number;
  functionsTracked: number;
  violationsCaught: number;
  patternsLearned: number;
  recurringIssues: number;
  uptimeStart: number;
}

/* ------------------------------------------------------------------ */
/*  Simulated activity (demo mode)                                     */
/* ------------------------------------------------------------------ */

const DEMO_FILES = [
  'src/auth/middleware.ts',
  'src/auth/login.ts',
  'src/auth/session.ts',
  'src/api/users.ts',
  'src/api/routes.ts',
  'src/api/webhooks.ts',
  'src/db/schema.ts',
  'src/db/queries.ts',
  'src/db/migrations.ts',
  'src/services/billing.ts',
  'src/services/notifications.ts',
  'src/services/search.ts',
  'src/middleware/rateLimit.ts',
  'src/middleware/cors.ts',
  'src/middleware/auth.ts',
  'src/utils/validate.ts',
  'src/utils/format.ts',
  'src/utils/crypto.ts',
  'lib/utils.ts',
  'lib/constants.ts',
  'src/core/engine.ts',
  'src/core/scheduler.ts',
  'src/hooks/useSession.ts',
  'src/hooks/useAuth.ts',
  'src/graph/traverse.ts',
  'src/graph/resolve.ts',
  'src/policies/evaluate.ts',
  'src/policies/rules.ts',
  'src/config/env.ts',
  'src/workers/scan.ts',
  'src/workers/index.ts',
];

const VIOLATION_EVENTS: { file: string; detail: string; fix: string }[] = [
  { file: 'src/adapter/aws-lambda/handler.ts', detail: 'Authentication disabled in handler', fix: 'Re-enable auth middleware before deployment' },
  { file: 'drizzle-kit/src/api.ts', detail: 'Hardcoded IP 0.0.0.0 may expose in production', fix: 'Bind to 127.0.0.1 or use env variable for host' },
  { file: 'examples/bun/src/client.ts', detail: 'URL with credentials hardcoded', fix: 'Move credentials to environment variables' },
  { file: 'src/middleware/cors.ts', detail: 'CORS origin set to wildcard *', fix: 'Restrict allowed origins to known domains' },
  { file: 'src/db/migrations.ts', detail: 'SQL query built with string concatenation', fix: 'Use parameterized query instead' },
  { file: 'src/auth/session.ts', detail: 'Session token not rotated after privilege escalation', fix: 'Regenerate session ID on role change' },
  { file: 'src/api/webhooks.ts', detail: 'Webhook signature verification skipped', fix: 'Validate HMAC signature before processing payload' },
  { file: 'src/config/env.ts', detail: 'Hardcoded credential detected in source', fix: 'Move secret to environment variable' },
  { file: 'src/services/billing.ts', detail: 'Missing null check on payment amount', fix: 'Add validation before processing charge' },
  { file: 'src/auth/middleware.ts', detail: 'Authentication bypass: early return added', fix: 'Remove unconditional return before auth check' },
];

const VERIFIED_DETAILS = [
  'All contracts satisfied',
  'No policy violations',
  'Type safety confirmed',
  'Input validation intact',
  'Access control verified',
  'Dependencies clean',
];

let _fileIndex = 0;
function getNextFile(): string {
  const file = DEMO_FILES[_fileIndex % DEMO_FILES.length]!;
  _fileIndex++;
  return file;
}

function generateDemoEvent(counter: number): LiveEvent {
  const isViolation = Math.random() < 0.20;
  if (isViolation) {
    const v = VIOLATION_EVENTS[Math.floor(Math.random() * VIOLATION_EVENTS.length)]!;
    return {
      id: `demo-${counter}-${Date.now()}`,
      type: 'violation',
      timestamp: new Date().toISOString(),
      file: v.file,
      verdict: 'VIOLATION',
      details: v.detail,
      fix: v.fix,
    };
  }
  const file = getNextFile();
  const detail = VERIFIED_DETAILS[Math.floor(Math.random() * VERIFIED_DETAILS.length)]!;
  return {
    id: `demo-${counter}-${Date.now()}`,
    type: 'verified',
    timestamp: new Date().toISOString(),
    file,
    verdict: 'VERIFIED',
    details: detail,
  };
}

/* ------------------------------------------------------------------ */
/*  Inline Sparkline (tiny, next to the health number)                 */
/* ------------------------------------------------------------------ */

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const w = 80;
  const h = 24;
  const min = Math.min(...data) - 1;
  const max = Math.max(...data) + 1;
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((val - min) / range) * h;
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block ml-3 align-middle">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#374151"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={parseFloat(points[points.length - 1]!.split(',')[0]!)}
        cy={parseFloat(points[points.length - 1]!.split(',')[1]!)}
        r="2"
        fill="#6b7280"
      />
    </svg>
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
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/* ------------------------------------------------------------------ */
/*  Main Live Page                                                     */
/* ------------------------------------------------------------------ */

export default function LivePage() {
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState(100);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [stats, setStats] = useState<LiveStats>({
    filesWatched: 96,
    functionsTracked: 247,
    violationsCaught: 0,
    patternsLearned: 0,
    recurringIssues: 0,
    uptimeStart: Date.now(),
  });
  const [healthHistory, setHealthHistory] = useState<number[]>([100]);
  const [uptime, setUptime] = useState('00:00');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const eventCounterRef = useRef(0);

  /* SSE connection */
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/events');

      es.addEventListener('connected', () => setConnected(true));

      es.addEventListener('health_update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (typeof data.score === 'number') {
            setHealth(data.score);
            setHealthHistory((prev) => {
              const next = [...prev, data.score];
              return next.length > 30 ? next.slice(-30) : next;
            });
          }
        } catch { /* ignore */ }
      });

      const handleEvent = (e: MessageEvent, type?: string) => {
        try {
          const data = JSON.parse(e.data);
          addRealEvent({ ...data, ...(type ? { type } : {}) });
        } catch { /* ignore */ }
      };

      es.addEventListener('scan', (e: MessageEvent) => handleEvent(e));
      es.addEventListener('violation', (e: MessageEvent) => handleEvent(e, 'violation'));
      es.addEventListener('verified', (e: MessageEvent) => handleEvent(e, 'verified'));

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
        fix: data.fix,
      };
      pushEvent(evt);
    }

    connect();
    return () => {
      es?.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  /* Demo event generator */
  useEffect(() => {
    const tick = () => {
      eventCounterRef.current++;
      const evt = generateDemoEvent(eventCounterRef.current);
      pushEvent(evt);
    };
    const interval = setInterval(tick, 2800 + Math.random() * 2400);
    return () => clearInterval(interval);
  }, []);

  const pushEvent = useCallback((evt: LiveEvent) => {
    setEvents((prev) => {
      const next = [evt, ...prev];
      return next.length > 50 ? next.slice(0, 50) : next;
    });

    if (evt.type === 'violation') {
      setStats((prev) => ({
        ...prev,
        violationsCaught: prev.violationsCaught + 1,
        recurringIssues: prev.recurringIssues + (Math.random() < 0.4 ? 1 : 0),
      }));
      setHealth((prev) => Math.max(0, prev - Math.floor(Math.random() * 3 + 1)));
    }
    if (evt.type === 'verified') {
      setHealth((prev) => Math.min(100, prev + 1));
      if (Math.random() < 0.3) {
        setStats((prev) => ({ ...prev, patternsLearned: prev.patternsLearned + 1 }));
      }
    }
  }, []);

  /* Uptime ticker */
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatUptime(stats.uptimeStart));
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.uptimeStart]);

  /* Health history */
  useEffect(() => {
    const interval = setInterval(() => {
      setHealthHistory((prev) => {
        const next = [...prev, health];
        return next.length > 30 ? next.slice(-30) : next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [health]);

  const timeStr = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  const healthColor = health >= 90 ? '#10b981' : health >= 70 ? '#d97706' : '#ef4444';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#050505',
        color: '#e5e7eb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ---- Top nav ---- */}
      <NavBar />

      {/* ---- Main content ---- */}
      <div
        style={{
          flex: 1,
          maxWidth: 1120,
          width: '100%',
          margin: '0 auto',
          padding: '24px 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          overflow: 'hidden',
        }}
      >
        {/* ---- Top stat cards ---- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {/* Health */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}>HEALTH</div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: healthColor,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                }}
              >
                {health}
              </span>
              <MiniSparkline data={healthHistory} />
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
              {health >= 90 ? 'nominal' : health >= 70 ? 'degraded' : 'critical'}
            </div>
          </div>

          {/* Files */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}>FILES</div>
            <div style={cardValueStyle}>{stats.filesWatched}</div>
            <div style={cardSubStyle}>watched</div>
          </div>

          {/* Functions */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}>FUNCTIONS</div>
            <div style={cardValueStyle}>{stats.functionsTracked}</div>
            <div style={cardSubStyle}>tracked</div>
          </div>
        </div>

        {/* ---- Benchmark summary ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 0',
            fontSize: 12,
            color: '#6b7280',
            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
            letterSpacing: '0.01em',
          }}
        >
          <span>Scanned <strong style={{ color: '#9ca3af' }}>7</strong> repos</span>
          <span style={{ color: '#374151' }}>|</span>
          <span><strong style={{ color: '#9ca3af' }}>16K</strong> files</span>
          <span style={{ color: '#374151' }}>|</span>
          <span><strong style={{ color: '#9ca3af' }}>52K</strong> nodes</span>
          <span style={{ color: '#374151' }}>|</span>
          <span><strong style={{ color: stats.violationsCaught > 0 ? '#ef4444' : '#9ca3af' }}>{stats.violationsCaught + 105}</strong> issues found</span>
        </div>

        {/* ---- Activity feed ---- */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={sectionLabelStyle}>ACTIVITY</span>
            <span style={{ fontSize: 11, color: '#374151' }}>{uptime} uptime</span>
          </div>

          <div
            style={{
              flex: 1,
              border: '1px solid #1f2937',
              borderRadius: 8,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0,
              }}
            >
              {events.length === 0 ? (
                <div
                  style={{
                    padding: '48px 0',
                    textAlign: 'center',
                    fontSize: 13,
                    color: '#374151',
                  }}
                >
                  Waiting for events...
                </div>
              ) : (
                events.map((evt) => {
                  const isViolation = evt.type === 'violation';
                  const isExpanded = expandedEvent === evt.id;
                  return (
                    <div
                      key={evt.id}
                      style={{
                        borderBottom: '1px solid #111827',
                        cursor: isViolation ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (isViolation) {
                          setExpandedEvent(isExpanded ? null : evt.id);
                        }
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 16px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: '#374151',
                            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                            fontVariantNumeric: 'tabular-nums',
                            width: 42,
                            flexShrink: 0,
                          }}
                        >
                          {timeStr(evt.timestamp)}
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: isViolation ? '#ef4444' : '#10b981',
                            backgroundColor: isViolation
                              ? 'rgba(239,68,68,0.08)'
                              : 'rgba(16,185,129,0.08)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            flexShrink: 0,
                            letterSpacing: '0.03em',
                          }}
                        >
                          {isViolation ? 'VIOLATION' : 'VERIFIED'}
                        </span>

                        <span
                          style={{
                            fontSize: 13,
                            color: '#9ca3af',
                            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {evt.file}
                        </span>
                      </div>

                      {/* Expanded violation detail */}
                      {isViolation && isExpanded && (
                        <div style={{ padding: '0 16px 10px 70px' }}>
                          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                            <span style={{ color: '#374151', marginRight: 6 }}>--</span>
                            {evt.details}
                          </div>
                          {evt.fix && (
                            <div style={{ fontSize: 12, color: '#10b981' }}>
                              <span style={{ color: '#374151', marginRight: 6 }}>--</span>
                              FIX: {evt.fix}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline violation hint (when not expanded) */}
                      {isViolation && !isExpanded && (
                        <div style={{ padding: '0 16px 6px 70px' }}>
                          <span style={{ fontSize: 11, color: '#4b5563' }}>
                            {evt.details}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ---- Bottom row ---- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Violations */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}>VIOLATIONS</div>
            <div
              style={{
                ...cardValueStyle,
                color: stats.violationsCaught > 0 ? '#ef4444' : '#10b981',
              }}
            >
              {stats.violationsCaught}
            </div>
            <div style={cardSubStyle}>
              {stats.violationsCaught === 0
                ? 'No violations found'
                : `${stats.violationsCaught} caught`}
            </div>
          </div>

          {/* Immune Memory */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}>IMMUNE MEMORY</div>
            <div style={cardValueStyle}>{stats.patternsLearned}</div>
            <div style={cardSubStyle}>
              {stats.patternsLearned} patterns learned &middot; {stats.recurringIssues} recurring
            </div>
          </div>
        </div>

        {/* ---- Footer ---- */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: '#374151',
            padding: '4px 0 0',
            flexShrink: 0,
          }}
        >
          Built at JacHacks 2026 &mdash; Jac &mdash; Backboard
        </div>
      </div>

      {/* ---- Minimal animations ---- */}
      <style>{`
        * { box-sizing: border-box; }
        a:hover { color: #e5e7eb !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const cardStyle: React.CSSProperties = {
  border: '1px solid #1f2937',
  borderRadius: 8,
  padding: '16px 20px',
  backgroundColor: '#050505',
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: '#6b7280',
  letterSpacing: '0.06em',
  marginBottom: 8,
};

const cardValueStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
  color: '#e5e7eb',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.02em',
};

const cardSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#374151',
  marginTop: 4,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: '#6b7280',
  letterSpacing: '0.06em',
};
