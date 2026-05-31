import { looksLikeParkingOrTransitName } from '../airportSearch';
import { resolveParkingPricing } from '../../../../pricingResolver';

describe('Google airport parking discovery helpers', () => {
  test('allows park-and-ride and transit center names', () => {
    expect(looksLikeParkingOrTransitName('Northgate Transit Center')).toBe(true);
    expect(looksLikeParkingOrTransitName('Angle Lake Park & Ride')).toBe(true);
    expect(looksLikeParkingOrTransitName('SeaTac Link Station Parking')).toBe(true);
    expect(looksLikeParkingOrTransitName('Airport Shuttle Parking Lot')).toBe(true);
  });

  test('blocks clearly unrelated businesses', () => {
    expect(looksLikeParkingOrTransitName('Joe\'s Coffee Shop')).toBe(false);
    expect(looksLikeParkingOrTransitName('Shell Gas Station')).toBe(false);
    expect(looksLikeParkingOrTransitName('Planet Fitness')).toBe(false);
  });

  test('uses lower estimated band for park-and-ride lots', () => {
    const pricing = resolveParkingPricing({
      airportCode: 'SEA',
      lotName: 'Northgate Transit Center Parking',
      lotKind: 'park-and-ride',
    });

    expect(pricing.priceMin).toBe(5);
    expect(pricing.priceMax).toBe(15);
    expect(pricing.priceDisplay).toBe('estimated');
  });

  test('uses wider off-airport estimated band for unknown google lots', () => {
    const pricing = resolveParkingPricing({
      airportCode: 'LAX',
      lotName: 'Off Airport Parking Garage',
      lotKind: 'off-airport',
    });

    expect(pricing.priceMin).toBe(12);
    expect(pricing.priceMax).toBe(28);
    expect(pricing.priceDisplay).toBe('estimated');
  });
});
