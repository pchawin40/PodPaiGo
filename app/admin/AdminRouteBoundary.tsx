'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import SiteHeader from '../components/SiteHeader';
import TravelCard from '../components/ui/TravelCard';
import { useAdminStatus } from '../components/useAdminStatus';

export default function AdminRouteBoundary({ children }: { children: ReactNode }) {
  const { configured, loading, signedIn, isAdmin } = useAdminStatus();

  if (loading) {
    return (
      <main className="travel-page-bg min-h-screen text-foreground">
        <SiteHeader />
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <TravelCard>
            <p className="text-sm text-muted-foreground">Checking admin access...</p>
          </TravelCard>
        </section>
      </main>
    );
  }

  if (!configured && !isAdmin) {
    return (
      <main className="travel-page-bg min-h-screen text-foreground">
        <SiteHeader />
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <TravelCard>
            <p className="font-semibold text-foreground">Admin access unavailable.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Supabase auth is not configured for this environment.
            </p>
          </TravelCard>
        </section>
      </main>
    );
  }

  if (!signedIn && !isAdmin) {
    return (
      <main className="travel-page-bg min-h-screen text-foreground">
        <SiteHeader />
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <TravelCard>
            <p className="font-semibold text-foreground">Sign in with an admin account.</p>
            <Link
              href="/login?redirect=/admin"
              className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </TravelCard>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="travel-page-bg min-h-screen text-foreground">
        <SiteHeader />
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <TravelCard>
            <p className="font-semibold text-foreground">Admin access required.</p>
          </TravelCard>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
