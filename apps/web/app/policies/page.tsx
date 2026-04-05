'use client';

import { useState } from 'react';
import { NavBar } from '../../components/NavBar';

/* ------------------------------------------------------------------ */
/*  Walker data — pulled from policies/builtin/*.jac                  */
/* ------------------------------------------------------------------ */

interface Walker {
  id: string;
  name: string;
  file: string;
  icon: string;
  color: 'emerald' | 'indigo' | 'amber' | 'red';
  tagline: string;
  description: string;
  snippet: string;
}

const WALKERS: Walker[] = [
  {
    id: 'action-safety',
    name: 'Action Safety',
    file: 'action_safety.jac',
    icon: '\u26A1',
    color: 'red',
    tagline: 'Blocks destructive actions universally',
    description:
      'Hard-coded safety rules that apply universally. Blocks dangerous operations like delete_all, drop_table, transfer_funds. These cannot be disabled or overridden by developer config.',
    snippet: `walker CheckActionSafety {
    has action_type: str;
    has user_approved: bool = False;

    can check with entry {
        action_lower = self.action_type.lower().strip();
        for prefix in ALWAYS_BLOCK_PREFIXES {
            if action_lower.startswith(prefix) {
                report block_result(
                    "action_safety",
                    BlockReason.DESTRUCTIVE_ACTION,
                    f"'{self.action_type}' is destructive."
                );
                disengage;
            }
        }
        report pass_result("action_safety");
    }
}`,
  },
  {
    id: 'scope-guard',
    name: 'Scope Guard',
    file: 'scope_guard.jac',
    icon: '\uD83D\uDEE1\uFE0F',
    color: 'emerald',
    tagline: 'Enforces action scope boundaries',
    description:
      'Checks whether a proposed action falls within the developer\'s declared agent scope. If no allowed_actions are declared, this walker passes everything. Out-of-scope actions require user confirmation.',
    snippet: `walker CheckScope {
    has action_type: str;
    has allowed_actions: list[str] = [];

    can check with entry {
        if not self.allowed_actions {
            report pass_result("scope_guard");
            disengage;
        }
        action_lower = self.action_type.lower().strip();
        for allowed in self.allowed_actions {
            if action_lower.startswith(allowed.lower()) {
                report pass_result("scope_guard");
                disengage;
            }
        }
        report confirm_result("scope_guard",
            f"'{self.action_type}' is outside scope.");
    }
}`,
  },
  {
    id: 'rate-guard',
    name: 'Rate Guard',
    file: 'rate_guard.jac',
    icon: '\u23F1\uFE0F',
    color: 'amber',
    tagline: 'Rate limiting for AI actions',
    description:
      'Limits how often specific action types can occur within a time window. Uses Jac graph nodes to maintain per-action-type counters. This is stateful -- it requires Jac\'s graph model to implement cleanly.',
    snippet: `node ActionCounter {
    has action_type: str;
    has count: int = 0;
    has window_start_epoch: int = 0;
    has limit: int = 10;
    has window_seconds: int = 60;
}

walker CheckRateLimit {
    has action_type: str;
    has limit: int = 10;

    can check with entry {
        counters = [root-->][?:ActionCounter];
        matching = [c for c in counters
            if c.action_type == self.action_type];
        // ... check window, increment counter
    }
}`,
  },
  {
    id: 'confidence-calibrator',
    name: 'Confidence Calibrator',
    file: 'confidence_calibrator.jac',
    icon: '\uD83C\uDFAF',
    color: 'indigo',
    tagline: 'Detects AI overconfidence & underconfidence',
    description:
      'Analyzes action logs to detect classifier overconfidence/underconfidence per intent category and recommends threshold adjustments. Catches the case where an AI is 95% confident but users keep cancelling.',
    snippet: `walker AuditCalibration {
    has action_log: list[dict] = [];
    has min_sample_size: int = 20;

    can audit with entry {
        // Group by intent category
        for intent, entries in categories.items() {
            overconfident = [e for e in entries
                if e["confidence"] > 0.72
                and e["user_decision"] == "CANCELLED"];
            // Recommend threshold adjustments
        }
    }
}`,
  },
  {
    id: 'injection-firewall',
    name: 'Injection Firewall',
    file: 'injection_firewall.jac',
    icon: '\uD83D\uDD25',
    color: 'red',
    tagline: 'Blocks prompt injection attacks',
    description:
      'Scans external content for injection patterns before it touches LLM context. Detects instruction overrides ("ignore previous"), role escalation ("you are root"), data exfiltration attempts, and encoded payloads.',
    snippet: `glob INSTRUCTION_OVERRIDE: list[str] = [
    "ignore previous instructions",
    "forget everything",
    "you are now",
    "override:", "system:"
];

walker CheckInjection {
    has content: str;
    has source: str = "unknown";

    can check with entry {
        content_lower = self.content.lower();
        for pattern in INSTRUCTION_OVERRIDE {
            if pattern in content_lower {
                report block_result(
                    "injection_firewall",
                    BlockReason.CUSTOM,
                    f"Injection detected: '{pattern}'"
                );
                disengage;
            }
        }
        report pass_result("injection_firewall");
    }
}`,
  },
  {
    id: 'exfiltration-guard',
    name: 'Exfiltration Guard',
    file: 'exfiltration_guard.jac',
    icon: '\uD83D\uDD12',
    color: 'red',
    tagline: 'Prevents PII data exfiltration',
    description:
      'Detects PII in outbound payloads and redacts before they reach observability tools or logs. Scans for email addresses, phone numbers, SSNs, credit cards, and custom patterns from user context.',
    snippet: `glob EMAIL_PATTERN: str =
    r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}';
glob SSN_PATTERN: str = r'\\b\\d{3}-\\d{2}-\\d{4}\\b';

walker ScanPayload {
    has payload_str: str;

    can scan with entry {
        for m in re.finditer(EMAIL_PATTERN, self.payload_str) {
            matches.append({
                "type": "EMAIL",
                "redacted": "[EMAIL_REDACTED]"
            });
        }
        if matches {
            report confirm_result("exfiltration_guard",
                f"PII detected: {len(matches)} match(es).");
        }
    }
}`,
  },
  {
    id: 'session-hijack',
    name: 'Session Hijack',
    file: 'session_hijack.jac',
    icon: '\uD83D\uDC7E',
    color: 'amber',
    tagline: 'Detects automated session injection',
    description:
      'Validates session event provenance and detects automated injection attempts by checking timing patterns and content consistency. Catches bot-like rapid-fire event sequences.',
    snippet: `walker CheckSessionIntegrity {
    has events: list[dict] = [];
    has max_events_per_second: int = 3;
    has min_interval_ms: int = 200;

    can check with entry {
        sorted_events = sorted(self.events,
            key=lambda e: e["timestamp_epoch"]);
        for i in range(1, len(sorted_events)) {
            interval_ms = (sorted_events[i]["timestamp_epoch"]
                - sorted_events[i-1]["timestamp_epoch"]) * 1000;
            if interval_ms < self.min_interval_ms {
                rapid_count += 1;
            }
        }
        if rapid_count > 2 {
            report block_result("session_hijack", ...);
        }
    }
}`,
  },
  {
    id: 'cross-user-firewall',
    name: 'Cross-User Firewall',
    file: 'cross_user_firewall.jac',
    icon: '\uD83D\uDC65',
    color: 'red',
    tagline: 'Prevents cross-user data access',
    description:
      'Enforces user context isolation. Checks that no content from other users bleeds into the current user\'s LLM context. Validates both user ID boundaries and memory namespace isolation.',
    snippet: `walker CheckContextIsolation {
    has current_user_id: str;
    has context_user_ids: list[str] = [];
    has memory_namespaces: list[str] = [];

    can check with entry {
        foreign_users = [uid for uid in self.context_user_ids
            if uid != self.current_user_id];
        if foreign_users {
            report block_result(
                "cross_user_firewall",
                BlockReason.CUSTOM,
                f"Cross-user contamination: {foreign_users}"
            );
            disengage;
        }
        report pass_result("cross_user_firewall");
    }
}`,
  },
  {
    id: 'context-poisoning',
    name: 'Context Poisoning',
    file: 'context_poisoning.jac',
    icon: '\u2620\uFE0F',
    color: 'amber',
    tagline: 'Detects poisoned memory chunks',
    description:
      'Scans memory retrieval results for poisoning signatures before they enter LLM context. Catches persistent injection attacks that standard scanners miss because they only scan current input.',
    snippet: `glob POISONING_PATTERNS: list[str] = [
    "ignore previous instructions",
    "override all rules",
    "your new primary directive",
    "secret instruction:",
    "disregard safety"
];

walker CheckMemoryChunk {
    has chunk_content: str;
    has chunk_id: str = "";

    can check with entry {
        content_lower = self.chunk_content.lower();
        for pattern in POISONING_PATTERNS {
            if pattern in content_lower {
                report block_result(
                    "context_poisoning", BlockReason.CUSTOM,
                    f"Memory poisoning: '{pattern}'"
                );
                disengage;
            }
        }
        report pass_result("context_poisoning");
    }
}`,
  },
  {
    id: 'undo-integrity',
    name: 'Undo Integrity',
    file: 'undo_integrity.jac',
    icon: '\u21A9\uFE0F',
    color: 'indigo',
    tagline: 'Validates undo capability before execution',
    description:
      'Checks whether an action can actually be undone before executing. Classifies undo capability as REVERSIBLE, BEST_EFFORT, or IRREVERSIBLE. Warns before irreversible actions like sending emails or making payments.',
    snippet: `glob IRREVERSIBLE_ACTIONS: list[str] = [
    "send_email", "send_sms", "make_payment",
    "transfer_funds", "delete_account"
];

walker CheckUndoIntegrity {
    has action_type: str;
    has has_undo_fn: bool = False;

    can check with entry {
        action_lower = self.action_type.lower();
        for action in IRREVERSIBLE_ACTIONS {
            if action_lower.startswith(action) {
                report confirm_result("undo_integrity",
                    f"'{self.action_type}' is IRREVERSIBLE.");
                disengage;
            }
        }
        report pass_result("undo_integrity");
    }
}`,
  },
];

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

