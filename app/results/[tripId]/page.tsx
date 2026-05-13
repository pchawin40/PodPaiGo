'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import SiteHeader from '../../components/SiteHeader';
import ResultsContent from '../ResultsContent';

type StoredTripPayload = {
  query?: string;
  tripData?: Record<string, string>;
};

function queryFromStoredPayload(value: string | null): string | null {
  if (!value) return null;

  try {
    const payload = JSON.parse(value) as StoredTripPayload;

    if (typeof payload.query === 'string' && payload.query.trim()) {
      return payload.query;
    }

    if (payload.tripData && typeof payload.tripData === 'object') {
      return new URLSearchParams(payload.tripData).toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default function StoredResultsPage() {
  const params = useParams<{ tripId: string }>();
  const [storedSearchParams, setStoredSearchParams] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
      const key = tripId ? `podpaigo-trip-${tripId}` : '';
      const query = key ? queryFromStoredPayload(window.localStorage.getItem(key)) : null;

      setStoredSearchParams(query);
      setLoaded(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [params.tripId]);

  return (
    <>
      <SiteHeader ctaHref="/trip" ctaLabel="New trip" />

      {!loaded ? (
        <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4">
          <div className="text-xl text-zinc-700">Loading...</div>
        </div>
      ) : storedSearchParams ? (
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4">
              <div className="text-xl text-zinc-700">Loading...</div>
            </div>
          }
        >
          <ResultsContent storedSearchParams={storedSearchParams} />
        </Suspense>
      ) : (
        <main className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 py-12">
          <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-zinc-950">Trip details not found</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              This results link depends on trip details stored on this device. Start a new trip to
              generate fresh results.
            </p>
            <Link
              href="/trip"
              className="mt-5 inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Plan a new trip
            </Link>
          </section>
        </main>
      )}
    </>
  );
}
