'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ACCOUNT_SECTIONS = [
  { href: '/account', label: 'Dashboard' },
  { href: '/account/destinations', label: 'Saved destinations' },
  { href: '/account/parking-lots', label: 'Saved parking lots' },
] as const;

export default function AccountSectionsNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
      {ACCOUNT_SECTIONS.map((section) => {
        const active =
          section.href === '/account'
            ? pathname === '/account'
            : pathname.startsWith(section.href);

        return (
          <Link
            key={section.href}
            href={section.href}
            className={
              active
                ? 'rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground'
                : 'rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground'
            }
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
