import { buildParkingOutlook } from '../parkingOutlook';
import { buildParkingOptionsHints } from '../googleParkingOptionsSignals';
import { evaluateLocalStreetParkingRules } from '../localParkingRules';
import { classifyDestinationParking } from '../destinationParkingClassifier';

describe('parkingOutlook', () => {
  test('unknown destination uses helpful not-confirmed copy', () => {
    const outlook = buildParkingOutlook({
      destination: '123 Mystery Lane, Nowhere',
    });

    expect(outlook.title).toBe('Parking not confirmed yet');
    expect(outlook.body).toContain('could not verify exact parking rules');
    expect(outlook.body).toContain('compare drive, transit, rideshare');
    expect(outlook.verifyNotice).toContain('Verify posted signs');
  });

  test('Google free customer lot signal drives outlook title', () => {
    const outlook = buildParkingOutlook({
      destination: 'Some place',
      googleParkingOptions: { freeParkingLot: true },
    });

    expect(outlook.title).toBe('Free customer parking likely');
    expect(outlook.body).toContain('Google Places suggests customer parking may be free');
  });

  test('Google paid and metered street signals map to separate hints', () => {
    const bundle = buildParkingOptionsHints({
      paidParkingLot: true,
      paidStreetParking: true,
    });

    expect(bundle.hints.map((hint) => hint.label)).toEqual([
      'Paid parking likely',
      'Metered street parking may be nearby',
    ]);
  });

  test('Monroe curated zone adds 4-hour limit hint', () => {
    const outlook = buildParkingOutlook({
      destination: 'Downtown Monroe, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 6 * 60,
    });

    expect(outlook.hints.some((hint) => hint.includes('4-hour limit'))).toBe(true);
    expect(
      evaluateLocalStreetParkingRules({
        destination: 'Downtown Monroe, WA',
        arrivalDate: '2026-06-02',
        arrivalTime: '10:00',
        durationMinutes: 6 * 60,
        isAirportTrip: false,
      }).detail,
    ).toContain('longer than the posted limit');
  });

  test('Seattle Sunday adds free street parking today hint', () => {
    const outlook = buildParkingOutlook({
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      durationMinutes: 120,
    });

    expect(outlook.hints).toContain('Free street parking may be available today');
    expect(
      evaluateLocalStreetParkingRules({
        destination: 'Capitol Hill, Seattle, WA',
        arrivalDate: '2026-06-07',
        arrivalTime: '11:00',
        durationMinutes: 120,
        isAirportTrip: false,
      }).headline,
    ).toBe('Free street parking may be available today');
  });

  test('airport classification stays on airport parking path', () => {
    const outlook = buildParkingOutlook({
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
    });

    expect(outlook.title).toBe('Airport parking rules apply');
    expect(classifyDestinationParking({ destinationKind: 'airport' }).mode).toBe('airport');
  });

  test('diagnostics stay available for details panel', () => {
    const outlook = buildParkingOutlook({
      destination: '123 Mystery Lane',
    });

    expect(outlook.diagnostics.accessType).toBeTruthy();
    expect(outlook.diagnostics.confidence).toBe('Not confirmed yet');
    expect(outlook.diagnostics.reason).toContain('could not infer parking rules');
  });

  test('unknown outlook encourages nearby parking search', () => {
    const outlook = buildParkingOutlook({
      destination: 'Unknown venue',
    });

    expect(outlook.showSearchNearbyParking).toBe(true);
  });

  test('paid likely google signal sets paid outlook title', () => {
    const outlook = buildParkingOutlook({
      destination: 'Event venue',
      googleParkingOptions: { paidGarageParking: true },
    });

    expect(outlook.title).toBe('Paid parking likely');
    expect(outlook.showSearchNearbyParking).toBe(true);
  });
});
