import { getAiAssistantProvider } from '../ai/tripParseConfig';
import { getEffectiveGooglePlacesConfig } from '../parking/googlePlacesConfig';
import { getDb } from '../db/client';
import type {
  ActivityFeedItem,
  AnalyticsDashboardData,
  AnalyticsDashboardParams,
  AnalyticsDateRange,
  AnalyticsEventRow,
  DashboardKpis,
  DestinationCategoryRow,
  FeedbackSummary,
  FunnelStep,
  ParkingProviderClickRow,
  TopAirportRow,
} from './analyticsDashboardTypes';

export type {
  ActivityFeedItem,
  AnalyticsDashboardData,
  AnalyticsDashboardParams,
  AnalyticsDateRange,
  AnalyticsEventRow,
  DashboardKpis,
  DestinationCategoryRow,
  FeedbackSummary,
  FunnelStep,
  ParkingProviderClickRow,
  TopAirportRow,
} from './analyticsDashboardTypes';

const SEARCH_EVENTS = new Set(['quick_go_submitted', 'trip_form_submitted']);
const SAVE_EVENTS = new Set([
  'save_trip_completed',
  'save_destination_clicked',
  'save_parking_lot_clicked',
]);

const SENSITIVE_PROPERTY_KEYS = new Set([
  'email',
  'phone',
  'password',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'origintext',
  'originaddress',
  'homeaddress',
  'fulladdress',
  'streetaddress',
  'destinationtext',
]);

export function isAnalyticsDbConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL?.trim() || process.env.LOCAL_DATABASE_URL?.trim(),
  );
}

export function getDateRangeWindow(range: AnalyticsDateRange, now = new Date()): {
  start: Date | null;
  end: Date;
  label: string;
} {
  const end = now;

  switch (range) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: 'Today' };
    }
    case '7d': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end, label: 'Last 7 days' };
    }
    case '30d': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end, label: 'Last 30 days' };
    }
    case 'all':
    default:
      return { start: null, end, label: 'All time' };
  }
}

export function countEventsByName(
  events: AnalyticsEventRow[],
  names: string | string[],
): number {
  const set = new Set(Array.isArray(names) ? names : [names]);
  return events.filter((event) => set.has(event.event_name)).length;
}

function countDistinctSessions(events: AnalyticsEventRow[]): number {
  const keys = new Set<string>();
  for (const event of events) {
    const key =
      event.session_id?.trim() ||
      event.anonymous_id?.trim() ||
      event.user_id?.trim() ||
      event.id;
    if (key) keys.add(key);
  }
  return keys.size;
}

