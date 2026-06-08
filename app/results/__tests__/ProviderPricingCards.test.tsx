/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { PricingLinksSection } from '../ProviderPricingCards';
import { resolveTransitFare } from '@/lib/transit/transitFareResolver';
import type { TransitOption, TripData } from '@/lib/types';

const austinTripData = {
  type: 'general-trip',
  origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
  destination: 'Franklin Barbecue, Austin TX',
  arrivalDate: '2026-06-07',
  arrivalTime: '11:00',
  transportAvailability: 'all',
} satisfies TripData;

function austinTransitItem(): TransitOption {
  const fare = resolveTransitFare({
    origin: austinTripData.origin,
    destination: austinTripData.destination,
  });

  return {
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
    sourceLink: 'https://www.google.com/maps/dir/?api=1&travelmode=transit',
    mapLink: 'https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=A&destination=B',
  };
}

describe('PricingLinksSection provider cards', () => {
  test('keeps transit title and long fare in separate blocks without overlap', () => {
    const { container } = render(
      <PricingLinksSection
        title="Transit options"
        items={[austinTransitItem()]}
        tripData={austinTripData}
      />,
    );

    const card = container.querySelector('.flex.min-w-0.flex-1.flex-col');
    expect(card).toBeTruthy();

    const title = screen.getByText('Transit route to destination');
    const fare = screen.getByText('Austin transit fare estimate: ~$1.25 one-way');

    expect(title).toHaveClass('break-words');
    expect(fare.closest('.rounded-xl.border')).toBeTruthy();
    expect(title.parentElement).not.toBe(fare.parentElement);
  });

  test('renders a single View route CTA for transit when map and source differ', () => {
    render(
      <PricingLinksSection
        title="Transit options"
        items={[austinTransitItem()]}
        tripData={austinTripData}
      />,
    );

    expect(screen.getAllByRole('link', { name: 'View route' })).toHaveLength(1);
  });

  test('keeps Sound Transit official website and separate route CTA', () => {
    render(
      <PricingLinksSection
        title="Transit options"
        items={[
          {
            id: 'soundtransit-planner',
            name: 'Sound Transit Trip Planner',
            trustStatus: 'verified-source',
            priceDisplay: 'check-live',
            sourceLink: 'https://www.soundtransit.org/tripplanner',
            mapLink: 'https://www.google.com/maps/dir/?api=1&travelmode=transit',
          },
        ]}
        tripData={austinTripData}
      />,
    );

    expect(screen.getByRole('link', { name: 'Official website' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View route' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'View route' })).toHaveLength(1);
  });

  test('renders ride provider with open-app CTA and disclaimer text', () => {
    render(
      <PricingLinksSection
        title="Ride providers"
        items={[
          {
            id: 'uber-link',
            name: 'Uber',
            trustStatus: 'estimated',
            priceDisplay: 'check-live',
            priceNote: 'Open Uber for current pricing; PodPaiGo does not have a live Uber quote.',
            sourceLink: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
            mapLink: 'https://www.google.com/maps/dir/?api=1&travelmode=driving',
          },
        ]}
      />,
    );

    // Price text and disclaimer are present
    expect(screen.getByText('Open app for live price')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Live Uber/Lyft fares are not available in PodPaiGo. Open the provider app for current pricing.',
      ),
    ).toBeInTheDocument();

    // The primary CTA link is rendered
    const openAppLink = screen.getByRole('link', { name: /open app/i });
    expect(openAppLink).toHaveClass('min-h-11');
    expect(openAppLink).toBeInTheDocument();
  });
});
