'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ── Syntax Highlighter ───────────────────────────────────────────────────────

function highlightCode(code: string): string {
  const keywords = ['export', 'async', 'function', 'const', 'await', 'return', 'if', 'new', 'import', 'from', 'throw', 'style', 'let', 'var', 'class', 'extends', 'implements'];
  const types = ['string', 'number', 'boolean', 'Date', 'Promise', 'Record', 'Intl', 'Stripe'];

  return code
    .split('\n')
    .map((line) => {
      // Comments
      if (line.trimStart().startsWith('//')) {
        return `<span class="syntax-comment">${escapeHtml(line)}</span>`;
      }

      let result = escapeHtml(line);

      // Strings (single and double quotes, template literals)
      result = result.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;|`[^`]*?`)/g, '<span class="syntax-string">$1</span>');

      // Keywords
      for (const kw of keywords) {
        result = result.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span class="syntax-keyword">$1</span>');
      }

      // Types
      for (const t of types) {
        result = result.replace(new RegExp(`\\b(${t})\\b`, 'g'), '<span class="syntax-type">$1</span>');
      }

      // Function calls
      result = result.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="syntax-function">$1</span>(');

      // Numbers
      result = result.replace(/\b(\d+)\b/g, '<span class="syntax-number">$1</span>');

      // Operators
      result = result.replace(/(===|!==|=>|&amp;&amp;|\|\||!(?!=))/g, '<span class="syntax-operator">$1</span>');

      return result;
    })
    .join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Demo Scenarios ───────────────────────────────────────────────────────────

interface DemoStep {
  type: 'ai-writes' | 'corpus-checks' | 'violation' | 'ai-fixes' | 'verified';
  title: string;
  description: string;
  code?: string;
  verdict?: 'VERIFIED' | 'VIOLATES';
  violation?: string;
  fix?: string;
  delay: number;
}

const SCENARIOS: { name: string; description: string; steps: DemoStep[] }[] = [
  {
    name: 'Auth Bypass',
    description: 'Claude removes a critical guard clause while refactoring',
    steps: [
      {
        type: 'ai-writes',
        title: 'Claude writes code',
        description: 'Refactoring auth middleware to add rate limiting...',
        code: `export async function authenticate(req) {
  // Rate limiting added
  const rateOk = await checkRateLimit(req.ip);
  if (!rateOk) return res.status(429);

  const user = await db.findUser(req.userId);
  return { user, authenticated: true };
}`,
        delay: 2000,
      },
      {
        type: 'corpus-checks',
        title: 'Corpus intercepts',
        description: 'Diffing against behavioral graph...',
        delay: 1500,
      },
      {
        type: 'violation',
        title: 'VIOLATES',
        description: 'Guard clause removed',
        verdict: 'VIOLATES',
        violation: 'Guard clause REMOVED: Function \'authenticate\' had guard \'if (!req.token) throw UnauthorizedError\' that was removed. This introduces an authentication bypass -- any request without a token will be treated as authenticated.',
        fix: 'Restore the token validation guard before the user lookup.',
        delay: 3000,
      },
      {
        type: 'ai-fixes',
        title: 'Claude auto-fixes',
        description: 'Regenerating with guard clause restored...',
        code: `export async function authenticate(req) {
  // Guard clause (required by Corpus contract)
  if (!req.token) throw new UnauthorizedError();

  // Rate limiting added
  const rateOk = await checkRateLimit(req.ip);
  if (!rateOk) return res.status(429);

  const token = verifyJWT(req.token);
  if (!token) throw new UnauthorizedError();

  const user = await db.findUser(token.userId);
  return { user, authenticated: true };
}`,
        delay: 2000,
      },
      {
        type: 'verified',
        title: 'VERIFIED',
        description: 'All contracts satisfied. Code is safe.',
        verdict: 'VERIFIED',
        delay: 1000,
      },
    ],
  },
  {
    name: 'Secret Leak',
    description: 'AI hardcodes an API key while fixing a bug',
    steps: [
      {
        type: 'ai-writes',
        title: 'Claude writes code',
        description: 'Fixing Stripe webhook handler...',
        code: `import Stripe from 'stripe';

const stripe = new Stripe(
  'sk_live_FAKE_DEMO_KEY_NOT_REAL',
  { apiVersion: '2024-04-10' }
);

export async function handleWebhook(req) {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body, sig, 'whsec_abc123xyz'
  );
  // process event...
}`,
        delay: 2000,
      },
      {
        type: 'corpus-checks',
        title: 'Corpus intercepts',
        description: 'Scanning for secrets and contract violations...',
        delay: 1000,
      },
      {
        type: 'violation',
        title: 'VIOLATES',
        description: '2 critical issues found',
        verdict: 'VIOLATES',
        violation: 'CRITICAL: Stripe live key \'sk_live_51N8xK2...\' hardcoded in source. CRITICAL: Webhook signing secret \'whsec_abc123xyz\' hardcoded. These will be committed to git and exposed.',
        fix: 'Use environment variables: process.env.STRIPE_SECRET_KEY and process.env.STRIPE_WEBHOOK_SECRET',
        delay: 3000,
      },
      {
        type: 'ai-fixes',
        title: 'Claude auto-fixes',
        description: 'Moving secrets to environment variables...',
        code: `import Stripe from 'stripe';

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  { apiVersion: '2024-04-10' }
);