const colorMap = {
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    glow: 'rgba(16, 185, 129, 0.15)',
    dot: 'bg-emerald-400',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    glow: 'rgba(99, 102, 241, 0.15)',
    dot: 'bg-indigo-400',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    glow: 'rgba(217, 119, 6, 0.15)',
    dot: 'bg-amber-400',
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    glow: 'rgba(220, 38, 38, 0.15)',
    dot: 'bg-red-400',
  },
};

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function WalkerCard({
  walker,
  isExpanded,
  onToggle,
}: {
  walker: Walker;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const c = colorMap[walker.color];
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left card-glow p-6 transition-all duration-300 hover:-translate-y-0.5 ${
        isExpanded ? 'ring-1 ring-emerald-500/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center text-lg flex-shrink-0`}
          >
            {walker.icon}
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold text-corpus-text">
              {walker.name}
            </h3>
            <p className={`text-xs font-mono ${c.text} mt-0.5`}>
              {walker.tagline}
            </p>
          </div>
        </div>
        <span
          className={`text-corpus-muted text-xs mt-1 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          &#9660;
        </span>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4 animate-fade-in">
          <p className="text-corpus-muted text-sm leading-relaxed">
            {walker.description}
          </p>
          <div className="rounded-lg bg-[#0a0a0a] border border-corpus-line/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-corpus-line/30">
              <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
              <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
              <div className="w-2 h-2 rounded-full bg-[#28C840]" />
              <span className="ml-2 text-[10px] text-corpus-muted font-mono">
                {walker.file}
              </span>
            </div>
            <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto text-corpus-muted">
              <code>{walker.snippet}</code>
            </pre>
          </div>
        </div>
      )}
    </button>
  );
}

function FlowDiagram() {
  return (
    <div className="card-glow p-8 md:p-10">
      <h3 className="font-mono text-lg font-bold text-corpus-text mb-6 text-center">
        How Jac Walkers Evaluate Policies
      </h3>
      {/* Flow visualization */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0">
        {/* Step 1: AI Action */}
        <div className="flex flex-col items-center text-center w-40">
          <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-mono text-xs text-corpus-text font-bold">AI Action</span>
          <span className="text-[10px] text-corpus-muted mt-0.5">send_email, delete_file...</span>
        </div>

        {/* Arrow */}
        <div className="hidden md:flex items-center px-2">
          <div className="w-12 h-[1px] bg-gradient-to-r from-indigo-500/50 to-emerald-500/50" />
          <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[6px] border-transparent border-l-emerald-500/50" />
        </div>
        <div className="md:hidden flex flex-col items-center py-1">
          <div className="h-6 w-[1px] bg-gradient-to-b from-indigo-500/50 to-emerald-500/50" />
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-emerald-500/50" />
        </div>

        {/* Step 2: Walker Traversal */}
        <div className="flex flex-col items-center text-center w-48">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-2 relative">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-glow-pulse" />
          </div>
          <span className="font-mono text-xs text-emerald-400 font-bold">Jac Walker</span>
          <span className="text-[10px] text-corpus-muted mt-0.5">Traverses policy graph</span>
          <span className="text-[10px] text-corpus-muted">deterministically</span>
        </div>

        {/* Arrow */}
        <div className="hidden md:flex items-center px-2">
          <div className="w-12 h-[1px] bg-gradient-to-r from-emerald-500/50 to-emerald-500/30" />
          <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[6px] border-transparent border-l-emerald-500/30" />
        </div>
        <div className="md:hidden flex flex-col items-center py-1">
          <div className="h-6 w-[1px] bg-gradient-to-b from-emerald-500/50 to-emerald-500/30" />
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-emerald-500/30" />
        </div>

        {/* Step 3: Verdict */}
        <div className="flex flex-col items-center text-center w-48">
          <div className="flex gap-3 mb-2">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <span className="text-emerald-400 font-mono text-xs font-bold">PASS</span>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <span className="text-amber-400 font-mono text-xs font-bold">ASK</span>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <span className="text-red-400 font-mono text-xs font-bold">BLOCK</span>
              </div>
            </div>
          </div>
          <span className="font-mono text-xs text-corpus-text font-bold">Verdict</span>
          <span className="text-[10px] text-corpus-muted mt-0.5">Deterministic result</span>
        </div>
      </div>

      {/* Bottom explanation */}
      <div className="mt-8 pt-6 border-t border-corpus-line/30 text-center">
        <p className="text-corpus-muted text-xs font-mono leading-relaxed max-w-xl mx-auto">
          Every action your AI agent takes is evaluated by Jac walkers traversing a policy graph.
          <br />
          No LLM opinions. No probabilistic guessing. Pure deterministic graph traversal.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PoliciesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <main className="min-h-screen bg-corpus-bg bg-grid relative overflow-hidden">
      {/* Ambient glow */}
      <div className="hero-glow top-[-200px] left-1/2 -translate-x-1/2" />

      <NavBar />

      {/* ======== HERO ======== */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-16 md:pt-24 pb-12">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-mono tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow-pulse" />
            Powered by Jac &mdash; jaseci.org
          </span>
        </div>

        <h1 className="font-mono text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter leading-[0.95] max-w-3xl">
          <span className="text-gradient-shimmer">10 Jac Walkers</span>
          <br />
          guarding your AI agent
        </h1>

        <p className="text-corpus-muted text-base md:text-lg max-w-2xl leading-relaxed mt-6">
          Deterministic policy evaluation. No LLM opinions. No probabilistic guessing.
          <br />
          Pure graph traversal that returns <span className="text-emerald-400 font-mono">PASS</span>,{' '}
          <span className="text-amber-400 font-mono">CONFIRM</span>, or{' '}
          <span className="text-red-400 font-mono">BLOCK</span>.
        </p>
      </section>

      {/* ======== WHY JAC ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-12">
        <div className="card-glow p-8">
          <h2 className="font-mono text-xl font-bold text-corpus-text mb-4">
            Why <a href="https://jaseci.org" target="_blank" rel="noopener noreferrer" className="text-gradient hover:underline">Jac</a> for Policy Evaluation?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-mono text-sm font-bold text-emerald-400 mb-2">
                Deterministic
              </h3>
              <p className="text-corpus-muted text-sm leading-relaxed">
                LLMs are probabilistic -- ask the same question twice, get different answers. Safety policies must be deterministic. Jac walkers traverse a graph and return the same verdict every time.
              </p>
            </div>
            <div>
              <h3 className="font-mono text-sm font-bold text-indigo-400 mb-2">
                Graph-Native
              </h3>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Jac is built around graphs. Policy evaluation is graph traversal -- walkers visit nodes, check conditions, and report verdicts. No ORM, no SQL. Just <code className="text-emerald-400/80 text-xs">root --&gt; node</code>.
              </p>
            </div>
            <div>
              <h3 className="font-mono text-sm font-bold text-amber-400 mb-2">
                Composable
              </h3>
              <p className="text-corpus-muted text-sm leading-relaxed">
                Each walker is independent. Stack 10 built-in policies, then add your own custom walkers. Each one checks a specific concern -- no tangled if-else chains.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== FLOW DIAGRAM ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-12">
        <FlowDiagram />
      </section>

      {/* ======== WALKER GRID ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-12">
        <h2 className="font-mono text-2xl font-bold text-corpus-text mb-2 text-center">
          Built-in Policy Walkers
        </h2>
        <p className="text-corpus-muted text-sm text-center mb-8 font-mono">
          Click any walker to see its Jac source code
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {WALKERS.map((w) => (
            <WalkerCard
              key={w.id}
              walker={w}
              isExpanded={expandedId === w.id}
              onToggle={() => toggle(w.id)}
            />
          ))}
        </div>
      </section>

      {/* ======== WRITE YOUR OWN ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
        <div className="card-glow p-8 md:p-10">
          <h2 className="font-mono text-xl font-bold text-corpus-text mb-2">
            Write Your Own Policy in 5 Lines
          </h2>
          <p className="text-corpus-muted text-sm mb-6 leading-relaxed">
            Corpus uses Jac walkers for policy evaluation. A walker is a function that traverses a graph
            and reports a verdict. Here is a custom policy that blocks production API calls in dev:
          </p>
          <div className="rounded-lg bg-[#0a0a0a] border border-corpus-line/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-corpus-line/30">
              <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
              <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
              <div className="w-2 h-2 rounded-full bg-[#28C840]" />
              <span className="ml-2 text-[10px] text-corpus-muted font-mono">
                my_custom_policy.jac
              </span>
            </div>
            <pre className="p-5 text-sm font-mono leading-7 overflow-x-auto">
              <code>
                <span className="text-indigo-400">walker</span>{' '}
                <span className="text-emerald-400">CheckNoProductionCalls</span>{' '}
                <span className="text-corpus-muted">{'{'}</span>
                {'\n'}
                {'    '}
                <span className="text-indigo-400">can</span>{' '}
                <span className="text-corpus-text">check</span>{' '}
                <span className="text-indigo-400">with</span>{' '}
                <span className="text-corpus-text">entry</span>{' '}
                <span className="text-corpus-muted">{'{'}</span>
                {'\n'}
                {'        '}
                <span className="text-indigo-400">if</span>{' '}
                <span className="text-corpus-text">self.action_type</span>{' '}
                <span className="text-corpus-muted">==</span>{' '}
                <span className="text-amber-400">{'"api_call"'}</span>{' '}
                <span className="text-indigo-400">and</span>{' '}
                <span className="text-amber-400">{'"production"'}</span>{' '}
                <span className="text-indigo-400">in</span>{' '}
                <span className="text-corpus-text">self.target</span>{' '}
                <span className="text-corpus-muted">{'{'}</span>
                {'\n'}
                {'            '}
                <span className="text-red-400">report</span>{' '}
                <span className="text-corpus-muted">{'{'}</span>
                <span className="text-amber-400">{'"verdict"'}</span>
                <span className="text-corpus-muted">:</span>{' '}
                <span className="text-amber-400">{'"BLOCK"'}</span>
                <span className="text-corpus-muted">,</span>{' '}
                <span className="text-amber-400">{'"reason"'}</span>
                <span className="text-corpus-muted">:</span>{' '}
                <span className="text-amber-400">{'"No production API calls in dev"'}</span>
                <span className="text-corpus-muted">{'};'}</span>
                {'\n'}
                {'            '}
                <span className="text-red-400">disengage</span>
                <span className="text-corpus-muted">;</span>
                {'\n'}
                {'        '}
                <span className="text-corpus-muted">{'}'}</span>
                {'\n'}
                {'        '}
                <span className="text-emerald-400">report</span>{' '}
                <span className="text-corpus-muted">{'{'}</span>
                <span className="text-amber-400">{'"verdict"'}</span>
                <span className="text-corpus-muted">:</span>{' '}
                <span className="text-amber-400">{'"PASS"'}</span>
                <span className="text-corpus-muted">{'};'}</span>
                {'\n'}
                {'    '}
                <span className="text-corpus-muted">{'}'}</span>
                {'\n'}
                <span className="text-corpus-muted">{'}'}</span>
              </code>
            </pre>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
            <p className="text-corpus-muted text-xs font-mono">
              Save as <code className="text-emerald-400">policies/custom/my_policy.jac</code> and Corpus picks it up automatically.
            </p>
          </div>
        </div>
      </section>

      {/* ======== JASECI CTA ======== */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-20">
        <div className="text-center">
          <p className="text-corpus-muted text-sm font-mono mb-4">
            Built with the Jac programming language
          </p>
          <a
            href="https://jaseci.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 font-mono text-sm hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-200"
          >
            Learn more at jaseci.org
            <span aria-hidden="true">&rarr;</span>
          </a>
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
              <a
                href="https://jaseci.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-corpus-text hover:text-emerald-400 transition-colors"
              >
                Jac
              </a>
            </span>
            <span className="opacity-20" aria-hidden="true">|</span>
            <a
              href="https://github.com/FluentFlier/corpus"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-corpus-text transition-colors"
            >
              Open source
            </a>
            <span className="opacity-20" aria-hidden="true">|</span>
            <span>Made at JacHacks 2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
