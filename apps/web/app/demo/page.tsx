'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scenario = SCENARIOS[activeScenario];

  function startDemo() {
    setCurrentStep(-1);
    setCompletedSteps([]);
    setIsRunning(true);
    runStep(0);
  }

  function runStep(stepIdx: number) {
    if (stepIdx >= scenario.steps.length) {
      setIsRunning(false);
      return;
    }
    setCurrentStep(stepIdx);
    timeoutRef.current = setTimeout(() => {
      setCompletedSteps(prev => [...prev, stepIdx]);
      runStep(stepIdx + 1);
    }, scenario.steps[stepIdx].delay);
  }

  function stopDemo() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsRunning(false);
    setCurrentStep(-1);
    setCompletedSteps([]);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const activeStep = currentStep >= 0 ? scenario.steps[currentStep] : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Nav */}
      <nav style={{
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #1f2937',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#fff' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontWeight: 700 }}>corpus</span>
        </Link>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/graph" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 14 }}>Graph</Link>
          <Link href="/dashboard" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 14 }}>Dashboard</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 32px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>
            See the immune system{' '}
            <span style={{
              background: 'linear-gradient(135deg, #10b981, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>in action</span>
          </h1>
          <p style={{ color: '#6b7280', fontSize: 16 }}>
            Watch Corpus catch and auto-fix AI-generated code issues in real-time.
          </p>
        </div>

        {/* Scenario Tabs */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 32,
          justifyContent: 'center',
        }}>
          {SCENARIOS.map((s, i) => (
            <button
              key={i}
              onClick={() => { stopDemo(); setActiveScenario(i); }}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: `1px solid ${i === activeScenario ? '#10b981' : '#374151'}`,
                background: i === activeScenario ? '#10b98115' : '#111827',
                color: i === activeScenario ? '#10b981' : '#9ca3af',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Scenario Description */}
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
          {scenario.description}
        </p>

        {/* Start Button */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <button
            onClick={isRunning ? stopDemo : startDemo}
            style={{
              padding: '12px 32px',
              borderRadius: 8,
              border: 'none',
              background: isRunning ? '#ef4444' : 'linear-gradient(135deg, #10b981, #6366f1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 700,
              transition: 'all 0.3s',
            }}
          >
            {isRunning ? 'Stop Demo' : 'Run Demo'}
          </button>
        </div>

        {/* Demo Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {scenario.steps.map((step, i) => {
            const isActive = currentStep === i;
            const isComplete = completedSteps.includes(i);
            const isVisible = isActive || isComplete || currentStep === -1;

            return (
              <div
                key={i}
                style={{
                  opacity: isVisible ? 1 : 0.3,
                  transform: isActive ? 'scale(1.02)' : 'scale(1)',
                  transition: 'all 0.5s ease',
                }}
              >
                <div style={{
                  background: '#111827',
                  borderRadius: 12,
                  border: `1px solid ${
                    step.type === 'violation' ? (isActive || isComplete ? '#ef4444' : '#374151')
                    : step.type === 'verified' ? (isActive || isComplete ? '#10b981' : '#374151')
                    : isActive ? '#6366f1' : '#374151'
                  }`,
                  padding: 24,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Active indicator */}
                  {isActive && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: step.type === 'violation' ? '#ef4444' : step.type === 'verified' ? '#10b981' : '#6366f1',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* Step icon */}
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      flexShrink: 0,
                      background:
                        step.type === 'ai-writes' ? '#6366f120' :
                        step.type === 'corpus-checks' ? '#8b5cf620' :
                        step.type === 'violation' ? '#ef444420' :
                        step.type === 'ai-fixes' ? '#f59e0b20' :
                        '#10b98120',
                    }}>
                      {step.type === 'ai-writes' ? '🤖' :
                       step.type === 'corpus-checks' ? '🔍' :
                       step.type === 'violation' ? '🛑' :
                       step.type === 'ai-fixes' ? '🔧' :
                       '✅'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        <h3 style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: step.type === 'violation' ? '#ef4444'
                               : step.type === 'verified' ? '#10b981'
                               : '#fff',
                          margin: 0,
                        }}>
                          {step.title}
                        </h3>
                        {isActive && (
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#6366f1',
                            animation: 'pulse 1s ease-in-out infinite',
                          }} />
                        )}
                        {isComplete && (
                          <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>done</span>
                        )}
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
                        {step.description}
                      </p>

                      {/* Code block */}
                      {step.code && (isActive || isComplete) && (
                        <pre style={{
                          marginTop: 12,
                          padding: 16,
                          background: '#0a0a0a',
                          borderRadius: 8,
                          border: '1px solid #1f2937',
                          fontSize: 13,
                          lineHeight: 1.6,
                          overflow: 'auto',
                          color: '#e5e7eb',
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        }}>
                          {step.code}
                        </pre>
                      )}

                      {/* Violation detail */}
                      {step.violation && (isActive || isComplete) && (
                        <div style={{
                          marginTop: 12,
                          padding: 16,
                          background: '#ef444410',
                          borderRadius: 8,
                          border: '1px solid #ef444430',
                        }}>
                          <p style={{ color: '#fca5a5', fontSize: 13, margin: '0 0 8px 0', fontFamily: 'monospace' }}>
                            {step.violation}
                          </p>
                          {step.fix && (
                            <p style={{ color: '#10b981', fontSize: 13, margin: 0, fontFamily: 'monospace' }}>
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
        <div style={{ textAlign: 'center', marginTop: 48, color: '#6b7280' }}>
          <p style={{ fontSize: 14 }}>
            The human never entered the loop. Corpus caught it, told the AI to fix it, verified the fix.
          </p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 8 }}>
            No more AI slop.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
