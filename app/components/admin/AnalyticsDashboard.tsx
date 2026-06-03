'use client';

import type {
  AnalyticsDashboardData,
  AnalyticsDateRange,
  TopAirportRow,
} from '../../../lib/admin/analyticsDashboardTypes';
import AdminFilterBar from './AdminFilterBar';
import DashboardBarList from './DashboardBarList';
import DashboardTable from './DashboardTable';
import EventActivityFeed from './EventActivityFeed';
import FunnelCard from './FunnelCard';
import KpiCard from './KpiCard';
import StatusPill from '../ui/StatusPill';
import TravelCard from '../ui/TravelCard';

const DEFAULT_AIRPORTS = ['SEA', 'PAE', 'LAX', 'JFK', 'ORD', 'ATL', 'DFW', 'LAS', 'MCO'];

type AnalyticsDashboardProps = {
  data: AnalyticsDashboardData;
  range: AnalyticsDateRange;
  airport: string;
  onRangeChange: (range: AnalyticsDateRange) => void;
  onAirportChange: (airport: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
};

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ');
}

function formatLastEvent(iso: string | null): string {
  if (!iso) return 'No events recorded yet';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

export default function AnalyticsDashboard({
  data,
  range,
  airport,
  onRangeChange,
  onAirportChange,
  onRefresh,
  refreshing = false,
}: AnalyticsDashboardProps) {
  const airportOptions = [
    ...new Set([
      ...DEFAULT_AIRPORTS,
      ...data.topAirports.map((row) => row.airportCode),
    ]),
  ].sort();

  const { kpis } = data;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Admin · Analytics
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Analytics Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Understand how travelers use PodPaiGo.
          </p>
        </div>

        <AdminFilterBar
          range={range}
          airport={airport}
          airports={airportOptions}
          onRangeChange={onRangeChange}
          onAirportChange={onAirportChange}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />

        <p className="text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{data.rangeLabel}</span>
          {data.airportFilter ? (
            <>
              {' '}
              · filtered to <span className="font-semibold text-foreground">{data.airportFilter}</span>
            </>
          ) : null}
        </p>
      </header>

      {!data.hasEvents ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          {data.emptyMessage}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Sessions" value={kpis.sessions} helper="Distinct session or visitor keys" periodLabel={data.rangeLabel} />
        <KpiCard label="Results viewed" value={kpis.resultsViewed} periodLabel={data.rangeLabel} />
        <KpiCard label="Quick Go searches" value={kpis.quickGoSearches} periodLabel={data.rangeLabel} />
        <KpiCard label="Trip forms submitted" value={kpis.tripFormsSubmitted} periodLabel={data.rangeLabel} />
        <KpiCard label="Parking clicks" value={kpis.parkingClicks} periodLabel={data.rangeLabel} />
        <KpiCard label="Saved trips" value={kpis.savedTrips} periodLabel={data.rangeLabel} />
        <KpiCard label="Saved destinations" value={kpis.savedDestinations} periodLabel={data.rangeLabel} />
        <KpiCard label="Saved parking lots" value={kpis.savedParkingLots} periodLabel={data.rangeLabel} />
        <KpiCard label="Feedback reports" value={kpis.feedbackReports} periodLabel={data.rangeLabel} />
      </section>

      <FunnelCard steps={data.funnel} emptyLabel={data.emptyMessage} />

      <div className="grid gap-6 xl:grid-cols-2">
        <TravelCard>
          <h2 className="text-lg font-semibold text-foreground">Top airports</h2>
          <p className="mt-1 text-sm text-muted-foreground">Searches, results views, parking clicks, and saves.</p>
          <div className="mt-6">
            <DashboardTable<TopAirportRow>
              rows={data.topAirports}
              rowKey={(row) => row.airportCode}
              emptyLabel="No airport activity in this range."
              columns={[
                { key: 'airport', header: 'Airport', render: (row) => row.airportCode },
                { key: 'searches', header: 'Searches', render: (row) => row.searches },
                { key: 'results', header: 'Results', render: (row) => row.resultsViews },
                { key: 'parking', header: 'Parking', render: (row) => row.parkingClicks },
                { key: 'saves', header: 'Saves', render: (row) => row.saves },
              ]}
            />
          </div>
          <div className="mt-6">
            <DashboardBarList
              items={data.topAirports.map((row) => ({
                label: row.airportCode,
                value: row.total,
                meta: `${row.searches} searches`,
              }))}
              emptyLabel="No airport bars to show."
            />
          </div>
        </TravelCard>

        <TravelCard>
          <h2 className="text-lg font-semibold text-foreground">Top destination categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            airport, grocery_or_retail, office_or_workplace, hiking_or_park, and more.
          </p>
          <div className="mt-6">
            <DashboardBarList
              items={data.destinationCategories.map((row) => ({
                label: formatCategoryLabel(row.category),
                value: row.count,
              }))}
              emptyLabel="No destination categories in this range."
            />
          </div>
        </TravelCard>
      </div>

      <TravelCard>
        <h2 className="text-lg font-semibold text-foreground">Parking provider clicks</h2>
        <p className="mt-1 text-sm text-muted-foreground">Provider, clicks, airport, and placement.</p>
        <div className="mt-6">
          <DashboardTable
            rows={data.parkingProviderClicks}
            rowKey={(row) => `${row.provider}-${row.airportCode}-${row.placement}`}
            emptyLabel="No parking CTA clicks in this range."
            columns={[
              { key: 'provider', header: 'Provider', render: (row) => row.provider },
              { key: 'clicks', header: 'Clicks', render: (row) => row.clicks },
              { key: 'airport', header: 'Airport', render: (row) => row.airportCode },
              { key: 'placement', header: 'Placement', render: (row) => row.placement },
            ]}
          />
        </div>
      </TravelCard>

      <TravelCard>
        <h2 className="text-lg font-semibold text-foreground">Feedback reports</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total submitted" value={data.feedback.totalSubmitted} />
          <KpiCard label="Pending" value={data.feedback.pending} />
          <KpiCard label="Approved" value={data.feedback.approved} />
          <KpiCard label="Rejected" value={data.feedback.rejected} />
        </div>
        <div className="mt-6">
          <DashboardBarList
            items={data.feedback.byType.map((row) => ({
              label: formatCategoryLabel(row.type),
              value: row.count,
            }))}
            emptyLabel="No feedback types recorded in this range."
          />
        </div>
      </TravelCard>

      <EventActivityFeed items={data.recentActivity} emptyLabel={data.emptyMessage} />

      <TravelCard>
        <h2 className="text-lg font-semibold text-foreground">Data quality & safety</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime flags for external APIs and analytics storage.
        </p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ['Google Places', data.safety.googlePlacesEnabled],
            ['Google Photos', data.safety.googlePhotosEnabled],
            ['Google Reviews', data.safety.googleReviewsEnabled],
          ].map(([label, enabled]) => (
            <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <dt className="text-sm font-medium text-foreground">{label}</dt>
              <dd>
                <StatusPill tone={enabled ? 'warning' : 'success'}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </StatusPill>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <dt className="text-sm font-medium text-foreground">OpenAI provider mode</dt>
            <dd className="text-sm font-semibold text-foreground">{data.safety.openAiProviderMode}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <dt className="text-sm font-medium text-foreground">Analytics DB configured</dt>
            <dd>
              <StatusPill tone={data.safety.analyticsDbConfigured ? 'success' : 'muted'}>
                {data.safety.analyticsDbConfigured ? 'true' : 'false'}
              </StatusPill>
            </dd>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <dt className="text-sm font-medium text-foreground">Last event</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{formatLastEvent(data.safety.lastEventAt)}</dd>
          </div>
        </dl>
      </TravelCard>
    </div>
  );
}
