'use client';

import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import TravelCard from '../../components/ui/TravelCard';
import { useAuth } from '../../components/AuthProvider';
import ParkingSpaceForm from '../ParkingSpaceForm';

export default function ParkingSubmitClient() {
  const { user, session, loading, configured } = useAuth();

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader ctaHref="/trip" ctaLabel="Plan trip" />

      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Community parking
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Add a free parking spot</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            New submissions stay pending until PodPaiGo verifies the location and rules.
          </p>
        </div>

        {!configured ? (
          <TravelCard>
            <p className="text-sm text-muted-foreground">
              Supabase auth is not configured. Add auth env vars before accepting submissions.
            </p>
          </TravelCard>
        ) : loading ? (
          <TravelCard>
            <p className="text-sm text-muted-foreground">Loading account...</p>
          </TravelCard>
        ) : !user || !session?.access_token ? (
          <TravelCard>
            <h2 className="text-xl font-semibold">Want to add a free parking spot?</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Register or sign in first so PodPaiGo can verify it.
            </p>
            <Link
              href="/login?redirect=/parking/submit"
              className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Register or sign in
            </Link>
          </TravelCard>
        ) : (
          <TravelCard>
            <ParkingSpaceForm accessToken={session.access_token} />
          </TravelCard>
        )}
      </section>
    </main>
  );
}
