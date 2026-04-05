'use client';

import type { PolicyBreakdownEntry } from '@/lib/fetcher';

interface PolicyBreakdownProps {
  policies: PolicyBreakdownEntry[];
}

function getBarColor(rate: number): string {
  if (rate >= 95) return '#16A34A';
  if (rate >= 80) return '#D97706';
  return '#DC2626';
}

function formatPolicyName(name: string): string {
  return name
    .replace(/^corpus_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PolicyBreakdown({ policies }: PolicyBreakdownProps): React.ReactElement {
  if (policies.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-corpus-muted text-sm">
        No policies triggered yet
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-corpus-muted border-b border-corpus-line">
        <span className="w-36">Policy</span>
        <span className="flex-1">Pass Rate</span>
        <span className="w-14 text-right">Runs</span>
        <span className="w-14 text-right">Blocked</span>
        <span className="w-14 text-right">Confirmed</span>
      </div>

      {/* Rows */}
      {policies.map((policy, i) => (
        <div
          key={policy.policyTriggered}
          className="flex items-center gap-3 px-3 py-2.5 text-xs hover:bg-[#141414] transition-colors rounded"
          style={{
            animation: `slide-in 0.3s ease-out ${i * 50}ms both`,
          }}
        >
          <span className="w-36 text-corpus-text font-medium truncate">
            {formatPolicyName(policy.policyTriggered)}
          </span>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-1 bg-corpus-line rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${policy.passRate}%`,
                  backgroundColor: getBarColor(policy.passRate),
                  animation: `slide-in 0.8s ease-out ${i * 50 + 200}ms both`,
                }}
              />
            </div>
            <span className="font-mono w-10 text-right" style={{ color: getBarColor(policy.passRate) }}>
              {policy.passRate}%
            </span>
          </div>
          <span className="w-14 text-right text-corpus-muted font-mono">{policy.totalRuns}</span>
          <span className="w-14 text-right font-mono" style={{ color: policy.blockCount > 0 ? '#DC2626' : '#888' }}>
            {policy.blockCount}
          </span>
          <span className="w-14 text-right font-mono" style={{ color: policy.confirmCount > 0 ? '#D97706' : '#888' }}>
            {policy.confirmCount}
          </span>
        </div>
      ))}
    </div>
  );
}
