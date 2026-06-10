'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import AnalyticsDashboard from '../../components/admin/AnalyticsDashboard';
import { useAdminStatus } from '../../components/useAdminStatus';
import type {
  AnalyticsDashboardData,
  AnalyticsDateRange,
} from '../../../lib/admin/analyticsDashboardTypes';

const EMPTY_DASHBOARD: AnalyticsDashboardData = {
  range: '7d',
  rangeLabel: 'Last 7 days',
  airportFilter: null,
  hasEvents: false,
  emptyMessage:
    'No analytics events yet. Events will appear here after users start planning trips.',
  kpis: {
    sessions: 0,
    resultsViewed: 0,
    quickGoSearches: 0,
    tripFormsSubmitted: 0,
    parkingClicks: 0,
    savedTrips: 0,
    savedDestinations: 0,
    savedParkingLots: 0,
    feedbackReports: 0,
  },
  funnel: [
    { key: 'home', label: 'Home viewed', count: 0, percentOfTop: 0 },
    { key: 'started', label: 'Trip / Quick Go started', count: 0, percentOfTop: 0 },
    { key: 'results', label: 'Results viewed', count: 0, percentOfTop: 0 },
    { key: 'parking', label: 'Parking CTA clicked', count: 0, percentOfTop: 0 },
    { key: 'save', label: 'Saved trip / destination', count: 0, percentOfTop: 0 },
  ],
  topAirports: [],
  destinationCategories: [],
  parkingProviderClicks: [],
  feedback: {
    totalSubmitted: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    byType: [],
  },
  recentActivity: [],
  safety: {
    googlePlacesEnabled: false,
    googlePhotosEnabled: false,
    googleReviewsEnabled: false,
    openAiProviderMode: 'mock',
    analyticsDbConfigured: false,
    lastEventAt: null,
  },
};

export default function AdminAnalyticsPage() {
  const {
    accessToken,
    configured,
    isAdmin,
    loading: adminLoading,
    signedIn,
  } = useAdminStatus();
  const [range, setRange] = useState<AnalyticsDateRange>('7d');
  const [airport, setAirport] = useState('');
  const [data, setData] = useState<AnalyticsDashboardData>(EMPTY_DASHBOARD);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!isAdmin) return;

    setFetching(true);
    setError(null);

    try {
      const params = new URLSearchParams({ range });
      if (airport.trim()) params.set('airport', airport.trim().toUpperCase());

      const response = await fetch(`/api/admin/analytics?${params.toString()}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to load analytics (${response.status})`);
      }

      setData((await response.json()) as AnalyticsDashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  }, [accessToken, airport, isAdmin, range]);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      void loadDashboard();
    }
  }, [adminLoading, isAdmin, loadDashboard]);

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/account" className="text-sm font-medium text-primary hover:underline">
          ← Account
        </Link>

        {adminLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading session…</p>
        ) : !configured && !isAdmin ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Supabase auth is not configured. Add env vars to use the admin analytics dashboard.
          </p>
        ) : !signedIn && !isAdmin ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Sign in with an admin account to continue.</p>
            <Link
              href="/login?redirect=/admin/analytics"
              className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </div>
        ) : !isAdmin ? (
          <div className="mt-8 rounded-2xl border border-danger/25 bg-card p-6">
            <p className="font-semibold text-foreground">Admin access required.</p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="mt-6 rounded-2xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <div className="mt-8">
              <AnalyticsDashboard
                data={data}
                range={range}
                airport={airport}
                onRangeChange={setRange}
                onAirportChange={setAirport}
                onRefresh={() => void loadDashboard()}
                refreshing={fetching}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