export async function handleWebhook(req) {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!
  );
  // process event...
}`,
        delay: 2000,
      },
      {
        type: 'verified',
        title: 'VERIFIED',
        description: 'All contracts satisfied. Secrets secured.',
        verdict: 'VERIFIED',
        delay: 1000,
      },
    ],
  },
  {
    name: 'Export Removal',
    description: 'AI deletes an exported function used by 3 modules',
    steps: [
      {
        type: 'ai-writes',
        title: 'Claude writes code',
        description: 'Cleaning up utils file...',
        code: `// Claude "cleaned up" the file and removed
// formatCurrency, thinking it was unused

export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

// formatCurrency was here but Claude removed it
// "to reduce code complexity"`,
        delay: 2000,
      },
      {
        type: 'corpus-checks',
        title: 'Corpus intercepts',
        description: 'Checking export surface against graph...',
        delay: 1500,
      },
      {
        type: 'violation',
        title: 'VIOLATES',
        description: 'Exported function removed',
        verdict: 'VIOLATES',
        violation: 'REMOVED: Exported function \'formatCurrency\' was removed from utils.ts. This function is imported by: cart.tsx, checkout.tsx, invoice.tsx. Removing it will break 3 modules.',
        fix: 'Restore formatCurrency(amount: number, currency: string): string',
        delay: 3000,
      },
      {
        type: 'ai-fixes',
        title: 'Claude auto-fixes',
        description: 'Restoring removed export...',
        code: `export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatCurrency(
  amount: number,
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}`,
        delay: 2000,
      },
      {
        type: 'verified',
        title: 'VERIFIED',
        description: 'All exports preserved. Safe to write.',
        verdict: 'VERIFIED',
        delay: 1000,
      },
    ],
  },
];

