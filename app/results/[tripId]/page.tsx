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

type StoredTripState =
  | { status: 'loading'; query: null }
  | { status: 'ready'; query: string }
  | { status: 'missing'; query: null }
  | { status: 'invalid'; query: null };

function hasRequiredTripFields(query: string): boolean {
  const params = new URLSearchParams(query);

  const hasBase = Boolean(params.get('origin') && params.get('destination'));
  if (!hasBase) return false;

  const type = params.get('type');

  if (type === 'general-trip' || type === 'point-to-point') {
    return Boolean(
      (params.get('arrivalDate') && params.get('arrivalTime')) ||
      (params.get('parkingCheckInDate') && params.get('parkingCheckInTime')) ||
      (params.get('date') && params.get('time'))
    );
  }

  if (type === 'one-way-departure' || type === 'airport-departure') {
    return Boolean(
      (params.get('departureDate') && params.get('departureTime')) ||
      (params.get('parkingCheckInDate') && params.get('parkingDuration'))
    );
  }

  if (type === 'one-way-arrival' || type === 'airport-arrival') {
    return Boolean(params.get('arrivalDate') && params.get('arrivalTime'));
  }

  if (type === 'round-trip' || type === 'airport-round-trip') {
    return Boolean(
      params.get('departureDate') &&
      params.get('departureTime') &&
      params.get('returnDate') &&
      params.get('returnTime')
    );
  }

  if (type === 'dropoff-pickup' || type === 'airport-dropoff-pickup') {
    return Boolean(params.get('airportTripDate') && params.get('airportTripTime'));
  }

  return true;
}

function queryFromStoredPayload(value: string | null): StoredTripState {
  if (!value) return { status: 'missing', query: null };

  try {
    const payload = JSON.parse(value) as StoredTripPayload;
    let query: string | null = null;

    if (typeof payload.query === 'string' && payload.query.trim()) {
      query = payload.query;
    } else if (payload.tripData && typeof payload.tripData === 'object') {
      query = new URLSearchParams(payload.tripData).toString();
    }

    if (!query) {
      console.warn('PodPaiGo saved trip has no query:', payload);
      return { status: 'invalid', query: null };
    }

    const params = new URLSearchParams(query);
    const hasBase = Boolean(params.get('origin') && params.get('destination'));

    console.log('PodPaiGo saved trip loaded:', {
      query,
      params: Object.fromEntries(params.entries()),
      hasBase,
      strictValidationPasses: hasRequiredTripFields(query),
    });

    // During A-to-B rollout, do not block saved trips if the base route exists.
    // The /trip form already validated this before saving.
    if (!hasBase) {
      return { status: 'invalid', query: null };
    }

    return { status: 'ready', query };
  } catch (error) {
    console.error('PodPaiGo saved trip parse error:', error);
    return { status: 'invalid', query: null };
  }
}

function StoredTripFallback({ kind }: { kind: 'missing' | 'invalid' }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-950">
          {kind === 'missing' ? 'Trip details not found' : 'Trip details are incomplete'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {kind === 'missing'
            ? 'This trip was created on another device or browser. Start a new trip to see live results.'
            : 'This saved trip is missing required trip details. Start a new trip to see live results.'}
        </p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Phase 1 clean result URLs are device/browser-local, so shared links need a new trip
          on the device where they are opened.
        </p>
        <Link
          href="/trip"
          className="mt-5 inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Start a new trip
        </Link>
      </section>
    </main>
  );
}

export default function StoredResultsPage() {
  const params = useParams<{ tripId: string }>();
  const [storedTrip, setStoredTrip] = useState<StoredTripState>({
    status: 'loading',
    query: null,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
      const key = tripId ? `podpaigo-trip-${tripId}` : '';

      if (!key) {
        setStoredTrip({ status: 'missing', query: null });
        return;
      }

      try {
        const raw = window.localStorage.getItem(key);
        const parsed = queryFromStoredPayload(raw);

        console.log('PodPaiGo saved results debug:', {
          tripId,
          key,
          raw,
          parsed,
        });

        setStoredTrip(parsed);
      } catch (error) {
        console.error('PodPaiGo saved results localStorage error:', error);
        setStoredTrip({ status: 'missing', query: null });
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [params.tripId]);

  return (
    <>
      <SiteHeader ctaHref="/trip" ctaLabel="New trip" />

      {storedTrip.status === 'loading' ? (
        <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4">
          <div className="text-xl text-zinc-700">Loading...</div>
        </div>
      ) : storedTrip.status === 'ready' ? (
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4">
              <div className="text-xl text-zinc-700">Loading...</div>
            </div>
          }
        >
          <ResultsContent storedSearchParams={storedTrip.query} />
        </Suspense>
      ) : (
        <StoredTripFallback kind={storedTrip.status} />
      )}
    </>
  );
}
