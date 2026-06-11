'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ADMIN_LINKS = [
  { href: '/admin/parking-submissions', label: 'Parking submissions' },
  { href: '/admin/outreach', label: 'Outreach email' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/parking-diagnostics', label: 'Parking diagnostics' },
];

export default function AdminNav({ className = '' }: { className?: string }) {
  const pathname = usePathname() || '';

  return (
    <nav aria-label="Admin navigation" className={className}>
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {ADMIN_LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground'
                  : 'rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted'
              }
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
