'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import TravelCard from '../../components/ui/TravelCard';
import { useAuth } from '../../components/AuthProvider';
import {
  USER_PARKING_STATUS_LABELS,
  type UserParkingSpaceRecord,
  type UserParkingStatus,
} from '../../../lib/parking/userParkingSpacesTypes';

const FILTERS: Array<UserParkingStatus | 'all'> = [
  'pending',
  'needs_more_info',
  'verified',
  'rejected',
  'all',
];

export default function AdminParkingSubmissionsClient() {
  const { user, session, loading, configured } = useAuth();
  const [status, setStatus] = useState<UserParkingStatus | 'all'>('pending');
  const [parking, setParking] = useState<UserParkingSpaceRecord[]>([]);
  const [reason, setReason] = useState('');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminStatusLoading, setAdminStatusLoading] = useState(false);

  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    if (!configured || loading || !accessToken) {
      setIsAdmin(false);
      setAdminStatusLoading(false);
      return;
    }

    let cancelled = false;
    setAdminStatusLoading(true);

    fetch('/api/admin/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setIsAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setAdminStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, configured, loading]);

  const load = useCallback(async () => {
    if (!accessToken || !isAdmin) return;

    setFetching(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/parking-submissions?status=${status}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json().catch(() => ({}))) as {
        parking?: UserParkingSpaceRecord[];
        message?: string;
      };
      if (!response.ok) throw new Error(data.message || `Load failed (${response.status})`);
      setParking(data.parking || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load submissions.');
    } finally {
      setFetching(false);
    }
  }, [accessToken, isAdmin, status]);

  useEffect(() => {
    if (!loading && configured && isAdmin && accessToken) {
      void load();
    }
  }, [accessToken, configured, isAdmin, load, loading]);

  async function moderate(item: UserParkingSpaceRecord, nextStatus: UserParkingStatus) {
    if (!accessToken) return;

    const response = await fetch('/api/admin/parking-submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: item.id,
        status: nextStatus,
        rejection_reason: nextStatus === 'verified' ? null : reason,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      parking?: UserParkingSpaceRecord;
      message?: string;
    };

    if (!response.ok || !data.parking) {
      setError(data.message || `Moderation failed (${response.status})`);
      return;
    }

    setParking((current) =>
      current.map((row) => (row.id === item.id ? data.parking! : row)),
    );
  }

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link href="/account" className="text-sm font-medium text-primary hover:underline">
          Back to account
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Parking submissions</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Verify community-submitted free parking before it appears in public results.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={fetching || !isAdmin}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            {fetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {!configured ? (
          <TravelCard className="mt-6">
            <p className="text-sm text-muted-foreground">Supabase auth is not configured.</p>
          </TravelCard>
        ) : loading || adminStatusLoading ? (
          <TravelCard className="mt-6">
            <p className="text-sm text-muted-foreground">Loading session...</p>
          </TravelCard>
        ) : !user ? (
          <TravelCard className="mt-6">
            <p className="text-sm text-muted-foreground">Sign in with an admin account.</p>
            <Link
              href="/login?redirect=/admin/parking-submissions"
              className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </TravelCard>
        ) : !isAdmin ? (
          <TravelCard className="mt-6">
            <p className="font-semibold text-foreground">Admin access required.</p>
          </TravelCard>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatus(filter)}
                  className={
                    filter === status
                      ? 'rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground'
                      : 'rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted'
                  }
                >
                  {filter === 'all' ? 'All' : USER_PARKING_STATUS_LABELS[filter]}
                </button>
              ))}
            </div>

            <label className="block text-sm font-medium">
              Rejection / needs-more-info note
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                placeholder="Optional note sent to the submitter"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {parking.length === 0 ? (
              <TravelCard>
                <p className="text-sm text-muted-foreground">No submissions in this filter.</p>
              </TravelCard>
            ) : (
              parking.map((item) => (
                <TravelCard key={item.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{item.name}</h2>
                        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold">
                          {USER_PARKING_STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.address}</p>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {item.parking_type}
                        {item.time_limit_minutes ? ` - ${item.time_limit_minutes} min limit` : ''}
                        {item.overnight_allowed === true ? ' - overnight allowed' : ''}
                        {item.validation_required ? ' - validation required' : ''}
                      </div>
                      {item.lot_rules || item.notes ? (
                        <p className="mt-2 text-sm">{item.lot_rules || item.notes}</p>
                      ) : null}
                      {item.evidence_url ? (
                        <a
                          href={item.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
                        >
                          Evidence
                        </a>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void moderate(item, 'verified')}
                        className="rounded-full bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => void moderate(item, 'needs_more_info')}
                        className="rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                      >
                        Needs info
                      </button>
                      <button
                        type="button"
                        onClick={() => void moderate(item, 'rejected')}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </TravelCard>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}
