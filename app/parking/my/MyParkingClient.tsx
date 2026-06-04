'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import TravelCard from '../../components/ui/TravelCard';
import { useAuth } from '../../components/AuthProvider';
import {
  USER_PARKING_STATUS_LABELS,
  isUserParkingEditable,
  type UserParkingSpaceRecord,
} from '../../../lib/parking/userParkingSpacesTypes';
import ParkingSpaceForm from '../ParkingSpaceForm';

function statusClass(status: UserParkingSpaceRecord['status']): string {
  switch (status) {
    case 'verified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'rejected':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'needs_more_info':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-800';
  }
}

export default function MyParkingClient() {
  const { user, session, loading, configured } = useAuth();
  const [parking, setParking] = useState<UserParkingSpaceRecord[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserParkingSpaceRecord | null>(null);

  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    if (!accessToken) return;

    setFetching(true);
    setError(null);
    fetch('/api/parking/user-spaces', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          parking?: UserParkingSpaceRecord[];
          message?: string;
        };
        if (!response.ok) throw new Error(data.message || `Load failed (${response.status})`);
        setParking(data.parking || []);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Could not load parking.');
      })
      .finally(() => setFetching(false));
  }, [accessToken]);

  const sorted = useMemo(() => parking, [parking]);

  async function deleteSubmission(item: UserParkingSpaceRecord) {
    if (!accessToken || !isUserParkingEditable(item.status)) return;

    const response = await fetch(`/api/parking/user-spaces/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message || `Delete failed (${response.status})`);
      return;
    }

    setParking((current) => current.filter((space) => space.id !== item.id));
  }

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader ctaHref="/trip" ctaLabel="Plan trip" />

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Community parking
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">My parking submissions</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track pending, verified, and needs-more-info parking spots you submitted.
            </p>
          </div>
          <Link
            href="/parking/submit"
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Add parking
          </Link>
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
        ) : !user || !accessToken ? (
          <TravelCard>
            <h2 className="text-xl font-semibold">Want to add a free parking spot?</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Register or sign in first so PodPaiGo can verify it.
            </p>
            <Link
              href="/login?redirect=/parking/my"
              className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Register or sign in
            </Link>
          </TravelCard>
        ) : editing ? (
          <TravelCard>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Edit submission</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Changes return the submission to pending verification.
              </p>
            </div>
            <ParkingSpaceForm
              accessToken={accessToken}
              initial={editing}
              onCancel={() => setEditing(null)}
              onSaved={(record) => {
                setParking((current) =>
                  current.map((item) => (item.id === record.id ? record : item)),
                );
                setEditing(null);
              }}
            />
          </TravelCard>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {fetching ? (
              <TravelCard>
                <p className="text-sm text-muted-foreground">Loading submissions...</p>
              </TravelCard>
            ) : sorted.length === 0 ? (
              <TravelCard>
                <p className="text-sm text-muted-foreground">
                  No parking submissions yet.
                </p>
              </TravelCard>
            ) : (
              sorted.map((item) => {
                const editable = isUserParkingEditable(item.status);

                return (
                  <TravelCard key={item.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{item.name}</h2>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                            {USER_PARKING_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.address}</p>
                        {item.rejection_reason ? (
                          <p className="mt-2 text-sm text-amber-900">{item.rejection_reason}</p>
                        ) : null}
                        {item.lot_rules || item.notes ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {item.lot_rules || item.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {editable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditing(item)}
                              className="rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void deleteSubmission(item);
                              }}
                              className="rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Verified submissions require a new correction request.
                          </span>
                        )}
                      </div>
                    </div>
                  </TravelCard>
                );
              })
            )}
          </div>
        )}
      </section>
    </main>
  );
}
