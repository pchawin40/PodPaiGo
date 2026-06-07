import { buildParkingOutlook } from '../parkingOutlook';
import { classifyDestinationParking } from '../destinationParkingClassifier';

describe('parkingOutlook', () => {
  test('Pike Place with freeParkingLot signal still avoids free customer outlook', () => {
    const outlook = buildParkingOutlook({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      googleParkingOptions: { freeParkingLot: true, freeStreetParking: true },
    });

    expect(outlook.status).not.toBe('free_customer_likely');
    expect(outlook.status).toBe('paid_parking_likely');
  });

  test('downtown Seattle office without freeParkingLot is not free customer likely', () => {
    const outlook = buildParkingOutlook({
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      googleParkingOptions: { freeStreetParking: true },
    });

    expect(outlook.status).not.toBe('free_customer_likely');
    expect(outlook.status).toBe('paid_parking_likely');
    expect(outlook.source).toBe('city_rule');
    expect(outlook.reason).toMatch(/weekdays during meter hours/i);
  });

  test('Google freeParkingLot drives free customer outlook with Google reason', () => {
    const outlook = buildParkingOutlook({
      destination: '123 Main Street, Bothell, WA',
      googleParkingOptions: { freeParkingLot: true },
    });

    expect(outlook.status).toBe('free_customer_likely');
    expect(outlook.source).toBe('google_parking_options');
    expect(outlook.reason).toContain('Google Places reports free customer parking');
  });

  test('freeStreetParking alone maps to street possible not customer parking', () => {
    const outlook = buildParkingOutlook({
      destination: 'Some place, Monroe, WA',
      googleParkingOptions: { freeStreetParking: true },
    });

    expect(outlook.status).toBe('free_street_possible');
    expect(outlook.status).not.toBe('free_customer_likely');
    expect(outlook.reason).toMatch(/not the same as confirmed customer lot parking/i);
  });

  test('Seattle Sunday adds free street parking today outlook', () => {
    const outlook = buildParkingOutlook({
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      durationMinutes: 120,
    });

    expect(outlook.status).toBe('free_street_possible');
    expect(outlook.appliesToday).toBe(true);
    expect(outlook.source).toBe('city_rule');
    expect(outlook.reason).toMatch(/Sunday street parking payment is generally not required/i);
    expect(outlook.hints).toContain('Seattle rule');
  });

  test('Seattle weekday downtown maps to paid parking likely', () => {
    const outlook = buildParkingOutlook({
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
    });

    expect(outlook.status).toBe('paid_parking_likely');
    expect(outlook.source).toBe('city_rule');
    expect(outlook.ruleDetails?.meterHours).toBe('Mon–Sat 8am–6pm');
  });

  test('Seattle holiday maps to free street parking today', () => {
    const outlook = buildParkingOutlook({
      destination: 'Downtown Seattle, WA',
      arrivalDate: '2026-07-04',
      arrivalTime: '11:00',
      durationMinutes: 120,
    });

    expect(outlook.status).toBe('free_street_possible');
    expect(outlook.appliesToday).toBe(true);
    expect(outlook.source).toBe('city_rule');
    expect(outlook.ruleDetails?.holidayName).toBe('Independence Day');
  });

  test('unknown destination uses not-confirmed outlook', () => {
    const outlook = buildParkingOutlook({
      destination: '123 Mystery Lane, Nowhere',
    });

    expect(outlook.status).toBe('parking_not_confirmed');
    expect(outlook.headline).toBe('Parking not confirmed yet');
    expect(outlook.reason).toContain('could not verify exact parking rules');
    expect(outlook.showSearchNearbyParking).toBe(true);
  });

  test('outlook includes reason, source, confidence, and caveat', () => {
    const outlook = buildParkingOutlook({
      destination: 'Costco Wholesale, Issaquah',
    });

    expect(outlook.reason).toBeTruthy();
    expect(outlook.source).toBe('destination_type_inference');
    expect(outlook.confidence).toBe('high');
    expect(outlook.caveat).toContain('Verify posted signs');
    expect(outlook.hints).toContain('Verify signs');
    expect(outlook.hints).toContain('High confidence');
  });

  test('airport classification stays on airport parking path', () => {
    const outlook = buildParkingOutlook({
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
    });

    expect(outlook.status).toBe('no_parking_needed');
    expect(outlook.headline).toBe('Airport parking rules apply');
    expect(classifyDestinationParking({ destinationKind: 'airport' }).mode).toBe('airport');
  });

  test('Monroe curated zone adds 4-hour limit hint', () => {
    const outlook = buildParkingOutlook({
      destination: 'Downtown Monroe, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 6 * 60,
    });

    expect(outlook.hints.some((hint) => hint.includes('4-hour limit'))).toBe(true);
  });

  test('paid google signal sets paid outlook title', () => {
    const outlook = buildParkingOutlook({
      destination: 'Event venue',
      googleParkingOptions: { paidGarageParking: true },
    });

    expect(outlook.status).toBe('paid_parking_likely');
    expect(outlook.showSearchNearbyParking).toBe(true);
  });

  test('diagnostics stay available for details panel', () => {
    const outlook = buildParkingOutlook({
      destination: '123 Mystery Lane',
    });

    expect(outlook.diagnostics.accessType).toBeTruthy();
    expect(outlook.diagnostics.confidence).toBe('Low confidence');
    expect(outlook.diagnostics.reason).toContain('Source:');
  });
});
