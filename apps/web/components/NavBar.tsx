'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: '/scan', label: 'Scan' },
    { href: '/graph', label: 'Explorer' },
    { href: '/evolution', label: 'Evolution' },
    { href: '/live', label: 'Live', pulse: true },
    { href: '/policies', label: 'Jac' },
    { href: '/demo', label: 'Demo' },
    { href: 'https://github.com/FluentFlier/corpus', label: 'GitHub', external: true },
  ];

  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 24px', borderBottom: '1px solid #1f2937',
      background: '#050505ee', backdropFilter: 'blur(8px)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <span style={{
          position: 'relative', width: 10, height: 10, display: 'inline-block',
        }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: '#10b981', animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            position: 'absolute', inset: '2px', borderRadius: '50%',
            background: '#10b981',
          }} />
        </span>
        <span style={{
          fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #10b981, #6366f1)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>corpus</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            style={{
              fontSize: 13, textDecoration: 'none',
              color: pathname === link.href ? '#10b981' : '#6b7280',
              fontWeight: pathname === link.href ? 600 : 400,
              transition: 'color 0.2s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {link.pulse && (
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: '#10b981', animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            )}
            {link.label}
          </Link>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </nav>
  );
}