// ── Demo Runner ──────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [screenFlash, setScreenFlash] = useState<'red' | 'green' | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenario = SCENARIOS[activeScenario]!;

  function startDemo() {
    setCurrentStep(-1);
    setCompletedSteps([]);
    setScreenFlash(null);
    setIsRunning(true);
    runStep(0);
  }

  function runStep(stepIdx: number) {
    if (stepIdx >= scenario.steps.length) {
      setIsRunning(false);
      return;
    }
    setCurrentStep(stepIdx);

    const step = scenario.steps[stepIdx]!;
    // Trigger screen flash for violations and verifications
    if (step.type === 'violation') {
      setTimeout(() => setScreenFlash('red'), 100);
      setTimeout(() => setScreenFlash(null), 600);
    }
    if (step.type === 'verified') {
      setTimeout(() => setScreenFlash('green'), 100);
      setTimeout(() => setScreenFlash(null), 600);
    }

    timeoutRef.current = setTimeout(() => {
      setCompletedSteps(prev => [...prev, stepIdx]);
      runStep(stepIdx + 1);
    }, step.delay);
  }

  function stopDemo() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsRunning(false);
    setCurrentStep(-1);
    setCompletedSteps([]);
    setScreenFlash(null);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const activeStep = currentStep >= 0 ? scenario.steps[currentStep] : null;

  // Calculate progress
  const totalSteps = scenario.steps.length;
  const completedCount = completedSteps.length;
  const progressPercent = isRunning
    ? Math.round(((completedCount + (currentStep >= 0 ? 0.5 : 0)) / totalSteps) * 100)
    : completedCount === totalSteps && completedCount > 0
      ? 100
      : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'JetBrains Mono', ui-monospace, monospace", position: 'relative', overflow: 'hidden' }}>
      {/* Screen flash overlay */}
      {screenFlash === 'red' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
          background: 'radial-gradient(circle at center, rgba(239,68,68,0.15) 0%, transparent 70%)',
          animation: 'screen-flash-red 0.5s ease-out both',
        }} />
      )}
      {screenFlash === 'green' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
          background: 'radial-gradient(circle at center, rgba(16,185,129,0.15) 0%, transparent 70%)',
          animation: 'screen-flash-green 0.5s ease-out both',
        }} />
      )}

      {/* Nav */}
      <nav style={{
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#fff' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>corpus</span>
        </Link>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/graph" style={{ color: '#555', textDecoration: 'none', fontSize: 13, transition: 'color 0.2s' }}>Graph</Link>
          <Link href="/dashboard" style={{ color: '#555', textDecoration: 'none', fontSize: 13, transition: 'color 0.2s' }}>Dashboard</Link>
          <Link href="/demo" style={{ color: '#10b981', textDecoration: 'none', fontSize: 13 }}>Demo</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 16px', borderRadius: 100,
              border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)',
              color: '#818cf8', fontSize: 11, letterSpacing: '0.05em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', animation: 'glow-pulse 2s ease-in-out infinite' }} />
              INTERACTIVE DEMO
            </span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.03em' }}>
            See the immune system{' '}
            <span style={{
              background: 'linear-gradient(135deg, #10b981, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>in action</span>
          </h1>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6 }}>
            Watch Corpus catch and auto-fix AI-generated code issues in real-time.
          </p>
        </div>

        {/* Scenario Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          {SCENARIOS.map((s, i) => (
            <button
              key={i}
              onClick={() => { stopDemo(); setActiveScenario(i); }}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: `1px solid ${i === activeScenario ? '#10b981' : '#1a1a1a'}`,
                background: i === activeScenario ? 'rgba(16,185,129,0.08)' : '#0a0a0a',
                color: i === activeScenario ? '#10b981' : '#555',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Scenario Description */}
        <p style={{ textAlign: 'center', color: '#555', marginBottom: 20, fontSize: 13 }}>
          {scenario.description}
        </p>

        {/* Start Button */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <button
            onClick={isRunning ? stopDemo : startDemo}
            style={{
              padding: '10px 32px',
              borderRadius: 8,
              border: 'none',
              background: isRunning
                ? '#ef4444'
                : 'linear-gradient(135deg, #10b981, #6366f1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              transition: 'all 0.3s',
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
            }}
          >
            {isRunning ? 'Stop Demo' : 'Run Demo'}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="demo-progress-bar">
          <div
            className="demo-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Demo Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scenario.steps.map((step, i) => {
            const isActive = currentStep === i;
            const isComplete = completedSteps.includes(i);
            const isVisible = isActive || isComplete || currentStep === -1;
            const isViolation = step.type === 'violation';
            const isVerified = step.type === 'verified';

            const shakeClass = isViolation && isActive ? ' demo-shake' : '';
            const flashClass = isViolation && isActive ? ' demo-flash-red' : '';
            const burstClass = isVerified && (isActive || isComplete) ? ' demo-green-burst' : '';

            return (
              <div
                key={i}
                style={{
                  opacity: isVisible ? 1 : 0.2,
                  transform: isActive ? 'scale(1.01)' : 'scale(1)',
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div
                  className={shakeClass + burstClass}
                  style={{
                    background: '#0a0a0a',
                    borderRadius: 12,
                    border: `1px solid ${
                      isViolation ? (isActive || isComplete ? '#ef4444' : '#1a1a1a')
                      : isVerified ? (isActive || isComplete ? '#10b981' : '#1a1a1a')
                      : isActive ? '#6366f1' : '#1a1a1a'
                    }`,
                    padding: 20,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'border-color 0.3s ease',
                  }}
                >
                  {/* Active progress line */}
                  {isActive && (
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, height: 2,
                      background: isViolation ? '#ef4444' : isVerified ? '#10b981' : '#6366f1',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Step icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, flexShrink: 0,
                      background:
                        step.type === 'ai-writes' ? 'rgba(99,102,241,0.1)' :
                        step.type === 'corpus-checks' ? 'rgba(139,92,246,0.1)' :
                        step.type === 'violation' ? 'rgba(239,68,68,0.1)' :
                        step.type === 'ai-fixes' ? 'rgba(245,158,11,0.1)' :
                        'rgba(16,185,129,0.1)',
                      border: `1px solid ${
                        step.type === 'ai-writes' ? 'rgba(99,102,241,0.2)' :
                        step.type === 'corpus-checks' ? 'rgba(139,92,246,0.2)' :
                        step.type === 'violation' ? 'rgba(239,68,68,0.2)' :
                        step.type === 'ai-fixes' ? 'rgba(245,158,11,0.2)' :
                        'rgba(16,185,129,0.2)'
                      }`,
                    }}>
                      {step.type === 'ai-writes' && <span style={{ color: '#6366f1', fontSize: 14, fontWeight: 700 }}>AI</span>}
                      {step.type === 'corpus-checks' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>}
                      {step.type === 'violation' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                      {step.type === 'ai-fixes' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
                      {step.type === 'verified' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h3 style={{
                          fontSize: 14, fontWeight: 700, margin: 0,
                          color: isViolation ? '#ef4444'
                               : isVerified ? '#10b981'
                               : '#EDEDEA',
                        }}>
                          {step.title}
                        </h3>
                        {isActive && (
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: isViolation ? '#ef4444' : isVerified ? '#10b981' : '#6366f1',
                            animation: 'pulse 1s ease-in-out infinite',
                          }} />
                        )}
                        {isComplete && (
                          <span style={{ color: '#555', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>done</span>
                        )}
                      </div>
                      <p style={{ color: '#555', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                        {step.description}
                      </p>

                      {/* Syntax-highlighted code block */}
                      {step.code && (isActive || isComplete) && (
                        <pre
                          className={flashClass}
                          style={{
                            marginTop: 12,
                            padding: 16,
                            background: '#050505',
                            borderRadius: 8,
                            border: '1px solid #1a1a1a',
                            fontSize: 12,
                            lineHeight: 1.7,
                            overflow: 'auto',
                            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          }}
                          dangerouslySetInnerHTML={{ __html: highlightCode(step.code) }}
                        />
                      )}

                      {/* Violation detail with shake */}
                      {step.violation && (isActive || isComplete) && (
                        <div
                          className={isActive ? 'demo-shake' : ''}
                          style={{
                            marginTop: 12,
                            padding: 16,
                            background: 'rgba(239,68,68,0.04)',
                            borderRadius: 8,
                            border: '1px solid rgba(239,68,68,0.15)',
                          }}
                        >
                          <p style={{ color: '#fca5a5', fontSize: 12, margin: '0 0 8px 0', lineHeight: 1.6 }}>
                            {step.violation}
                          </p>
                          {step.fix && (
                            <p style={{ color: '#10b981', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                              FIX: {step.fix}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom message */}
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <p style={{ color: '#555', fontSize: 13, lineHeight: 1.6 }}>
            The human never entered the loop. Corpus caught it, told the AI to fix it, verified the fix.
          </p>
          <p style={{ fontSize: 18, fontWeight: 800, marginTop: 8, letterSpacing: '-0.03em' }}>
            <span style={{
              background: 'linear-gradient(135deg, #10b981, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>No more AI slop.</span>
          </p>
        </div>

        {/* Social proof footer */}
        <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 24, borderTop: '1px solid #1a1a1a' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 11, color: '#333' }}>
            <span>Built at JacHacks 2026</span>
            <span>|</span>
            <span>Powered by Jac</span>
            <span>|</span>
            <span>Backed by Backboard.io</span>
            <span>|</span>
            <span>Built on InsForge</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
