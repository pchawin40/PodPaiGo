'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import UserMenu from './UserMenu';

type SiteHeaderProps = {
  ctaHref?: string;
  ctaLabel?: string;
};

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/airports', label: 'Airports' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
];

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
      <Link
        href={ctaHref}
        onClick={onNavigate}
        className={
          layout === 'mobile'
            ? 'inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700'
            : 'rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'
        }
      >
        {ctaLabel}
      </Link>
    ) : null;
  }

  if (loading) {
    return layout === 'desktop' ? (
      <span className="inline-flex h-9 w-9 animate-pulse rounded-full bg-slate-200" aria-hidden="true" />
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
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </Link>
        )}
        {showPlanTrip ? (
          <Link
            href={ctaHref}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      {user ? (
        <>
          <Link
            href="/account"
            onClick={onNavigate}
            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Account
          </Link>
          <Link
            href="/account#saved-trips"
            onClick={onNavigate}
            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Saved trips
          </Link>
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              void signOut();
            }}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </>
      ) : (
        <Link
          href="/login"
          onClick={onNavigate}
          className="block rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign in
        </Link>
      )}

      {showPlanTrip ? (
        <Link
          href={ctaHref}
          onClick={onNavigate}
          className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default function SiteHeader({
  ctaHref = '/trip',
  ctaLabel = 'Plan trip',
}: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-sky-100/80 bg-white/90 shadow-[0_1px_18px_rgba(14,116,144,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-w-0 items-center gap-2 rounded-full pr-2 text-base font-bold text-slate-950 sm:text-lg"
          aria-label="PodPaiGo home"
        >
          <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0" fill="none">
            <rect width="40" height="40" rx="14" fill="url(#podpaigo-logo-bg)" />
            <path
              d="M11 24.5c4.5-8.6 10.7-12.6 18-12.1"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
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

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 text-sm font-medium text-slate-600 lg:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-2.5 py-2 hover:text-slate-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <AuthActions ctaHref={ctaHref} ctaLabel={ctaLabel} />
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((current) => !current)}
        >
          <span className="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
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

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu backdrop"
            className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
            onClick={closeMobileMenu}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-[min(100%,20rem)] flex-col border-l border-slate-200 bg-white shadow-xl lg:hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-950">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
                onClick={closeMobileMenu}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeWidth="2" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {link.label}
                  </Link>
                ))}
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
