'use client';

import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TrendChartProps {
  data: { day: string; passRate: number; totalRuns: number }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { day: string; passRate: number } }> }): React.ReactElement | null {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#1A1A1A] border border-[#333] rounded-lg px-3 py-2 text-xs">
      <div className="text-corpus-muted">{formatDate(data.day)}</div>
      <div className="text-corpus-text font-mono font-bold">{data.passRate}%</div>
    </div>
  );
}

export function TrendChart({ data }: TrendChartProps): React.ReactElement {
  if (data.length === 0) {
    return <div className="h-[120px]" />;
  }

  const formattedData = data.map((d) => ({ ...d, label: formatDate(d.day) }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={formattedData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A34A" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#888', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="passRate"
          stroke="#16A34A"
          strokeWidth={2}
          fill="url(#greenGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
