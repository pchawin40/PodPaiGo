import {
  classifyDestinationParking,
  destinationParkingHeadline,
  inferDestinationCategory,
  shouldSearchPaidParkingForTrip,
} from '../destinationParkingClassifier';
import { EVENT_PARKING_OUTLOOK_COPY } from '../eventVenueDetection';

describe('destinationParkingClassifier', () => {
  test('Costco maps to free_likely customer parking with high confidence', () => {
    const result = classifyDestinationParking({ destination: 'Costco Wholesale, Issaquah' });

    expect(result.mode).toBe('free_likely');
    expect(result.accessType).toBe('customer_only');
    expect(result.confidence).toBe('high');
    expect(result.shouldSearchPaidParking).toBe(false);
    expect(destinationParkingHeadline(result.mode)).toBe('Parking likely free at destination');
  });

  test('Safeway maps to free_likely', () => {
    const result = classifyDestinationParking({ destination: 'Safeway, Ballard' });

    expect(result.mode).toBe('free_likely');
    expect(result.shouldSearchPaidParking).toBe(false);
  });

  test('Fred Meyer maps to free_likely with high confidence', () => {
    const result = classifyDestinationParking({ destination: 'Fred Meyer, Monroe' });

    expect(result.mode).toBe('free_likely');
    expect(result.confidence).toBe('high');
    expect(result.shouldSearchPaidParking).toBe(false);
  });

  test('QFC and Whole Foods map to free_likely', () => {
    expect(classifyDestinationParking({ destination: 'QFC Kirkland' }).mode).toBe('free_likely');
    expect(classifyDestinationParking({ destination: 'Whole Foods Bellevue' }).mode).toBe(
      'free_likely',
    );
    expect(classifyDestinationParking({ destination: "Trader Joe's Seattle" }).mode).toBe(
      'free_likely',
    );
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

  test('Lumen Field maps to event_only paid_likely', () => {
    const result = classifyDestinationParking({ destination: 'Lumen Field, Seattle, WA' });

    expect(result.mode).toBe('paid_likely');
    expect(result.accessType).toBe('event_only');
    expect(result.reason).toBe(EVENT_PARKING_OUTLOOK_COPY);
    expect(inferDestinationCategory({ destination: 'Lumen Field, Seattle, WA' })).toBe(
      'stadium_event_venue',
    );
  });

  test('T-Mobile Park and Climate Pledge Arena trigger event venue classification', () => {
    expect(classifyDestinationParking({ destination: 'T-Mobile Park, Seattle, WA' }).accessType).toBe(
      'event_only',
    );
    expect(
      classifyDestinationParking({ destination: 'Climate Pledge Arena, Seattle, WA' }).accessType,
    ).toBe('event_only');
  });

  test('Seahawks game origin with venue destination triggers event mode', () => {
    const result = classifyDestinationParking({
      destination: 'Lumen Field, Seattle, WA',
      origin: 'Bellevue Seahawks game',
    });

    expect(result.accessType).toBe('event_only');
  });

  test('Pike Place Market maps to paid_likely', () => {
    const result = classifyDestinationParking({ destination: 'Pike Place Market' });

    expect(result.mode).toBe('paid_likely');
  });

  test('restaurant maps to likely on-site or street parking expectation', () => {
    const result = classifyDestinationParking({ destination: 'Waterfront restaurant' });

    expect(result.mode).toBe('free_likely');
    expect(result.accessType).toBe('customer_only');
    expect(result.reason).toMatch(/on-site or nearby street parking/i);
  });

  test('office or corporate building maps to restricted_possible', () => {
    const office = classifyDestinationParking({ destination: 'PSE corporate headquarters campus' });
    const corporate = classifyDestinationParking({ destination: 'Corporate office building' });

    expect(office.mode).toBe('restricted_possible');
    expect(corporate.mode).toBe('restricted_possible');
  });

  test('Fred Meyer full address maps to grocery_or_retail free parking', () => {
    const destination = 'Fred Meyer, U.S. 2, Monroe, WA, USA';
    const result = classifyDestinationParking({ destination, airportCode: 'SEA' });

    expect(result.mode).toBe('free_likely');
    expect(result.confidence).toBe('high');
    expect(inferDestinationCategory({ destination })).toBe('grocery_or_retail');
    expect(result.reason).toMatch(/Customer parking likely available/i);
  });

  test('pharmacy chains map to free_likely', () => {
    expect(classifyDestinationParking({ destination: 'Walgreens Seattle' }).mode).toBe('free_likely');
    expect(classifyDestinationParking({ destination: 'CVS Pharmacy' }).mode).toBe('free_likely');
    expect(classifyDestinationParking({ destination: 'Rite Aid Everett' }).mode).toBe('free_likely');
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
