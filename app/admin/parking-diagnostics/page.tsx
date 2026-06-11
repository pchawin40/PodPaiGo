'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import TravelCard from '../../components/ui/TravelCard';
import { useAdminStatus } from '../../components/useAdminStatus';
import AdminNav from '../AdminNav';

type ProviderRow = {
  provider: string;
  displayName: string;
  status: string;
  enabled: boolean;
  resultsCount: number;
  livePriceCount: number;
  estimatedPriceCount: number;
  searchDurationMs: number;
  lastSuccess?: string;
  lastFailure?: string;
  healthMessage?: string;
};

type EnvRow = {
  provider: string;
  requiredEnv: string[];
  currentStatus: string;
  impact: string;
};

type DiagnosticsPayload = {
  diagnostics: {
    checkedAt: string;
    airportCode: string;
    envAudit: {
      providers: EnvRow[];
      summary: string;
    };
    providers: ProviderRow[];
    coverageSummary?: {
      mergedOptionCount: number;
      livePriceCount: number;
      coverageGrade: string;
      providerCount: number;
    };
  };
  setupChecklist: {
    title: string;
    items: Array<{
      id: string;
      title: string;
      local: string[];
      production: string[];
      verify: string;
    }>;
  };
  improvement: {
    summary: string;
    airports: Array<{
      airportCode: string;
      gradeBefore: string;
      gradeAfter: string;
      mergedBefore: number;
      mergedAfter: number;
      liveBefore: number;
      liveAfter: number;
    }>;
    stillBelowGradeB: string[];
    newlyAboveGradeB: string[];
  } | null;
};

function statusClass(status: string): string {
  switch (status) {
    case 'healthy':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'disabled':
      return 'border-zinc-200 bg-zinc-100 text-zinc-600';
    case 'missing_config':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'error':
      return 'border-red-200 bg-red-50 text-red-800';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-800';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'disabled':
      return 'Disabled';
    case 'missing_config':
      return 'Missing Config';
    case 'error':
      return 'Error';
    case 'degraded':
      return 'Degraded';
    default:
      return status;
  }
}

