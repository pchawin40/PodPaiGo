import {
  buildAnalyticsDashboardModel,
  buildDashboardKpis,
  buildFunnelMetrics,
  countEventsByName,
  formatActivityFeedItem,
  summarizeDestinationCategories,
  summarizeParkingProviderClicks,
  summarizeTopAirports,
  type AnalyticsEventRow,
} from '../analyticsDashboard';

function event(
  partial: Partial<AnalyticsEventRow> & Pick<AnalyticsEventRow, 'event_name'>,
): AnalyticsEventRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    event_name: partial.event_name,
    event_properties: partial.event_properties ?? {},
    session_id: partial.session_id ?? 'sess-1',
    user_id: partial.user_id ?? null,
    anonymous_id: partial.anonymous_id ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
  };
}

describe('analyticsDashboard aggregations', () => {
  it('counts quick_go_submitted in KPIs', () => {
    const events = [
      event({ event_name: 'quick_go_submitted', event_properties: { airportCode: 'SEA' } }),
      event({ event_name: 'quick_go_submitted', event_properties: { airportCode: 'SEA' } }),
      event({ event_name: 'home_viewed' }),
    ];

    expect(buildDashboardKpis(events).quickGoSearches).toBe(2);
    expect(countEventsByName(events, 'quick_go_submitted')).toBe(2);
  });

  it('summarizes parking provider clicks', () => {
    const events = [
      event({
        event_name: 'parking_cta_clicked',
        event_properties: { provider: 'ParkWhiz', airportCode: 'SEA', placement: 'card' },
      }),
      event({
        event_name: 'parking_cta_clicked',
        event_properties: { provider: 'ParkWhiz', airportCode: 'SEA', placement: 'card' },
      }),
      event({
        event_name: 'parking_cta_clicked',
        event_properties: { provider: 'APR', airportCode: 'LAX', placement: 'modal' },
      }),
    ];

    const rows = summarizeParkingProviderClicks(events);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ provider: 'ParkWhiz', clicks: 2, airportCode: 'SEA' });
    expect(rows[1]).toMatchObject({ provider: 'APR', clicks: 1, airportCode: 'LAX' });
  });

  it('summarizes top airports', () => {
    const events = [
      event({ event_name: 'trip_form_submitted', event_properties: { airportCode: 'SEA' } }),
      event({ event_name: 'results_viewed', event_properties: { airportCode: 'SEA' } }),
      event({ event_name: 'parking_cta_clicked', event_properties: { airportCode: 'LAX' } }),
      event({ event_name: 'save_trip_completed', event_properties: { airportCode: 'SEA' } }),
    ];

    const rows = summarizeTopAirports(events);
    expect(rows[0].airportCode).toBe('SEA');
    expect(rows[0].searches).toBe(1);
    expect(rows[0].resultsViews).toBe(1);
    expect(rows[0].saves).toBe(1);
    expect(rows.find((row) => row.airportCode === 'LAX')?.parkingClicks).toBe(1);
  });

  it('renders zeros for empty analytics data', () => {
    const model = buildAnalyticsDashboardModel([], {
      range: '7d',
      rangeLabel: 'Last 7 days',
      airportFilter: null,
      lastEventAt: null,
    });

    expect(model.hasEvents).toBe(false);
    expect(model.kpis.sessions).toBe(0);
    expect(model.kpis.quickGoSearches).toBe(0);
    expect(model.topAirports).toEqual([]);
    expect(buildFunnelMetrics([]).every((step) => step.count === 0)).toBe(true);
  });

  it('redacts origin and home addresses from activity feed detail', () => {
    const feed = formatActivityFeedItem(
      event({
        event_name: 'trip_form_submitted',
        event_properties: {
          airportCode: 'SEA',
          originText: '123 Main St, Seattle',
          homeAddress: '456 Secret Ln',
          destinationCategory: 'grocery_or_retail',
          provider: 'ParkWhiz',
        },
      }),
    );

    expect(feed.detail).not.toMatch(/Main St/i);
    expect(feed.detail).not.toMatch(/Secret/i);
    expect(feed.detail).toContain('destinationCategory');
    expect(feed.airportCode).toBe('SEA');
  });

  it('summarizes destination categories', () => {
    const rows = summarizeDestinationCategories([
      event({
        event_name: 'results_viewed',
        event_properties: { destinationCategory: 'grocery_or_retail' },
      }),
      event({
        event_name: 'results_viewed',
        event_properties: { destinationCategory: 'grocery_or_retail' },
      }),
      event({
        event_name: 'results_viewed',
        event_properties: { destinationCategory: 'hotel' },
      }),
    ]);

    expect(rows[0]).toEqual({ category: 'grocery_or_retail', count: 2 });
  });
});
