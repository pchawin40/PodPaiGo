/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import OptionComparisonCard from '../../../app/components/OptionComparisonCard';
import ParkAndRideDetailsPanel from '../../../app/components/ParkAndRideDetailsPanel';
import { PARK_AND_RIDE_UI_COPY } from '../../access/parkAndRideAccess';
import { buildParkAndRideDetailsPanel } from '../parkAndRideDetails';
import { getAustinCapMetroParkAndRideLots, getSeattleRegionParkAndRideLots } from '../parkAndRideProvider';
import {
  selectBestParkAndRideForPointAb,
  toPointAbParkRidePresentation,
} from '../parkAndRideSelection';
import { buildPointAbModeActions } from '../pointAbModeActions';
import { POINT_AB_DETAILS_SECTION_IDS } from '../pointAbDetailsScroll';
import { rankPointAbModes } from '../pointAbRanking';
import {
  SOUND_TRANSIT_MERCER_ISLAND_PARK_RIDE_URL,
  SOUND_TRANSIT_PARKING_URL,
  SOUND_TRANSIT_TRIP_PLANNER_URL,
} from '../parkAndRideLinks';
import type { TripData } from '../../types';

function generalTrip(overrides: Partial<TripData> = {}): TripData {
  return {
    type: 'general-trip',
    origin: 'Lynnwood, WA',
    destination: 'Downtown Seattle, WA',
    originLat: 47.8209,
    originLng: -122.2931,
    destinationLat: 47.6062,
    destinationLng: -122.3321,
    parkingDuration: 8 * 60,
    ...overrides,
  } as TripData;
}

describe('Point A→B Park & Ride provider', () => {
  test('seeds Seattle-region curated lots', () => {
    const lots = getSeattleRegionParkAndRideLots();
    const names = lots.map((lot) => lot.lotName);

    expect(names).toEqual(
      expect.arrayContaining([
        'Northgate Station Garage / Park-and-Ride A',
        'Mountlake Terrace Station',
        'Lynnwood City Center Station',
        'Mercer Island Park-and-Ride',
        'Redmond Technology Station',
        'Redmond Transit Center',
        'Tukwila International Blvd Station',
        'Angle Lake Station',
      ]),
    );
    expect(lots.every((lot) => lot.rulesUrl.startsWith('http'))).toBe(true);
    expect(
      lots.some((lot) =>
        lot.rulesUrl.includes('how-to-ride/park-and-ride'),
      ),
    ).toBe(false);
  });

  test('seeds Austin CapMetro curated lots with free parking', () => {
    const lots = getAustinCapMetroParkAndRideLots();

    expect(lots.length).toBeGreaterThan(0);
    expect(lots.every((lot) => lot.parkingCostMin === 0 && lot.parkingCostMax === 0)).toBe(true);
    expect(lots.some((lot) => lot.lotName.includes('Plaza Saltillo'))).toBe(true);
    expect(lots.some((lot) => lot.transitFareMin === 3.5)).toBe(true);
  });
});

describe('Point A→B Park & Ride selection', () => {
  test('selects a viable downtown Seattle lot with estimated time and cost', () => {
    const result = selectBestParkAndRideForPointAb({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
      sort: 'easiest',
      parkingTotal: 28,
    });

    expect(result.best).not.toBeNull();
    expect(result.best?.isRecommended).toBe(true);
    expect(result.best?.totalTimeMinutes).toBeGreaterThan(0);
    expect(result.best?.costEstimate?.display).toMatch(/\$[\d.]+ one-way adult est\./);
    expect(
      result.best?.lotName.includes('Lynnwood') ||
        result.best?.lotName.includes('Northgate') ||
        result.best?.lotName.includes('Mountlake'),
    ).toBe(true);
  });

  test('returns unavailable reason when no useful lot exists', () => {
    const result = selectBestParkAndRideForPointAb({
      origin: 'Spokane, WA',
      originLat: 47.6588,
      originLng: -117.426,
      destination: 'Boise, ID',
      destinationLat: 43.615,
      destinationLng: -116.2023,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
    });

    expect(result.best).toBeNull();
    expect(result.metroStatus).toBe('data_not_available');
    expect(result.notUsefulReason).toMatch(/data not available yet for this metro/i);
  });

  test('does not recommend overnight airport Park & Ride', () => {
    const result = selectBestParkAndRideForPointAb({
      origin: 'Lynnwood, WA',
      destination: 'SEA Airport',
      parkingDurationMinutes: 7 * 24 * 60,
      isAirportTrip: true,
    });

    expect(result.best).toBeNull();
    expect(result.notUsefulReason).toBe(PARK_AND_RIDE_UI_COPY.notRecommendedOvernight);
  });
});

