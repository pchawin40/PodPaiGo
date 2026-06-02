'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../components/AuthProvider';
import { deleteSavedTrip, listSavedTrips } from '../../lib/auth/savedTrips';
import type { SavedTripRecord } from '../../lib/auth/types';
import { getUserDisplayName } from '../../lib/auth/userProfile';
import { getSupabaseClient } from '../../lib/supabase/client';
import { tripDataToSearchParams } from '../../lib/trip/searchParams';

function formatWhen(value: string | null): string {
  if (!value) return 'No date set';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date set';

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AccountPage() {
  const { user, loading, configured, signOut } = useAuth();
  const [savedTrips, setSavedTrips] = useState<SavedTripRecord[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!configured || !user) {
      setTripsLoading(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setTripsLoading(false);
      return;
    }

    void listSavedTrips(client, user.id).then(({ data, error: listError }) => {
      setSavedTrips(data);
      setError(listError?.message ?? null);
      setTripsLoading(false);
    });
  }, [user, loading, configured]);

  const handleDelete = async (tripId: string) => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    const { error: deleteError } = await deleteSavedTrip(client, user.id, tripId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setSavedTrips((current) => current.filter((trip) => trip.id !== tripId));
  };

  const displayName = user ? getUserDisplayName(user) : null;

  return (
    <main className="airport-page-bg min-h-screen text-slate-950">
      <SiteHeader ctaHref="/trip" ctaLabel="Plan trip" />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-[0_18px_60px_rgba(14,116,144,0.12)]">
          {!configured ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Add Supabase auth env vars to enable account features.
            </div>
          ) : loading ? (
            <p className="text-sm text-slate-500">Loading account…</p>
          ) : !user ? (
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-950">Your account</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Sign in to save trips, reopen saved plans, and sync across devices.
              </p>
              <Link
                href="/login?redirect=/account"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <UserAvatar user={user} size="lg" />
                  <div>
                    <h1 className="text-3xl font-bold text-slate-950">Your account</h1>
                    {displayName ? (
                      <p className="mt-2 text-lg font-medium text-slate-900">{displayName}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-slate-600">{user.email}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>

              <div id="saved-trips" className="mt-8 scroll-mt-24">
                <h2 className="text-lg font-semibold text-slate-950">Saved trips</h2>

                {error ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </div>
                ) : null}

                {tripsLoading ? (
                  <p className="mt-3 text-sm text-slate-500">Loading saved trips…</p>
                ) : savedTrips.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No saved trips yet. Save a trip from the results page after planning a trip.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {savedTrips.map((trip) => {
                      const payload = trip.trip_payload as Parameters<typeof tripDataToSearchParams>[0];
                      const params = tripDataToSearchParams(payload);
                      const href = `/results?${params.toString()}`;

                      return (
                        <li
                          key={trip.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="font-semibold text-slate-950">
                                {trip.trip_name || `${trip.origin_text} → ${trip.destination_text}`}
                              </div>
                              <div className="mt-1 text-sm text-slate-600">
                                {trip.origin_text} → {trip.destination_text}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatWhen(trip.departure_at)}
                                {trip.airport_code ? ` · ${trip.airport_code}` : ''}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Link
                                href={href}
                                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                              >
                                Open
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleDelete(trip.id);
                                }}
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
