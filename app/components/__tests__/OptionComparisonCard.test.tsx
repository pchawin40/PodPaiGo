/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import OptionComparisonCard from '../OptionComparisonCard';
import ParkAndRideDetailsPanel from '../ParkAndRideDetailsPanel';
import {
  POINT_AB_DETAILS_SECTION_IDS,
  scrollToPointAbDetailsSection,
} from '../../../lib/parking/pointAbDetailsScroll';
import { buildPointAbModeActions } from '../../../lib/parking/pointAbModeActions';
import {
  selectBestParkAndRideForPointAb,
  toPointAbParkRidePresentation,
} from '../../../lib/parking/parkAndRideSelection';

describe('OptionComparisonCard compact layout', () => {
  test('does not render inline details or Show details control', () => {
    const { container } = render(
      <OptionComparisonCard
        confidence="Medium"
        label="Park & Ride"
        name="Lynnwood City Center Station"
        cost="Estimated $3–$8 total"
        time="58 min"
        pros={['Lower parking cost', 'Transit connection available']}
        cons={['Verify posted signs', 'Weather exposure on transfer']}
        actions={[
          { label: 'Route to lot', href: 'https://maps.example/drive' },
          { label: 'Details', onClick: () => undefined, ariaControls: 'details-park-ride' },
        ]}
      />,
    );

    expect(screen.queryByText('Show details')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide details')).not.toBeInTheDocument();
    expect(container.querySelector('details')).not.toBeInTheDocument();
    expect(screen.queryByText(/Routes served/i)).not.toBeInTheDocument();
  });

  test('shows only the first short pro and first short con', () => {
    render(
      <OptionComparisonCard
        confidence="High"
        label="Destination parking"
        name="Sample Garage"
        cost="$24"
        time="32 min"
        pros={['Near destination', 'Covered garage/lot']}
        cons={['Paid garage', 'Route timing unavailable']}
      />,
    );

    expect(screen.getByText('Near destination')).toBeInTheDocument();
    expect(screen.queryByText('Covered garage/lot')).not.toBeInTheDocument();
    expect(screen.getByText('Paid garage')).toBeInTheDocument();
    expect(screen.queryByText('Route timing unavailable')).not.toBeInTheDocument();
  });

  test('renders a Details action button', () => {
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Transit"
        name="Sound Transit"
        cost="$6"
        time="52 min"
        pros={['Usually low cost']}
        cons={['More walking and waiting']}
        actions={[
          { label: 'Open transit route', href: 'https://maps.example/transit' },
          { label: 'Compare schedule', href: 'https://soundtransit.org/' },
          { label: 'Details', onClick: () => undefined },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });

  test('Details button exposes aria-expanded and aria-controls', () => {
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Rideshare"
        name="Uber"
        cost="$42"
        time="38 min"
        pros={['No parking required']}
        cons={['Surge pricing can change']}
        actions={[
          { label: 'View ride estimates', href: 'https://uber.com/' },
          { label: 'Route', href: 'https://maps.example/route' },
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS.rideshare,
            ariaExpanded: true,
          },
        ]}
      />,
    );

    const detailsButton = screen.getByRole('button', { name: 'Details' });
    expect(detailsButton).toHaveAttribute('aria-controls', 'details-rideshare');
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('scroll helper focuses the section heading and updates hash', () => {
    document.body.innerHTML = `
      <section id="details-transit" class="scroll-target">
        <h2 data-details-heading tabindex="-1">Transit options</h2>
      </section>
    `;

    const section = document.getElementById('details-transit')!;
    const heading = section.querySelector<HTMLElement>('[data-details-heading]')!;
    const scrollIntoView = jest.fn();
    section.scrollIntoView = scrollIntoView;
    const focusSpy = jest.spyOn(heading, 'focus');

    scrollToPointAbDetailsSection('details-transit');

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(window.location.hash).toBe('#details-transit');
  });

  test('exposes stable section IDs for each Point A→B mode', () => {
    expect(POINT_AB_DETAILS_SECTION_IDS).toEqual({
      parking: 'details-destination-parking',
      'street-meter': 'details-street-meter',
      rideshare: 'details-rideshare',
      transit: 'details-transit',
      'park-ride': 'details-park-ride',
    });
  });

  test('uses equal-height flex column layout with pinned actions', () => {
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

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('h-full');
    expect(card).toHaveClass('flex');
    expect(card).toHaveClass('flex-col');
    expect(card).toHaveClass('min-h-[17.5rem]');
    expect(card.querySelector('.mt-auto')).toBeTruthy();
  });

  test('stacks action buttons vertically for mobile-friendly cards', () => {
    render(
      <OptionComparisonCard
        confidence="High"
        label="Rideshare"
        name="Uber"
        cost="$42"
        time="38 min"
        pros={['No parking required']}
        cons={['Surge pricing can change']}
        actions={buildPointAbModeActions({
          mode: 'rideshare',
          rideshareUrl: 'https://uber.com/',
          routeToParkingUrl: 'https://maps.example/route',
          onDetails: () => undefined,
          detailsSectionId: POINT_AB_DETAILS_SECTION_IDS.rideshare,
        })}
      />,
    );

    const actionContainer = screen.getByRole('button', { name: 'Details' }).parentElement;
    expect(actionContainer).toHaveClass('flex-col');
  });

  test('keeps Park & Ride long-form content out of the comparison card', () => {
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

    const { container: cardContainer } = render(
      <OptionComparisonCard
        confidence="Medium"
        label="Park & Ride"
        name={presentation!.displayName}
        cost={presentation!.costDisplay}
        time="58 min"
        pros={presentation!.pros}
        cons={presentation!.cons}
        actions={buildPointAbModeActions({
          mode: 'park-ride',
          parkRideDirectionsUrl: 'https://maps.example/drive',
          parkRideTransitUrl: 'https://maps.example/transit',
          parkRideRulesUrl: 'https://www.soundtransit.org/ride-with-us/parking',
          parkRideViable: true,
          onDetails: () => undefined,
          detailsSectionId: POINT_AB_DETAILS_SECTION_IDS['park-ride'],
        })}
      />,
    );

    expect(cardContainer.querySelector('details')).not.toBeInTheDocument();
    expect(within(cardContainer).queryByText(/Parking rules/i)).not.toBeInTheDocument();
    expect(within(cardContainer).queryByText(/Routes served/i)).not.toBeInTheDocument();
    expect(within(cardContainer).getByRole('link', { name: 'Rules' })).toBeInTheDocument();

    const { container: detailsContainer } = render(
      <ParkAndRideDetailsPanel details={presentation!.details} />,
    );

    expect(within(detailsContainer).getByText(/Nearby Park & Ride lots/i)).toBeInTheDocument();
    expect(within(detailsContainer).getByText(/Parking rules/i)).toBeInTheDocument();
    expect(
      within(detailsContainer).getAllByRole('link', { name: 'Open lot rules' }).length,
    ).toBeGreaterThan(0);
    expect(
      within(detailsContainer).getAllByRole('link', { name: 'Route to lot' }).length,
    ).toBeGreaterThan(0);
    expect(
      within(detailsContainer).getAllByRole('link', {
        name: 'Transit to destination',
      }).length,
    ).toBeGreaterThan(0);
  });
});
