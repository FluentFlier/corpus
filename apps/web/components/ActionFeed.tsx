'use client';

import { useState, useEffect } from 'react';
import type { RecentActivityEntry } from '@/lib/fetcher';
import { timeAgo } from '@/lib/format';

interface ActionFeedProps {
  activity: RecentActivityEntry[];
}

function VerdictIcon({ verdict }: { verdict: string }): React.ReactElement {
  if (verdict === 'PASS') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 7l3 3 5-6" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (verdict === 'CONFIRM') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="#D97706" strokeWidth="1.5" />
        <path d="M7 4.5v3M7 9.5v0" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4 4l6 6M10 4l-6 6" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function getDurationColor(ms: number): string {
  if (ms < 50) return '#16A34A';
  if (ms <= 200) return '#D97706';
  return '#DC2626';
}

function TimeAgoLabel({ dateStr }: { dateStr: string }): React.ReactElement {
  const [label, setLabel] = useState('just now');

  useEffect(() => {
    setLabel(timeAgo(dateStr));
  }, [dateStr]);

  return <>{label}</>;
}

export function ActionFeed({ activity }: ActionFeedProps): React.ReactElement {
  if (activity.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-corpus-muted text-sm">
        <span style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}>
          Waiting for first action...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {activity.map((entry, i) => (
        <div
          key={entry.id}
          className="flex items-center gap-3 px-3 h-9 text-xs hover:bg-[#141414] transition-colors rounded"
          style={{
            animation: `fade-in 0.3s ease-out ${i * 30}ms both`,
          }}
        >
          <VerdictIcon verdict={entry.verdict} />
          <span className="font-mono text-corpus-text truncate w-40">
            {entry.actionType.length > 32
              ? entry.actionType.slice(0, 32) + '...'
              : entry.actionType}
          </span>
          <span className="text-corpus-muted truncate w-24">{entry.policyTriggered}</span>
          <span
            className="font-mono ml-auto w-12 text-right"
            style={{ color: getDurationColor(entry.durationMs) }}
          >
            {entry.durationMs}ms
          </span>
          <span className="text-corpus-muted w-16 text-right">
            <TimeAgoLabel dateStr={entry.createdAt} />
          </span>
        </div>
      ))}
    </div>
  );
}