describe('Point A→B Park & Ride URLs and actions', () => {
  test('generates Google Maps drive and transit URLs', () => {
    const result = selectBestParkAndRideForPointAb({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Pike Place Market, Seattle, WA',
      destinationLat: 47.6097,
      destinationLng: -122.3425,
      parkingDurationMinutes: 6 * 60,
      isAirportTrip: false,
    });

    expect(result.best).not.toBeNull();
    expect(result.best!.directionsToLotUrl).toMatch(/google\.com\/maps\/dir/);
    expect(result.best!.directionsToLotUrl).toMatch(/travelmode=driving/);
    expect(result.best!.transitRouteUrl).toMatch(/google\.com\/maps\/dir/);
    expect(result.best!.transitRouteUrl).toMatch(/travelmode=transit/);
    expect(result.best!.rulesUrl).not.toMatch(/how-to-ride\/park-and-ride/);
  });

  test('viable Park & Ride actions keep route primary and send details lower on page', () => {
    const actions = buildPointAbModeActions({
      mode: 'park-ride',
      parkRideDirectionsUrl: 'https://maps.example/drive',
      parkRideTransitUrl: 'https://maps.example/transit',
      parkRideRulesUrl: SOUND_TRANSIT_PARKING_URL,
      parkRideViable: true,
      onDetails: () => undefined,
      detailsSectionId: POINT_AB_DETAILS_SECTION_IDS['park-ride'],
    });

    expect(actions[0]).toEqual({ label: 'Route to lot', href: 'https://maps.example/drive' });
    expect(actions[1]).toEqual({
      label: 'Transit to destination',
      href: 'https://maps.example/transit',
    });
    expect(actions[2].label).toBe('Details');
    expect(actions[2].ariaControls).toBe('park-ride-details');
  });

  test('unavailable Park & Ride actions keep rules primary and send details lower on page', () => {
    const actions = buildPointAbModeActions({
      mode: 'park-ride',
      parkRideRulesUrl: 'https://soundtransit.org/rules',
      parkRideTransitPlannerUrl: SOUND_TRANSIT_TRIP_PLANNER_URL,
      parkRideViable: false,
      onDetails: () => undefined,
      detailsSectionId: POINT_AB_DETAILS_SECTION_IDS['park-ride'],
    });

    expect(actions[0]).toEqual({
      label: 'Check lot rules',
      href: 'https://soundtransit.org/rules',
    });
    expect(actions[1].label).toBe('Details');
    expect(actions[1].ariaControls).toBe('park-ride-details');
    expect(actions[2]).toEqual({
      label: 'Open transit planner',
      href: SOUND_TRANSIT_TRIP_PLANNER_URL,
    });
  });
});

