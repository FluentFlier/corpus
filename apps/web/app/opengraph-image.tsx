import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Corpus - The Immune System for Vibe-Coded Software';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0D0D0D',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(26,26,26,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(26,26,26,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Green glow */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 600,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(22,163,74,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Shield icon */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 36 36"
          fill="none"
          style={{ marginBottom: 24 }}
        >
          <path
            d="M18 4L32 11v9c0 7-6 12-14 16C10 32 4 27 4 20v-9L18 4z"
            stroke="#16A34A"
            strokeWidth="2"
          />
          <path
            d="M13 18l4 4 6-7"
            stroke="#16A34A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: '#EDEDEA',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          corpus
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#888',
            marginBottom: 48,
          }}
        >
          The immune system for vibe-coded software
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: 64,
          }}
        >
          {[
            { value: '<10ms', label: 'PASS latency', color: '#16A34A' },
            { value: 'YAML', label: 'Policy format', color: '#D97706' },
            { value: 'TS + Py', label: 'Dual SDK', color: '#EDEDEA' },
            { value: '0', label: 'User data stored', color: '#DC2626' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: stat.color,
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 16,
            color: '#555',
          }}
        >
          <span>corpus.run</span>
          <span style={{ color: '#333' }}>|</span>
          <span>Open source</span>
          <span style={{ color: '#333' }}>|</span>
          <span>Built with Jac</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
