'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import TravelPreferencesPanel from '../components/TravelPreferencesPanel';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../components/AuthProvider';
import type { SavedTripRecord } from '../../lib/auth/types';
import { deleteSavedTrip, listSavedTrips } from '../../lib/auth/savedTrips';
import { getUserDisplayName } from '../../lib/auth/userProfile';
import { getSupabaseClient } from '../../lib/supabase/client';
import { tripDataToSearchParams } from '../../lib/trip/searchParams';
import {
  readFavoriteLocations,
  readSavedParkingLots,
  readTravelPreferences,
  writeTravelPreferences,
  type TripTravelPreferences,
} from '../../lib/trip/travelPreferences';
import { readSavedDestinations } from '../../lib/trip/savedDestinations';
import AccountSectionsNav from './AccountSectionsNav';
import TravelCard from '../components/ui/TravelCard';
import { trackEvent } from '../../lib/analytics/trackEvent';

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

function AccountSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <TravelCard>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </TravelCard>
    </section>
  );
}

export default function AccountDashboard() {
  const { user, session, loading, configured, signOut } = useAuth();
  const [savedTrips, setSavedTrips] = useState<SavedTripRecord[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [travelPreferences, setTravelPreferences] = useState<TripTravelPreferences>(() =>
    readTravelPreferences(),
  );
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!configured || loading || !session?.access_token) {
      setIsAdmin(false);
      return;
    }

    let cancelled = false;

    fetch('/api/admin/status', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setIsAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, [configured, loading, session?.access_token]);

  useEffect(() => {
    trackEvent('account_viewed');
  }, []);

  useEffect(() => {
    if (!user) {
      setDisplayName('');
      return;
    }

    setDisplayName(getUserDisplayName(user) || '');
  }, [user]);

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

  const favoriteLocations = useMemo(() => readFavoriteLocations(), [user]);
  const savedDestinations = useMemo(() => readSavedDestinations(), [user]);
  const savedParkingLots = useMemo(() => readSavedParkingLots(), [user]);

  const handleDeleteTrip = async (tripId: string) => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    const { error: deleteError } = await deleteSavedTrip(client, user.id, tripId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    trackEvent('saved_trip_deleted', { eventProperties: { lotId: tripId } });
    setSavedTrips((current) => current.filter((trip) => trip.id !== tripId));
  };

  const handleSaveProfile = async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    setProfileSaving(true);
    setProfileMessage(null);

    const trimmed = displayName.trim();
    const { error: updateError } = await client.auth.updateUser({
      data: {
        display_name: trimmed || null,
      },
    });

    setProfileSaving(false);

    if (updateError) {
      setProfileMessage(updateError.message);
      return;
    }

    setProfileMessage('Profile updated.');
    trackEvent('profile_updated');
  };

  const handleTravelPreferencesChange = (next: TripTravelPreferences) => {
    setTravelPreferences(next);
    writeTravelPreferences(next);
  };

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader ctaHref="/trip" ctaLabel="Plan trip" />

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-12">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Account</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage your profile, saved trips, local favorites, and travel preferences.
          </p>
          <AccountSectionsNav />
        </div>

        {!configured ? (
          <TravelCard>
            <p className="text-sm text-muted-foreground">
              Add Supabase auth env vars to enable account features.
            </p>
          </TravelCard>
        ) : loading ? (
          <TravelCard>
            <p className="text-sm text-muted-foreground">Loading account…</p>
          </TravelCard>
        ) : !user ? (
          <TravelCard className="text-center">
            <h2 className="text-xl font-semibold text-foreground">Sign in to your account</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Save trips, reopen saved plans, and sync across devices.
            </p>
            <Link
              href="/login?redirect=/account"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          </TravelCard>
        ) : (
          <div className="space-y-6">
            <AccountSection title="Profile" description="Your display name appears across saved trips and navigation.">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <UserAvatar user={user} size="lg" />
                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground" htmlFor="display-name">
                      Display name
                    </label>
                    <input
                      id="display-name"
                      type="text"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="How should we greet you?"
                      className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveProfile();
                      }}
                      disabled={profileSaving}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {profileSaving ? 'Saving…' : 'Save profile'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                    >
                      Sign out
                    </button>
                  </div>
                  {profileMessage ? (
                    <p className="text-sm text-muted-foreground">{profileMessage}</p>
                  ) : null}
                </div>
              </div>
            </AccountSection>

            <AccountSection
              id="saved-trips"
              title="Saved trips"
              description="Trips saved to your account from the results page."
            >
              {error ? (
                <div className="mb-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {tripsLoading ? (
                <p className="text-sm text-muted-foreground">Loading saved trips…</p>
              ) : savedTrips.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved trips yet. Save a trip from the results page after planning a trip.
                </p>
              ) : (
                <ul className="space-y-3">
                  {savedTrips.map((trip) => {
                    const payload = trip.trip_payload as Parameters<typeof tripDataToSearchParams>[0];
                    const params = tripDataToSearchParams(payload);
                    const href = `/results?${params.toString()}`;

                    return (
                      <li
                        key={trip.id}
                        className="rounded-2xl border border-border bg-muted/20 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-semibold text-foreground">
                              {trip.trip_name || `${trip.origin_text} → ${trip.destination_text}`}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {trip.origin_text} → {trip.destination_text}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatWhen(trip.departure_at)}
                              {trip.airport_code ? ` · ${trip.airport_code}` : ''}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Link
                              href={href}
                              onClick={() => {
                                trackEvent('saved_trip_opened', {
                                  eventProperties: {
                                    airportCode: trip.airport_code ?? undefined,
                                    tripType: trip.trip_type,
                                  },
                                });
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                            >
                              Open
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteTrip(trip.id);
                              }}
                              className="inline-flex items-center justify-center rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
            </AccountSection>

            <AccountSection
              title="Saved parking lots"
              description="Parking lots saved locally on this device from results."
            >
              {savedParkingLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved parking lots yet. Save a lot from trip results to see it here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {savedParkingLots.map((lot) => (
                    <li
                      key={lot.id}
                      className="rounded-xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground"
                    >
                        <div className="font-medium">{lot.label || lot.name}</div>
                      {lot.address ? (
                        <div className="mt-1 text-muted-foreground">{lot.address}</div>
                      ) : null}
                      {lot.airportCode ? (
                        <div className="mt-1 text-xs text-muted-foreground">{lot.airportCode}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </AccountSection>

            <AccountSection
              title="Saved destinations"
              description="Destinations saved for Quick Go search on this device. Separate from favorite locations and saved trips."
            >
              {savedDestinations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved destinations yet. Add one from{' '}
                  <Link href="/account/destinations" className="font-semibold text-primary hover:underline">
                    saved destinations
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2">
                  {savedDestinations.map((destination) => (
                    <li
                      key={destination.id}
                      className="rounded-xl border border-border bg-card/80 px-4 py-3 text-sm"
                    >
                      <div className="font-medium text-foreground">{destination.label}</div>
                      <div className="mt-1 text-muted-foreground">{destination.destination}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Access: {destination.accessType}
                        {destination.notes ? ` · ${destination.notes}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </AccountSection>

            <AccountSection
              title="Favorite locations"
              description="Repeat destinations from trip results and Quick Go favorites."
            >
              {favoriteLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No favorite locations yet. Favorite a destination from trip results or Quick Go.
                </p>
              ) : (
                <ul className="space-y-2">
                  {favoriteLocations.map((location) => (
                    <li
                      key={location.id}
                      className="rounded-xl border border-border bg-card/80 px-4 py-3 text-sm"
                    >
                      <div className="font-medium text-foreground">{location.label}</div>
                      <div className="mt-1 text-muted-foreground">{location.destinationText}</div>
                      {location.originText ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          From {location.originText}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </AccountSection>

            <AccountSection
              title="Travel preferences"
              description="Business travel mode and parking filters used on results."
            >
              <TravelPreferencesPanel
                value={travelPreferences}
                onChange={handleTravelPreferencesChange}
              />
            </AccountSection>

            {isAdmin ? (
              <AccountSection
                title="Admin tools"
                description="Internal diagnostics and maintenance tools."
              >
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/admin/parking-diagnostics"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Parking diagnostics
                  </Link>
                  <Link
                    href="/admin/analytics"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Product analytics
                  </Link>
                  <Link
                    href="/admin/parking-submissions"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Parking submissions
                  </Link>
                </div>
              </AccountSection>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
