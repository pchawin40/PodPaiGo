import {
  buildDistanceBandRouteEstimate,
  buildRideshareEstimateOptions,
  formatRidesharePriceDisplay,
  isRideshareRoundTripEstimate,
  resolveOriginDistanceBand,
} from '../lib/rideshare/estimate';
import type { TripData } from '../lib/types';

const MONROE_ORIGIN = 'Monroe, WA 98272';
const SEA_DESTINATION = 'Seattle-Tacoma International Airport';

function monroeRouteEstimate() {
  const band = resolveOriginDistanceBand(MONROE_ORIGIN, 'SEA');
  return buildDistanceBandRouteEstimate(MONROE_ORIGIN, SEA_DESTINATION, band);
}

function buildMonroeEstimates(tripData?: TripData) {
  return buildRideshareEstimateOptions({
    origin: MONROE_ORIGIN,
    destination: SEA_DESTINATION,
    routeEstimate: monroeRouteEstimate(),
    directionsUrl: 'https://maps.example/directions',
    uberUrl: 'https://uber.example',
    lyftUrl: 'https://lyft.example',
    taxiSearchUrl: 'https://maps.example/taxi',
    departureDateTime: '2026-06-01T06:00:00',
    airportCode: 'SEA',
    tripData,
  });
}

describe('rideshare estimate model', () => {
  test('Monroe → SEA one-way UberX is in a realistic market range', () => {
    const options = buildMonroeEstimates();
    const uber = options.find((option) => option.id === 'uber');

    expect(uber).toBeDefined();
    expect(uber!.rideshareTripScope).toBe('one-way');
    expect(uber!.priceMin).toBeGreaterThanOrEqual(100);
    expect(uber!.priceMax).toBeLessThanOrEqual(220);
    expect(uber!.price).toBeGreaterThanOrEqual(105);
    expect(uber!.price).toBeLessThanOrEqual(145);

    const observedMarketOneWay = 116;
    const tolerance = observedMarketOneWay * 0.2;
    expect(uber!.price).toBeGreaterThanOrEqual(observedMarketOneWay - tolerance);
    expect(uber!.price).toBeLessThanOrEqual(observedMarketOneWay + tolerance);

    const display = formatRidesharePriceDisplay(uber!);
    expect(display.primary).toMatch(/^Estimated \$[\d]+–\$[\d]+ one way$/);
    expect(display.secondary).toBeNull();
  });

  test('airport parking checkout trips estimate outbound and return rides', () => {
    const parkingTrip: TripData = {
      type: 'one-way-departure',
      origin: MONROE_ORIGIN,
      destination: SEA_DESTINATION,
      departureDate: '2026-06-01',
      departureTime: '06:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckOutDate: '2026-06-05',
    };

    expect(isRideshareRoundTripEstimate(parkingTrip)).toBe(true);

    const options = buildMonroeEstimates(parkingTrip);
    const uber = options.find((option) => option.id === 'uber');

    expect(uber).toBeDefined();
    expect(uber!.rideshareTripScope).toBe('round-trip');
    expect(uber!.oneWayPriceMin).toBeGreaterThanOrEqual(100);
    expect(uber!.oneWayPriceMax).toBeLessThanOrEqual(220);
    expect(uber!.priceMin).toBeGreaterThanOrEqual(uber!.oneWayPriceMin! * 2 - 4);
    expect(uber!.priceMax).toBeGreaterThanOrEqual(uber!.oneWayPriceMax! * 2 - 4);

    const display = formatRidesharePriceDisplay(uber!);
    expect(display.primary).toMatch(/^Estimated \$[\d]+–\$[\d]+ round trip$/);
    expect(display.secondary).toMatch(/^~\$[\d]+–\$[\d]+ each way$/);
  });
});
