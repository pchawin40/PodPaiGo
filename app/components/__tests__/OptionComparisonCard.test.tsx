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
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS['park-ride'],
          },
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
        timeLabel="Total time"
        pros={['Near destination', 'Covered garage/lot']}
        cons={['Paid garage', 'Route timing unavailable']}
      />,
    );

    expect(screen.getByText('Total time')).toBeInTheDocument();
    expect(screen.getByText('Near destination')).toBeInTheDocument();
    expect(screen.queryByText('Covered garage/lot')).not.toBeInTheDocument();
    expect(screen.getByText('Paid garage')).toBeInTheDocument();
    expect(screen.queryByText('Route timing unavailable')).not.toBeInTheDocument();
  });

  test('clamps the cost-tile note so long copy cannot overflow the metric tile', () => {
    const longNote =
      'Between 8 PM and 10 PM, some Seattle neighborhoods still require payment, and posted signs may set time limits or restrict parking entirely.';
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Street / meter parking"
        name="Check signs / special rules possible"
        cost="Check meter"
        costNote={longNote}
        time="35 min"
        timeLabel="Total time"
        pros={['Evening blocks may still have open stalls']}
        cons={['Verify posted signs before leaving your car']}
      />,
    );

    const noteEl = screen.getByText(longNote);
    expect(noteEl).toHaveClass('line-clamp-2');
    expect(noteEl).toHaveClass('break-words');
  });

  test('renders paid parking timing decomposition when provided', () => {
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Paid garage/lot"
        name="Sample Garage"
        cost="$18"
        time="25 min"
        timeLabel="Total time"
        timing={{
          driveMinutes: 12,
          parkingBufferMinutes: 8,
          walkToDestinationMinutes: 5,
          pickupWaitMinutes: null,
          totalOptionMinutes: 25,
        }}
        timingBreakdownLabels={{
          drive: 'Drive to lot',
          parkingBuffer: 'Park/check-in buffer',
          walk: 'Walk to destination',
          total: 'Total to destination',
        }}
        pros={['Bookable paid backup']}
        cons={['May cost more than street parking']}
      />,
    );

    expect(screen.getByText('Drive to lot')).toBeInTheDocument();
    expect(screen.getByText('Park/check-in buffer')).toBeInTheDocument();
    expect(screen.getByText('Walk to destination')).toBeInTheDocument();
    expect(screen.getByText('Total to destination')).toBeInTheDocument();
    expect(screen.getAllByText('12 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25 min').length).toBeGreaterThan(0);
  });

  test('renders street meter timing with total first and readable labels', () => {
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Street / meter parking"
        name="Street parking near destination"
        cost="$5"
        time="1h 13m"
        timeLabel="Total time"
        timing={{
          driveMinutes: 60,
          parkingBufferMinutes: 7,
          walkToDestinationMinutes: 6,
          pickupWaitMinutes: null,
          totalOptionMinutes: 73,
        }}
        timingBreakdownLabels={{
          drive: 'Drive route',
          parkingBuffer: 'Find/check parking',
          walk: 'Walk to destination',
          total: 'Total time',
          totalFirst: true,
        }}
        pros={['Can be cheaper when a legal stall is open']}
        cons={['Verify posted signs']}
      />,
    );

    const labels = screen
      .getAllByText(/Total time|Drive route|Find\/check parking|Walk to destination/)
      .map((node) => node.textContent);

    expect(labels).toEqual(expect.arrayContaining([
      'Total time',
      'Drive route',
      'Find/check parking',
      'Walk to destination',
    ]));
    expect(screen.getAllByText('1h 13m').length).toBeGreaterThan(0);
    expect(screen.getByText('60 min')).toBeInTheDocument();
    expect(screen.getByText('7 min')).toBeInTheDocument();
    expect(screen.getByText('6 min')).toBeInTheDocument();
  });

  test('renders a Details action link when a target section is provided', () => {
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
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS.transit,
          },
        ]}
      />,
    );

    const detailsLink = screen.getByRole('link', { name: 'Details' });
    expect(detailsLink).toHaveAttribute('href', '#transit-details');
  });

  test('Details link exposes target href and aria-controls', () => {
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
          },
        ]}
      />,
    );

    const detailsLink = screen.getByRole('link', { name: 'Details' });
    expect(detailsLink).toHaveAttribute('aria-controls', 'rideshare-details');
    expect(detailsLink).toHaveAttribute('href', '#rideshare-details');
    expect(detailsLink).not.toHaveAttribute('aria-expanded');
  });

  test('scroll helper focuses the section heading and updates hash', () => {
    document.body.innerHTML = `
      <section id="transit-details" class="scroll-target">
        <h2 data-details-heading tabindex="-1">Transit options</h2>
      </section>
    `;

    const section = document.getElementById('transit-details')!;
    const heading = section.querySelector<HTMLElement>('[data-details-heading]')!;
    const scrollIntoView = jest.fn();
    section.scrollIntoView = scrollIntoView;
    const focusSpy = jest.spyOn(heading, 'focus');

    scrollToPointAbDetailsSection('transit-details');

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(window.location.hash).toBe('#transit-details');
  });

  test('exposes stable section IDs for each Point A→B mode', () => {
    expect(POINT_AB_DETAILS_SECTION_IDS).toEqual({
      drive: 'paid-parking-details',
      'destination-customer': 'customer-parking-details',
      parking: 'paid-parking-details',
      'street-meter': 'details-street-meter',
      rideshare: 'rideshare-details',
      transit: 'transit-details',
      'park-ride': 'park-ride-details',
    });
  });

  test('mutes hidden parking cards and replaces CTAs with show-parking action', () => {
    render(
      <OptionComparisonCard
        confidence="Medium"
        label="Customer parking"
        name="Customer parking at destination"
        cost="Free? Verify"
        time="23 min"
        pros={['No paid parking if rules allow']}
        cons={['Verify posted signs']}
        hiddenByPreference
        selected
        status="best_pick"
        verdict="Best pick"
        isCheapestMode
        isFastestMode
        actions={[
          { label: 'Open directions', href: 'https://maps.example/route' },
          { label: 'Details', onClick: () => undefined },
        ]}
        onShowParkingAnyway={() => undefined}
      />,
    );

    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByText('Best pick')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open directions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Hidden by your No parking needed preference.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show parking anyway' })).toBeInTheDocument();

    const card = screen.getByText('Customer parking').closest('div.rounded-2xl');
    expect(card).toHaveClass('opacity-75');
    expect(card).not.toHaveClass('bg-primary/10');
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

    const actionContainer = screen.getByRole('link', { name: 'Details' }).parentElement;
    expect(actionContainer).toHaveClass('flex-col');
  });

  test('uses pinned full-width centered action buttons for wrapped labels', () => {
    const { container } = render(
      <OptionComparisonCard
        confidence="Medium"
        label="Rideshare"
        name="Uber / Lyft"
        cost="Open app for live price"
        time="Open app"
        pros={['No parking required']}
        cons={['Surge pricing can change']}
        actions={[
          { label: 'View ride estimates', href: 'https://uber.com/' },
          { label: 'Open transit route', href: 'https://maps.example/transit' },
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS.rideshare,
          },
        ]}
      />,
    );

    const card = container.firstChild as HTMLElement;
    expect(card.querySelector('.flex-1')).toBeTruthy();
    expect(card.querySelector('.mt-auto')).toHaveClass('pt-4');

    // Primary action and Details toggle are always visible
    expect(screen.getByRole('link', { name: 'View ride estimates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '#rideshare-details');

    // Secondary action belongs in the lower detail section, not the cramped card.
    expect(screen.queryByRole('link', { name: 'Open transit route' })).not.toBeInTheDocument();
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
    expect(within(cardContainer).queryByRole('link', { name: 'Rules' })).not.toBeInTheDocument();
    expect(within(cardContainer).getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '#park-ride-details',
    );

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