export default function ParkingDiagnosticsPage() {
  const {
    accessToken,
    configured,
    isAdmin,
    loading: adminLoading,
    signedIn,
  } = useAdminStatus();
  const [airportCode, setAirportCode] = useState('SEA');
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (code: string) => {
    if (!isAdmin) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/parking/diagnostics?airportCode=${encodeURIComponent(code)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error(`Diagnostics failed (${res.status})`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdmin]);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      void load(airportCode);
    }
  }, [adminLoading, airportCode, isAdmin, load]);

  async function runFullAudit() {
    if (!isAdmin) return;

    setAuditing(true);
    setError(null);

    try {
      const res = await fetch('/api/parking/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error(`Audit failed (${res.status})`);
      await load(airportCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditing(false);
    }
  }

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-6 py-14">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>
        <AdminNav className="mt-6" />

        <section className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Provider activation
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Parking provider diagnostics</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
            Validate environment configuration and live provider health using the existing registry.
          </p>
        </section>

        {!configured && !isAdmin ? (
          <TravelCard className="mt-6">
            <p className="text-sm text-muted-foreground">Supabase auth is not configured.</p>
          </TravelCard>
        ) : adminLoading ? (
          <TravelCard className="mt-6">
            <p className="text-sm text-muted-foreground">Loading session...</p>
          </TravelCard>
        ) : !signedIn && !isAdmin ? (
          <TravelCard className="mt-6">
            <p className="text-sm text-muted-foreground">Sign in with an admin account.</p>
            <Link
              href="/login?redirect=/admin/parking-diagnostics"
              className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </TravelCard>
        ) : !isAdmin ? (
          <TravelCard className="mt-6">
            <p className="font-semibold text-foreground">Admin access required.</p>
          </TravelCard>
        ) : null}

        {isAdmin ? (
        <section className="mt-8 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Probe airport</span>
            <select
              className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={airportCode}
              onChange={(e) => setAirportCode(e.target.value)}
            >
              {['SEA', 'PAE', 'LAX', 'JFK', 'ORD', 'ATL', 'DFW', 'LAS', 'MCO'].map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => load(airportCode)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium"
            disabled={loading}
          >
            Refresh probe
          </button>

          <button
            type="button"
            onClick={runFullAudit}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white"
            disabled={auditing}
          >
            {auditing ? 'Running hub audit…' : 'Run full coverage audit'}
          </button>
        </section>
        ) : null}

        {isAdmin && error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {isAdmin && loading && !data && (
          <p className="mt-8 text-sm text-slate-600">Loading diagnostics…</p>
        )}

        {isAdmin && data && (
          <>
            {data.diagnostics.coverageSummary && (
              <section className="mt-8 grid gap-4 md:grid-cols-4">
                {[
                  ['Grade', data.diagnostics.coverageSummary.coverageGrade],
                  ['Merged options', String(data.diagnostics.coverageSummary.mergedOptionCount)],
                  ['Live prices', String(data.diagnostics.coverageSummary.livePriceCount)],
                  ['Active providers', String(data.diagnostics.coverageSummary.providerCount)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-2 text-2xl font-semibold">{value}</div>
                  </div>
                ))}
              </section>
            )}

            <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">Environment requirements</h2>
              <p className="mt-2 text-sm text-slate-600">{data.diagnostics.envAudit.summary}</p>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Provider</th>
                      <th className="py-2 pr-4">Required ENV</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diagnostics.envAudit.providers.map((row) => (
                      <tr key={row.provider} className="border-b border-slate-100 align-top">
                        <td className="py-3 pr-4 font-medium">{row.provider}</td>
                        <td className="py-3 pr-4 text-slate-600">{row.requiredEnv.join(', ') || '—'}</td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(row.currentStatus)}`}>
                            {statusLabel(row.currentStatus)}
                          </span>
                        </td>
                        <td className="py-3 text-slate-600">{row.impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">Live provider probe ({data.diagnostics.airportCode})</h2>
              <p className="mt-2 text-sm text-slate-600">
                Checked {new Date(data.diagnostics.checkedAt).toLocaleString()}
              </p>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Provider</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Results</th>
                      <th className="py-2 pr-4">Duration</th>
                      <th className="py-2 pr-4">Last success</th>
                      <th className="py-2">Last failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diagnostics.providers.map((row) => (
                      <tr key={row.provider} className="border-b border-slate-100 align-top">
                        <td className="py-3 pr-4 font-medium">{row.displayName}</td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-4">{row.resultsCount} ({row.livePriceCount} live)</td>
                        <td className="py-3 pr-4">{row.searchDurationMs} ms</td>
                        <td className="py-3 pr-4 text-slate-600">{row.lastSuccess ? new Date(row.lastSuccess).toLocaleString() : '—'}</td>
                        <td className="py-3 text-slate-600">{row.lastFailure || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">{data.setupChecklist.title}</h2>
              <div className="mt-6 space-y-6">
                {data.setupChecklist.items.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Local</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                      {item.local.map((step) => <li key={step}>{step}</li>)}
                    </ul>
                    <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Production</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                      {item.production.map((step) => <li key={step}>{step}</li>)}
                    </ul>
                    <p className="mt-3 text-sm text-slate-600"><strong>Verify:</strong> {item.verify}</p>
                  </article>
                ))}
              </div>
            </section>

            {data.improvement && (
              <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-semibold">Coverage before vs after</h2>
                <p className="mt-2 text-sm text-slate-600">{data.improvement.summary}</p>
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4">Airport</th>
                        <th className="py-2 pr-4">Grade</th>
                        <th className="py-2 pr-4">Merged</th>
                        <th className="py-2">Live</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.improvement.airports.map((row) => (
                        <tr key={row.airportCode} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{row.airportCode}</td>
                          <td className="py-3 pr-4">{row.gradeBefore} → {row.gradeAfter}</td>
                          <td className="py-3 pr-4">{row.mergedBefore} → {row.mergedAfter}</td>
                          <td className="py-3">{row.liveBefore} → {row.liveAfter}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  Still below B: {data.improvement.stillBelowGradeB.join(', ') || 'none'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Newly B+: {data.improvement.newlyAboveGradeB.join(', ') || 'none'}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