describe('Point A→B Park & Ride details and ranking', () => {
  test('details panel includes lot, rules, routes, and route breakdown', () => {
    const selection = selectBestParkAndRideForPointAb({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
    });
    const presentation = toPointAbParkRidePresentation(selection);
    const details = buildParkAndRideDetailsPanel(selection.best!);

    expect(presentation?.details.lotName).toBeTruthy();
    expect(details.routesServed.length).toBeGreaterThan(0);
    expect(details.parkingRuleSummary).toMatch(/Verify|overnight|same-day|48-hour|FCFS/i);
    expect(details.routeBreakdown.totalMinutes).toBeGreaterThan(0);
    expect(details.verifySignsWarning).toMatch(/Verify posted signs/i);
    expect(details.lots.length).toBeGreaterThan(0);
    expect(details.lots[0]?.rulesUrl).not.toMatch(/how-to-ride\/park-and-ride/);
  });

  test('rankPointAbModes uses curated Park & Ride presentation for city trips', () => {
    const selection = selectBestParkAndRideForPointAb({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
    });
    const pointAbParkRide = toPointAbParkRidePresentation(selection);
    const ranking = rankPointAbModes({
      tripData: generalTrip(),
      sort: 'easiest',
      destinationLabel: 'Downtown Seattle, WA',
      noParkingPreferred: false,
      bestParking: null,
      parkingTotal: 28,
      parkingMinutes: 35,
      bestRideOption: null,
      ridePrice: 42,
      rideDuration: 38,
      bestTransitOption: null,
      transitCost: 6,
      transitDuration: 52,
      hasReliableTransit: true,
      bestParkRideAccess: null,
      pointAbParkRide,
      parkRideCost: pointAbParkRide?.cost ?? null,
      parkRideDuration: pointAbParkRide?.durationMinutes ?? null,
      parkRideReliable: Boolean(pointAbParkRide?.recommended),
    });

    const parkRideRow = ranking.modes.find((mode) => mode.key === 'park-ride');
    expect(parkRideRow?.name).toMatch(/Lynnwood|Northgate|Mountlake/);
    expect(parkRideRow?.time).not.toBe('Depends');
    expect(parkRideRow?.cost).toMatch(/one-way adult est|Transit fare est/);
  });
});

describe('OptionComparisonCard layout', () => {
  test('renders badge, metrics, compact pros/cons, and three action buttons', () => {
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Park & Ride"
        name="Lynnwood City Center Station"
        cost="Estimated $3–$8 total"
        time="58 min"
        pros={['Lower parking cost', 'Extra pro hidden']}
        cons={['Verify posted signs', 'Extra con hidden']}
        status="verify_rules"
        actions={[
          { label: 'Route to lot', href: 'https://maps.example/drive' },
          { label: 'Transit to destination', href: 'https://maps.example/transit' },
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS['park-ride'],
            ariaExpanded: false,
          },
        ]}
      />,
    );

    expect(screen.getByText('Park & Ride')).toBeInTheDocument();
    expect(screen.getByText('Verify')).toBeInTheDocument();
    // Primary action and Details toggle always visible
    expect(screen.getByRole('link', { name: 'Route to lot' })).toHaveAttribute(
      'href',
      'https://maps.example/drive',
    );
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '#park-ride-details',
    );
    // Pros, cons, and secondary action belong in the lower details section.
    expect(screen.queryByText('Lower parking cost')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Transit to destination' })).not.toBeInTheDocument();
  });

  test('desktop cards share equal-height flex layout', () => {
    const { container } = render(
      <OptionComparisonCard
        confidence="High"
        label="Destination parking"
        name="Sample Garage"
        cost="$24"
        time="32 min"
        pros={['Near destination']}
        cons={['Paid garage']}
        className="h-full"
      />,
    );

    expect(container.firstChild).toHaveClass('h-full');
    expect(container.firstChild).toHaveClass('flex');
    expect(container.firstChild).toHaveClass('flex-col');
    expect(container.firstChild).toHaveClass('min-h-[17.5rem]');
  });

  test('details panel component renders operator and warnings', () => {
    const selection = selectBestParkAndRideForPointAb({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
    });
    const presentation = toPointAbParkRidePresentation(selection);

    render(<ParkAndRideDetailsPanel details={presentation!.details} />);

    expect(screen.getByText(/Nearby Park & Ride lots/i)).toBeInTheDocument();
    expect(screen.getByText(/Routes served/i)).toBeInTheDocument();
    expect(screen.getByText(/Parking rules/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open lot rules' }).length).toBeGreaterThan(0);
  });

  test('Mercer Island uses the official lot-specific rules URL', () => {
    const result = selectBestParkAndRideForPointAb({
      origin: 'Bellevue, WA',
      originLat: 47.6101,
      originLng: -122.2015,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
      parkingDurationMinutes: 6 * 60,
      isAirportTrip: false,
    });

    const mercer = result.candidates.find((lot) => lot.id === 'mercer-island-park-and-ride');
    expect(mercer?.rulesUrl).toBe(SOUND_TRANSIT_MERCER_ISLAND_PARK_RIDE_URL);
  });
});

