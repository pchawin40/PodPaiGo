'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useAdminStatus } from './useAdminStatus';
import ThemeToggle from './ThemeToggle';
import UserMenu from './UserMenu';
import PrimaryButton from './ui/PrimaryButton';

type SiteHeaderProps = {
  ctaHref?: string;
  ctaLabel?: string;
};

const DESKTOP_LINKS = [
  { href: '/quick-go', label: 'Quick Go' },
  { href: '/airports', label: 'Airports' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/about', label: 'About' },
];

const MOBILE_LINKS = DESKTOP_LINKS;

function navLinkClass(active: boolean, mobile = false): string {
  const base = mobile
    ? 'block rounded-xl px-3 py-2.5 text-sm font-medium transition'
    : 'rounded-full px-3 py-2 text-sm font-medium transition';

  if (active) {
    return `${base} bg-primary/10 text-primary`;
  }

  return `${base} text-muted-foreground hover:bg-muted hover:text-foreground`;
}

function AuthActions({
  ctaHref,
  ctaLabel,
  onNavigate,
  showPlanTrip = true,
  layout = 'desktop',
}: {
  ctaHref: string;
  ctaLabel: string;
  onNavigate?: () => void;
  showPlanTrip?: boolean;
  layout?: 'desktop' | 'mobile';
}) {
  const { user, loading, configured, signOut } = useAuth();

  if (!configured) {
    return showPlanTrip ? (
      <PrimaryButton
        href={ctaHref}
        onClick={onNavigate}
        className={layout === 'mobile' ? 'w-full' : ''}
      >
        {ctaLabel}
      </PrimaryButton>
    ) : null;
  }

  if (loading) {
    return layout === 'desktop' ? (
      <span className="inline-flex h-9 w-9 animate-pulse rounded-full bg-muted" aria-hidden="true" />
    ) : null;
  }

  if (layout === 'desktop') {
    return (
      <>
        {user ? (
          <UserMenu onNavigate={onNavigate} />
        ) : (
          <Link
            href="/login"
            className="rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Sign in
          </Link>
        )}
        {showPlanTrip ? (
          <PrimaryButton href={ctaHref} onClick={onNavigate}>
            {ctaLabel}
          </PrimaryButton>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      {user ? (
        <>
          <Link href="/account" onClick={onNavigate} className={navLinkClass(false, true)}>
            Account
          </Link>
          <Link href="/account#saved-trips" onClick={onNavigate} className={navLinkClass(false, true)}>
            Saved trips
          </Link>
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              void signOut();
            }}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Sign out
          </button>
        </>
      ) : (
        <Link href="/login" onClick={onNavigate} className={navLinkClass(false, true)}>
          Login
        </Link>
      )}

      {showPlanTrip ? (
        <PrimaryButton href={ctaHref} onClick={onNavigate} className="w-full">
          {ctaLabel}
        </PrimaryButton>
      ) : null}
    </div>
  );
}

export default function SiteHeader({
  ctaHref = '/trip',
  ctaLabel = 'Plan trip',
}: SiteHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, configured } = useAuth();
  const { isAdmin, loading: adminStatusLoading } = useAdminStatus();

  const closeMobileMenu = () => setMobileOpen(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const showAdmin = !loading && !adminStatusLoading && isAdmin;

  return (
    <header className="sticky top-0 z-50 border-b border-border glass-panel rounded-none shadow-[0_8px_30px_rgba(14,116,144,0.08)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <Link
          href="/"
          className="inline-flex min-w-0 items-center gap-2 rounded-full pr-2 text-base font-bold text-foreground sm:text-lg"
          aria-label="PodPaiGo home"
        >
          <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0" fill="none">
            <rect width="40" height="40" rx="14" fill="url(#podpaigo-logo-bg)" />
            <path d="M11 24.5c4.5-8.6 10.7-12.6 18-12.1" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <path
              d="M11.5 25.5h15.2c2 0 3.8 1.2 4.6 3.1"
              stroke="#BAE6FD"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="14" cy="28" r="2.2" fill="white" />
            <circle cx="27" cy="28" r="2.2" fill="white" />
            <path
              d="M25.7 10.7 31 9.2l-1.3 5.3"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="podpaigo-logo-bg" x1="6" y1="4" x2="35" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="1" stopColor="#2563EB" />
              </linearGradient>
            </defs>
          </svg>
          <span className="truncate">PodPaiGo</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {DESKTOP_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={navLinkClass(isActive(link.href))}>
              {link.label}
            </Link>
          ))}
          {showAdmin ? (
            <Link href="/admin/parking-submissions" className={navLinkClass(isActive('/admin'))}>
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle compact />
          <AuthActions ctaHref={ctaHref} ctaLabel={ctaLabel} />
        </div>

        <div className="flex items-center gap-1.5 lg:hidden">
          <ThemeToggle compact />
          {configured && !loading && user ? <UserMenu onNavigate={closeMobileMenu} /> : null}
          {!user && configured && !loading ? (
            <Link
              href="/login"
              aria-label="Sign in"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z"
                />
              </svg>
            </Link>
          ) : null}

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeWidth="2" d="M6 6l12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu backdrop"
            className="fixed inset-0 z-40 bg-travel-navy/40 lg:hidden"
            onClick={closeMobileMenu}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-[min(100%,20rem)] flex-col border-l border-border bg-background shadow-xl lg:hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                onClick={closeMobileMenu}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeWidth="2" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-1">
                {MOBILE_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className={navLinkClass(isActive(link.href), true)}
                  >
                    {link.label}
                  </Link>
                ))}
                {showAdmin ? (
                  <Link
                    href="/admin/parking-submissions"
                    onClick={closeMobileMenu}
                    className={navLinkClass(isActive('/admin'), true)}
                  >
                    Admin
                  </Link>
                ) : null}
              </div>

              <AuthActions
                ctaHref={ctaHref}
                ctaLabel={ctaLabel}
                onNavigate={closeMobileMenu}
                layout="mobile"
              />
            </nav>
          </div>
        </>
      ) : null}
    </header>
  );
}
