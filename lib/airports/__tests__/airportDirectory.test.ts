import {
  buildAirportDirectoryRecords,
  filterAirportDirectory,
  matchesAirportSearch,
  type AirportDirectoryRecord,
} from '../airportDirectory';

const SAMPLE_AIRPORTS: AirportDirectoryRecord[] = [
  {
    code: 'SEA',
    name: 'Seattle-Tacoma International Airport',
    city: 'Seattle',
    region: 'WA',
    country: 'United States',
    countryCode: 'US',
    slug: 'sea',
    status: 'active_planner',
    features: ['parking', 'rideshare', 'transit', 'tsa_clear', 'weather', 'companion'],
    notes: 'Active planner with companion card.',
  },
  {
    code: 'YVR',
    name: 'Vancouver International Airport',
    city: 'Vancouver',
    region: 'BC',
    country: 'Canada',
    countryCode: 'CA',
    slug: 'yvr',
    status: 'coming_soon',
    features: ['parking', 'rideshare'],
    notes: 'Canada expansion placeholder.',
  },
  {
    code: 'LAX',
    name: 'Los Angeles International Airport',
    city: 'Los Angeles',
    region: 'CA',
    country: 'United States',
    countryCode: 'US',
    slug: 'lax',
    status: 'coming_soon',
    features: ['parking', 'rideshare'],
    notes: null,
  },
];

describe('airportDirectory', () => {
  test('search by code works', () => {
    const filtered = filterAirportDirectory(SAMPLE_AIRPORTS, { query: 'SEA' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.code).toBe('SEA');
  });

  test('search by city works', () => {
    const filtered = filterAirportDirectory(SAMPLE_AIRPORTS, { query: 'Vancouver' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.city).toBe('Vancouver');
  });

  test('filter by country works', () => {
    const filtered = filterAirportDirectory(SAMPLE_AIRPORTS, { country: 'CA' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.countryCode).toBe('CA');
  });

  test('filter by state/province works', () => {
    const filtered = filterAirportDirectory(SAMPLE_AIRPORTS, { region: 'WA' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.region).toBe('WA');
  });

  test('empty state appears when no matches', () => {
    const filtered = filterAirportDirectory(SAMPLE_AIRPORTS, { query: 'ZZZZZZ' });
    expect(filtered).toHaveLength(0);
  });

  test('airport count updates with filters', () => {
    const all = SAMPLE_AIRPORTS.length;
    const usOnly = filterAirportDirectory(SAMPLE_AIRPORTS, { country: 'US' }).length;
    expect(all).toBe(3);
    expect(usOnly).toBe(2);
  });

  test('matchesAirportSearch supports country names', () => {
    expect(matchesAirportSearch(SAMPLE_AIRPORTS[1]!, 'Canada')).toBe(true);
  });

  test('search by full state name works', () => {
    const filtered = filterAirportDirectory(SAMPLE_AIRPORTS, { query: 'Washington' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.code).toBe('SEA');
  });

  test('buildAirportDirectoryRecords maps directory entries', () => {
    const records = buildAirportDirectoryRecords([
      {
        id: 'SEA',
        code: 'SEA',
        name: 'Seattle-Tacoma International Airport',
        city: 'Seattle',
        state: 'WA',
        description: 'Confirm terminal details before leaving.',
      },
    ]);

    expect(records[0]?.status).toBe('active_planner');
    expect(records[0]?.features).toContain('companion');
  });
});