describe('Austin CapMetro Park & Ride QA scenario', () => {
  const austinTripInput = {
    origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
    originLat: 30.1944,
    originLng: -97.6699,
    destination: 'Franklin Barbecue, East 11th Street, Austin, TX, USA',
    destinationLat: 30.2702,
    destinationLng: -97.7314,
    parkingDurationMinutes: 120,
    isAirportTrip: false,
    sort: 'easiest' as const,
    parkingTotal: 15,
  };

  test('airport to Franklin surfaces CapMetro candidates with separate parking and fare', () => {
    const result = selectBestParkAndRideForPointAb(austinTripInput);

    expect(result.metroId).toBe('austin');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.best).not.toBeNull();
    expect(result.availabilityTier).toMatch(/recommended|backup_available/);
    expect(result.best?.costEstimate?.parkingDisplay).toBe('Usually free; verify lot signs.');
    expect(result.best?.costEstimate?.transitFareDisplay).toBe('$3.50 one-way adult est.');
    expect(result.best?.costEstimate?.display).not.toMatch(/total/i);
  });

  test('presentation does not say unavailable when candidates exist', () => {
    const result = selectBestParkAndRideForPointAb(austinTripInput);
    const presentation = toPointAbParkRidePresentation(result);

    expect(presentation).not.toBeNull();
    expect(presentation?.hasCandidates).toBe(true);
    expect(presentation?.displayName).not.toMatch(/unavailable/i);
    expect(presentation?.cardHeadline).not.toMatch(/unavailable/i);
    expect(presentation?.costNote).toBe('Usually free; verify lot signs.');
    expect(presentation?.costDisplay).toBe('$3.50 one-way adult est.');
  });

  test('lot cards use descriptive labels instead of Not useful', () => {
    const result = selectBestParkAndRideForPointAb(austinTripInput);
    const presentation = toPointAbParkRidePresentation(result);
    const labels = presentation?.details.lots.map((lot) => lot.statusLabel) ?? [];

    expect(labels.length).toBeGreaterThan(0);
    expect(labels).not.toContain('Not useful');
    expect(labels.some((label) =>
      ['Best pick', 'Useful backup', 'Long detour', 'Slow transit connection'].includes(label),
    )).toBe(true);
  });

  test('ranking keeps Park & Ride visible as backup or recommended', () => {
    const selection = selectBestParkAndRideForPointAb(austinTripInput);
    const pointAbParkRide = toPointAbParkRidePresentation(selection);
    const ranking = rankPointAbModes({
      tripData: {
        type: 'general-trip',
        origin: austinTripInput.origin,
        destination: austinTripInput.destination,
        originLat: austinTripInput.originLat,
        originLng: austinTripInput.originLng,
        destinationLat: austinTripInput.destinationLat,
        destinationLng: austinTripInput.destinationLng,
        parkingDuration: austinTripInput.parkingDurationMinutes,
      } as TripData,
      sort: 'easiest',
      destinationLabel: austinTripInput.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingTotal: 15,
      parkingMinutes: 20,
      bestRideOption: null,
      ridePrice: 25,
      rideDuration: 18,
      bestTransitOption: null,
      transitCost: 1.25,
      transitDuration: 45,
      hasReliableTransit: true,
      bestParkRideAccess: null,
      pointAbParkRide,
      parkRideCost: pointAbParkRide?.cost ?? null,
      parkRideDuration: pointAbParkRide?.durationMinutes ?? null,
      parkRideReliable: Boolean(pointAbParkRide?.reliable),
    });

    const parkRideRow = ranking.modes.find((mode) => mode.key === 'park-ride');
    expect(parkRideRow?.unavailable).toBe(false);
    expect(parkRideRow?.name).not.toMatch(/unavailable/i);
    expect(parkRideRow?.cost).toMatch(/one-way adult est|Transit fare est/);
    expect(parkRideRow?.costNote).toBe('Usually free; verify lot signs.');
  });
});
