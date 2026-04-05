'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  {
    href: '/graph',
    label: 'Graph',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="3" />
        <line x1="12" y1="8" x2="12" y2="14" />
        <circle cx="6" cy="19" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="12" y1="14" x2="6" y2="16" />
        <line x1="12" y1="14" x2="18" y2="16" />
      </svg>
    ),
  },
  {
    href: '/demo',
    label: 'Demo',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/live',
    label: 'Live',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    href: '/policies',
    label: 'Policies',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="app-sidebar">
        {/* Logo */}
        <div style={{ padding: '20px 20px 24px', borderBottom: '1px solid #1a1a1a' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ position: 'relative', width: 10, height: 10 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%', background: '#10b981',
                animation: 'glow-pulse 3s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 2, borderRadius: '50%', background: '#34d399',
              }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: '#EDEDEA' }}>
              corpus
            </span>
          </Link>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, paddingTop: 12 }}>
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname?.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`app-sidebar-link${isActive ? ' active' : ''}`}
              >
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Health badge */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#10b981', fontWeight: 600 }}>
              Health: 100
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #1a1a1a',
          fontSize: 10, color: '#333', fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}>
          Made at JacHacks 2026
        </div>
      </aside>

      {/* Content */}
      <div className="app-content-with-sidebar" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>

      <style>{`
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
