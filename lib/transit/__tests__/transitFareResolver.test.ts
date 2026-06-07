import { formatTransitCostDisplay } from '../transitPricing';
import { isKnownTransitFare, resolveTransitFare } from '../transitFareResolver';
import type { TransitOption, TripData } from '../../types';

describe('resolveTransitFare', () => {
  test('Austin destination resolves to CapMetro $1.25', () => {
    const fare = resolveTransitFare({
      origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
      destination: 'Franklin Barbecue, Austin TX',
    });

    expect(fare.matchKind).toBe('city');
    expect(fare.oneWayDollars).toBe(1.25);
    expect(fare.agencyName).toBe('CapMetro');
    expect(fare.fareLabel).toBe('Austin transit fare estimate: ~$1.25 one-way');
  });

  test('CapMetro rail resolves to commuter $3.50 fare', () => {
    const fare = resolveTransitFare({
      agencyName: 'CapMetro',
      serviceModes: ['light_rail'],
    });

    expect(fare.matchKind).toBe('agency');
    expect(fare.oneWayDollars).toBe(3.5);
    expect(fare.fareLabel).toBe('CapMetro local fare: $3.50 one-way');
  });

  test('Seattle region resolves to local fare estimate around $3.00', () => {
    const fare = resolveTransitFare({
      origin: 'Bellevue, WA',
      destination: 'Pike Place Market, Seattle, WA',
    });

    expect(fare.matchKind).toBe('city');
    expect(fare.oneWayDollars).toBe(3);
    expect(fare.city).toBe('Seattle');
    expect(fare.fareLabel).toContain('Seattle transit fare estimate');
  });

  test('Sound Transit agency resolves with agency label', () => {
    const fare = resolveTransitFare({
      agencyName: 'Sound Transit',
      destination: 'SeaTac Airport',
    });

    expect(fare.matchKind).toBe('agency');
    expect(fare.oneWayDollars).toBe(3);
    expect(fare.fareLabel).toBe('Sound Transit local fare: $3 one-way');
  });

  test('Los Angeles resolves to LA Metro $1.75', () => {
    const fare = resolveTransitFare({
      destination: 'Hollywood Bowl, Los Angeles, CA',
    });

    expect(fare.oneWayDollars).toBe(1.75);
    expect(fare.city).toBe('Los Angeles');
  });

  test('NYC resolves to MTA $3.00', () => {
    const fare = resolveTransitFare({
      destination: 'Times Square, Manhattan, New York, NY',
    });

    expect(fare.oneWayDollars).toBe(3);
    expect(fare.agencyName).toBe('MTA');
  });

  test('unknown city does not fall back to Seattle pricing', () => {
    const fare = resolveTransitFare({
      origin: 'Downtown Boise, ID',
      destination: 'Neighborhood Cafe, Boise, ID',
    });

    expect(fare.matchKind).toBe('unknown');
    expect(fare.oneWayDollars).toBeNull();
    expect(fare.fareLabel).toBe('Check transit fare');
    expect(isKnownTransitFare(fare)).toBe(false);
  });
});

describe('formatTransitCostDisplay with resolved fares', () => {
  const tripData = {
    type: 'general-trip',
    origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
    destination: 'Franklin Barbecue, Austin TX',
    arrivalDate: '2026-06-07',
    arrivalTime: '11:00',
    transportAvailability: 'all',
  } satisfies TripData;

  test('shows Austin fare label instead of universal $3.25 copy', () => {
    const fare = resolveTransitFare({
      origin: tripData.origin,
      destination: tripData.destination,
    });

    const transit: TransitOption = {
      id: 'regional-transit',
      name: 'Transit route to destination',
      price: fare.oneWayDollars ?? 0,
      duration: 48,
      frequency: 15,
      trustStatus: 'estimated',
      sourceName: 'CapMetro',
      lastUpdated: '2026-06-01T00:00:00Z',
      assumptions: [],
      transitFareResolution: fare,
    };

    const display = formatTransitCostDisplay(transit, tripData);

    expect(display.primary).toBe('Austin transit fare estimate: ~$1.25 one-way');
    expect(display.primary).not.toContain('3.25');
  });

  test('unknown fare shows check-transit copy', () => {
    const fare = resolveTransitFare({
      destination: 'Neighborhood Cafe, Boise, ID',
    });

    const transit: TransitOption = {
      id: 'regional-transit',
      name: 'Transit route to destination',
      price: 0,
      duration: 48,
      frequency: 15,
      trustStatus: 'estimated',
      sourceName: 'Google Maps transit directions',
      lastUpdated: '2026-06-01T00:00:00Z',
      assumptions: [],
      transitFareResolution: fare,
    };

    const display = formatTransitCostDisplay(transit, tripData);

    expect(display.primary).toBe('Check transit fare');
    expect(display.secondary).toBe('Fare varies by agency');
  });
});
