import {
  classifyDestinationParking,
  destinationParkingHeadline,
  shouldSearchPaidParkingForTrip,
} from '../destinationParkingClassifier';

describe('destinationParkingClassifier', () => {
  test('Costco maps to free_likely customer parking with high confidence', () => {
    const result = classifyDestinationParking({ destination: 'Costco Wholesale, Issaquah' });

    expect(result.mode).toBe('free_likely');
    expect(result.accessType).toBe('customer_only');
    expect(result.confidence).toBe('high');
    expect(result.shouldSearchPaidParking).toBe(false);
    expect(destinationParkingHeadline(result.mode)).toBe('Parking likely free');
  });

  test('Safeway maps to free_likely', () => {
    const result = classifyDestinationParking({ destination: 'Safeway, Ballard' });

    expect(result.mode).toBe('free_likely');
    expect(result.shouldSearchPaidParking).toBe(false);
  });

  test('hiking trail maps to permit_possible', () => {
    const result = classifyDestinationParking({ destination: 'Mailbox Peak trailhead' });

    expect(result.mode).toBe('permit_possible');
    expect(result.accessType).toBe('trailhead_permit');
    expect(result.confidence).toBe('medium');
  });

  test('downtown stadium maps to paid_likely', () => {
    const result = classifyDestinationParking({ destination: 'Downtown Seattle stadium event' });

    expect(result.mode).toBe('paid_likely');
    expect(result.shouldSearchPaidParking).toBe(true);
  });

  test('restaurant maps to validated_possible', () => {
    const result = classifyDestinationParking({ destination: 'Waterfront restaurant' });

    expect(result.mode).toBe('validated_possible');
    expect(result.accessType).toBe('validated_customer');
  });

  test('office or corporate building maps to restricted_possible', () => {
    const office = classifyDestinationParking({ destination: 'PSE corporate headquarters campus' });
    const corporate = classifyDestinationParking({ destination: 'Corporate office building' });

    expect(office.mode).toBe('restricted_possible');
    expect(corporate.mode).toBe('restricted_possible');
  });

  test('airport destination kind maps to airport mode', () => {
    const result = classifyDestinationParking({
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
    });

    expect(result.mode).toBe('airport');
  });

  test('forcePaidParkingSearch overrides classifier skip', () => {
    expect(
      shouldSearchPaidParkingForTrip({
        destination: 'Costco Wholesale',
        forcePaidParkingSearch: true,
      }),
    ).toBe(true);
  });
});