function readProp(event: AnalyticsEventRow, ...keys: string[]): string | null {
  const props = event.event_properties ?? {};
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readAirportCode(event: AnalyticsEventRow): string | null {
  const code = readProp(event, 'airportCode', 'airport_code');
  return code ? code.toUpperCase() : null;
}

export function summarizeTopAirports(events: AnalyticsEventRow[]): TopAirportRow[] {
  const map = new Map<string, TopAirportRow>();

  const ensure = (code: string): TopAirportRow => {
    const existing = map.get(code);
    if (existing) return existing;
    const row: TopAirportRow = {
      airportCode: code,
      searches: 0,
      resultsViews: 0,
      parkingClicks: 0,
      saves: 0,
      total: 0,
    };
    map.set(code, row);
    return row;
  };

  for (const event of events) {
    const code = readAirportCode(event);
    if (!code) continue;

    const row = ensure(code);
    if (SEARCH_EVENTS.has(event.event_name)) row.searches += 1;
    if (event.event_name === 'results_viewed') row.resultsViews += 1;
    if (event.event_name === 'parking_cta_clicked') row.parkingClicks += 1;
    if (SAVE_EVENTS.has(event.event_name)) row.saves += 1;
    row.total =
      row.searches + row.resultsViews + row.parkingClicks + row.saves;
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function summarizeDestinationCategories(
  events: AnalyticsEventRow[],
): DestinationCategoryRow[] {
  const map = new Map<string, number>();

  for (const event of events) {
    const category = readProp(event, 'destinationCategory', 'destination_category');
    if (!category) continue;
    const key = category.toLowerCase();
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function summarizeParkingProviderClicks(
  events: AnalyticsEventRow[],
): ParkingProviderClickRow[] {
  const map = new Map<string, ParkingProviderClickRow>();

  for (const event of events) {
    if (event.event_name !== 'parking_cta_clicked') continue;

    const provider = readProp(event, 'provider') ?? 'Unknown';
    const airportCode = readAirportCode(event) ?? '—';
    const placement = readProp(event, 'placement', 'ctaPlacement') ?? '—';
    const key = `${provider}|${airportCode}|${placement}`;
    const existing = map.get(key);

    if (existing) {
      existing.clicks += 1;
    } else {
      map.set(key, { provider, clicks: 1, airportCode, placement });
    }
  }

  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}

export function summarizeFeedbackReports(
  events: AnalyticsEventRow[],
  dbCounts?: { pending: number; approved: number; rejected: number },
): FeedbackSummary {
  const submitted = countEventsByName(events, 'parking_report_submitted');
  const typeMap = new Map<string, number>();

  for (const event of events) {
    if (
      event.event_name !== 'parking_report_type_selected' &&
      event.event_name !== 'parking_report_submitted'
    ) {
      continue;
    }

    const type = readProp(event, 'reportType', 'report_type', 'type');
    if (!type) continue;
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
  }

  return {
    totalSubmitted: submitted,
    pending: dbCounts?.pending ?? 0,
    approved: dbCounts?.approved ?? 0,
    rejected: dbCounts?.rejected ?? 0,
    byType: [...typeMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function buildFunnelMetrics(events: AnalyticsEventRow[]): FunnelStep[] {
  const homeViewed = countEventsByName(events, 'home_viewed');
  const flowStarted =
    countEventsByName(events, 'trip_planner_started') +
    countEventsByName(events, 'quick_go_started');
  const resultsViewed = countEventsByName(events, 'results_viewed');
  const parkingCta = countEventsByName(events, 'parking_cta_clicked');
  const saved =
    countEventsByName(events, 'save_trip_completed') +
    countEventsByName(events, 'save_destination_clicked') +
    countEventsByName(events, 'save_parking_lot_clicked');

  const top = Math.max(homeViewed, flowStarted, resultsViewed, parkingCta, saved, 1);

  const steps: Array<{ key: string; label: string; count: number }> = [
    { key: 'home', label: 'Home viewed', count: homeViewed },
    { key: 'started', label: 'Trip / Quick Go started', count: flowStarted },
    { key: 'results', label: 'Results viewed', count: resultsViewed },
    { key: 'parking', label: 'Parking CTA clicked', count: parkingCta },
    { key: 'save', label: 'Saved trip / destination', count: saved },
  ];

  return steps.map((step) => ({
    ...step,
    percentOfTop: Math.round((step.count / top) * 100),
  }));
}

export function buildDashboardKpis(events: AnalyticsEventRow[]): DashboardKpis {
  return {
    sessions: countDistinctSessions(events),
    resultsViewed: countEventsByName(events, 'results_viewed'),
    quickGoSearches: countEventsByName(events, 'quick_go_submitted'),
    tripFormsSubmitted: countEventsByName(events, 'trip_form_submitted'),
    parkingClicks: countEventsByName(events, 'parking_cta_clicked'),
    savedTrips: countEventsByName(events, 'save_trip_completed'),
    savedDestinations: countEventsByName(events, 'save_destination_clicked'),
    savedParkingLots: countEventsByName(events, 'save_parking_lot_clicked'),
    feedbackReports: countEventsByName(events, 'parking_report_submitted'),
  };
}

function sanitizeDetailValue(key: string, value: unknown): string | null {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (SENSITIVE_PROPERTY_KEYS.has(normalized)) return null;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > 80) return `${text.slice(0, 77)}…`;
  if (text.includes('@') && normalized.includes('email')) return null;
  return text;
}

export function formatActivityFeedItem(event: AnalyticsEventRow): ActivityFeedItem {
  const airportCode = readAirportCode(event);
  const destinationCategory = readProp(event, 'destinationCategory', 'destination_category');
  const city = readProp(event, 'city', 'region');
  const region = readProp(event, 'region', 'country');
  const cityRegion = [city, region].filter(Boolean).join(', ') || null;
  const provider = readProp(event, 'provider');
  const lotName = readProp(event, 'lotName', 'lot_name');

  const safeDetails: string[] = [];
  for (const [key, value] of Object.entries(event.event_properties ?? {})) {
    const sanitized = sanitizeDetailValue(key, value);
    if (sanitized) safeDetails.push(`${key}: ${sanitized}`);
  }

  return {
    id: event.id,
    at: event.created_at,
    eventName: event.event_name,
    airportCode,
    destinationCategory,
    cityRegion,
    provider,
    lotName,
    actorLabel: event.user_id ? 'user' : 'anonymous',
    detail: safeDetails.length > 0 ? safeDetails.slice(0, 3).join(' · ') : null,
  };
}

export function buildRecentActivityFeed(
  events: AnalyticsEventRow[],
  limit = 25,
): ActivityFeedItem[] {
  return [...events]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map(formatActivityFeedItem);
}

export function buildAnalyticsDashboardModel(
  events: AnalyticsEventRow[],
  input: {
    range: AnalyticsDateRange;
    rangeLabel: string;
    airportFilter: string | null;
    lastEventAt: string | null;
    feedbackDb?: { pending: number; approved: number; rejected: number };
  },
): AnalyticsDashboardData {
  const google = getEffectiveGooglePlacesConfig();
  const hasEvents = events.length > 0;

  return {
    range: input.range,
    rangeLabel: input.rangeLabel,
    airportFilter: input.airportFilter,
    hasEvents,
    emptyMessage:
      'No analytics events yet. Events will appear here after users start planning trips.',
    kpis: buildDashboardKpis(events),
    funnel: buildFunnelMetrics(events),
    topAirports: summarizeTopAirports(events),
    destinationCategories: summarizeDestinationCategories(events),
    parkingProviderClicks: summarizeParkingProviderClicks(events),
    feedback: summarizeFeedbackReports(events, input.feedbackDb),
    recentActivity: buildRecentActivityFeed(events),
    safety: {
      googlePlacesEnabled: google.livePlacesEnabled,
      googlePhotosEnabled: google.livePhotosEnabled,
      googleReviewsEnabled: google.liveReviewsEnabled,
      openAiProviderMode: getAiAssistantProvider(),
      analyticsDbConfigured: isAnalyticsDbConfigured(),
      lastEventAt: input.lastEventAt,
    },
  };
}

async function fetchAnalyticsEvents(
  window: ReturnType<typeof getDateRangeWindow>,
  airportCode?: string | null,
): Promise<AnalyticsEventRow[]> {
  if (!isAnalyticsDbConfigured()) return [];

  const params: unknown[] = [];
  let where = 'where 1=1';

  if (window.start) {
    params.push(window.start.toISOString());
    where += ` and created_at >= $${params.length}`;
  }

  if (airportCode?.trim()) {
    params.push(airportCode.trim().toUpperCase());
    where += ` and upper(coalesce(event_properties->>'airportCode', event_properties->>'airport_code', '')) = $${params.length}`;
  }

  const sql = `
    select
      id::text,
      event_name,
      coalesce(event_properties, '{}'::jsonb) as event_properties,
      session_id,
      user_id::text,
      anonymous_id,
      created_at::text
    from public.analytics_events
    ${where}
    order by created_at desc
    limit 5000
  `;

  try {
    const result = await getDb().query(sql, params);
    return result.rows.map((row) => ({
      id: String(row.id),
      event_name: String(row.event_name),
      event_properties:
        typeof row.event_properties === 'object' && row.event_properties !== null
          ? (row.event_properties as Record<string, unknown>)
          : {},
      session_id: row.session_id ? String(row.session_id) : null,
      user_id: row.user_id ? String(row.user_id) : null,
      anonymous_id: row.anonymous_id ? String(row.anonymous_id) : null,
      created_at: String(row.created_at),
    }));
  } catch {
    return [];
  }
}

async function fetchFeedbackDbCounts(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
} | undefined> {
  if (!isAnalyticsDbConfigured()) return undefined;

  try {
    const result = await getDb().query(`
      select
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'approved')::int as approved,
        count(*) filter (where status = 'rejected')::int as rejected
      from public.parking_validation_reports
    `);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
    };
  } catch {
    return undefined;
  }
}

async function fetchLastEventAt(): Promise<string | null> {
  if (!isAnalyticsDbConfigured()) return null;

  try {
    const result = await getDb().query(
      `select created_at::text as created_at from public.analytics_events order by created_at desc limit 1`,
    );
    return result.rows[0]?.created_at ? String(result.rows[0].created_at) : null;
  } catch {
    return null;
  }
}

export async function getAnalyticsDashboardData(
  params: AnalyticsDashboardParams,
): Promise<AnalyticsDashboardData> {
  const window = getDateRangeWindow(params.range);
  const airportFilter = params.airportCode?.trim().toUpperCase() || null;

  const [events, feedbackDb, lastEventAt] = await Promise.all([
    fetchAnalyticsEvents(window, airportFilter),
    fetchFeedbackDbCounts(),
    fetchLastEventAt(),
  ]);

  return buildAnalyticsDashboardModel(events, {
    range: params.range,
    rangeLabel: window.label,
    airportFilter,
    lastEventAt,
    feedbackDb,
  });
}
