import { airportLookupService } from '../lookupService';
import bundledAirports from '../../../data/airports-us.generated.json';
import type { NationalAirportRecord } from '../records';

describe('national airport search catalog', () => {
  beforeAll(() => {
    airportLookupService.loadRecords(bundledAirports as NationalAirportRecord[]);
  });

  it('loads the full bundled U.S. catalog', () => {
    expect(airportLookupService.getAllRecords().length).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ['LAX', 'LAX'],
    ['JFK', 'JFK'],
    ['ORD', 'ORD'],
    ['ATL', 'ATL'],
    ['DFW', 'DFW'],
    ['MCO', 'MCO'],
    ['BOS', 'BOS'],
    ['SFO', 'SFO'],
    ['DEN', 'DEN'],
    ['PHX', 'PHX'],
    ['Nashville', 'BNA'],
    ['Minneapolis', 'MSP'],
    ['Anchorage', 'ANC'],
    ['Honolulu', 'HNL'],
  ])('finds %s as top result for query %s', (query, expectedId) => {
    const results = airportLookupService.searchAirports(query, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe(expectedId);
  });

  it('does not return unrelated airports for exact IATA queries', () => {
    const results = airportLookupService.searchAirports('LAX', 5);
    expect(results.map((airport) => airport.id)).toEqual(['LAX']);
  });

  it('returns popular airports for empty query', () => {
    const results = airportLookupService.searchAirports('', 20);
    expect(results.map((airport) => airport.id)).toContain('SEA');
    expect(results.map((airport) => airport.id)).toContain('LAX');
    expect(results.length).toBe(20);
  });
});
