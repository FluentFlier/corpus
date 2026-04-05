'use client';

import { useEffect, useRef } from 'react';

interface PolicyScoreProps {
  passRate: number;
  passCount: number;
  confirmCount: number;
  blockCount: number;
  totalRuns: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function getColor(rate: number): string {
  if (rate >= 95) return '#16A34A';
  if (rate >= 80) return '#D97706';
  return '#DC2626';
}

export function PolicyScore({ passRate, passCount, confirmCount, blockCount, totalRuns }: PolicyScoreProps): React.ReactElement {
  const numberRef = useRef<SVGTSpanElement>(null);

  useEffect(() => {
    if (!numberRef.current) return;
    const target = passRate;
    const duration = 1200;
    const start = performance.now();

    function animate(now: number): void {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target * 10) / 10;
      if (numberRef.current) {
        numberRef.current.textContent = current.toFixed(1);
      }
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }, [passRate]);

  const cx = 150;
  const cy = 150;
  const r = 120;
  const startAngle = 135;
  const fullSweep = 270;
  const scoreAngle = startAngle + (passRate / 100) * fullSweep;
  const trackPath = describeArc(cx, cy, r, startAngle, startAngle + fullSweep);
  const scorePath = passRate > 0 ? describeArc(cx, cy, r, startAngle, scoreAngle) : '';
  const color = getColor(passRate);
  const showPulse = passRate >= 98;

  return (
    <div className="flex flex-col items-center">
      <svg width="300" height="300" viewBox="0 0 300 300">
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="#1A1A1A"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Score arc */}
        {scorePath && (
          <path
            d={scorePath}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            style={showPulse ? { animation: 'pulse-ring 2s ease-in-out infinite' } : undefined}
          />
        )}
        {/* Number */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#EDEDEA"
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="700"
          fontSize="64"
        >
          <tspan ref={numberRef}>0.0</tspan>
          <tspan fontSize="28" dy="-8">%</tspan>
        </text>
        <text
          x={cx}
          y={cy + 36}
          textAnchor="middle"
          fill="#888"
          fontSize="13"
          fontFamily="sans-serif"
        >
          pass rate
        </text>
      </svg>

      {/* Stat pills */}
      <div className="flex gap-6 mt-2">
        <div className="text-center">
          <div className="font-mono text-xl font-bold" style={{ color: '#16A34A' }}>
            {passCount.toLocaleString()}
          </div>
          <div className="text-xs text-corpus-muted mt-0.5">passed</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-xl font-bold" style={{ color: '#D97706' }}>
            {confirmCount.toLocaleString()}
          </div>
          <div className="text-xs text-corpus-muted mt-0.5">confirmed</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-xl font-bold" style={{ color: '#DC2626' }}>
            {blockCount.toLocaleString()}
          </div>
          <div className="text-xs text-corpus-muted mt-0.5">blocked</div>
        </div>
      </div>
    </div>
  );
}
