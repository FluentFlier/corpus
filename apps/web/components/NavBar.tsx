'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: '/scan', label: 'Scan' },
    { href: '/graph', label: 'Explorer' },
    { href: '/evolution', label: 'Evolution' },
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
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#e5e7eb' }}>corpus</span>
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
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
