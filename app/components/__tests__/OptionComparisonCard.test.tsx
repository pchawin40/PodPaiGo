/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import OptionComparisonCard, {
  CompareOptionsDesktopHeader,
  OPTION_COMPARISON_GRID_CLASS,
} from '../OptionComparisonCard';
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

  test('keeps pros and cons out of the compact row', () => {
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

    expect(screen.queryByText('Time:')).not.toBeInTheDocument();
    expect(screen.queryByText('Cost:')).not.toBeInTheDocument();
    expect(screen.queryByText('Caveat:')).not.toBeInTheDocument();
    expect(screen.getAllByText('Paid garage').length).toBeGreaterThan(0);
    expect(screen.queryByText('Near destination')).not.toBeInTheDocument();
    expect(screen.queryByText('Covered garage/lot')).not.toBeInTheDocument();
    expect(screen.queryByText('Route timing unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
  });

  test('clamps the cost note so long copy cannot overflow the compact row', () => {
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

    const noteEl = screen.getAllByText(longNote)[0]!;
    expect(noteEl).toHaveClass('line-clamp-1');
    expect(noteEl).toHaveClass('break-words');
  });

  test('keeps paid parking timing decomposition out of the compact row', () => {
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

    expect(screen.queryByText('Drive to lot')).not.toBeInTheDocument();
    expect(screen.queryByText('Park/check-in buffer')).not.toBeInTheDocument();
    expect(screen.queryByText('Walk to destination')).not.toBeInTheDocument();
    expect(screen.queryByText('Total to destination')).not.toBeInTheDocument();
    expect(screen.getAllByText('25 min').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
  });

  test('keeps street meter timing breakdown out of the compact row', () => {
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

    expect(screen.queryByText('Drive route')).not.toBeInTheDocument();
    expect(screen.queryByText('Find/check parking')).not.toBeInTheDocument();
    expect(screen.queryByText('Walk to destination')).not.toBeInTheDocument();
    expect(screen.queryByText('Total time')).not.toBeInTheDocument();
    expect(screen.getAllByText('1h 13m').length).toBeGreaterThan(0);
    expect(screen.queryByText('60 min')).not.toBeInTheDocument();
    expect(screen.queryByText('7 min')).not.toBeInTheDocument();
    expect(screen.queryByText('6 min')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
  });

  test('renders one View action link when a target section is provided', () => {
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

    const detailsLinks = screen.getAllByRole('link', { name: 'View' });
    expect(detailsLinks.some((link) => link.getAttribute('href') === '#transit-details')).toBe(true);
  });

  test('View link exposes target href and aria-controls for details sections', () => {
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

    const detailsLink = screen
      .getAllByRole('link', { name: 'View' })
      .find((link) => link.getAttribute('href') === '#rideshare-details');
    expect(detailsLink).toBeDefined();
    expect(detailsLink).toHaveAttribute('aria-controls', 'rideshare-details');
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

    expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0);
    expect(screen.queryByText('Best pick')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open directions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Hidden by preference').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Show parking anyway' }).length).toBeGreaterThan(0);

    const card = screen.getByTestId('option-comparison-mobile-card').closest('div.rounded-xl');
    expect(card).toHaveClass('opacity-75');
    expect(card).not.toHaveClass('bg-primary/10');
  });

  test('desktop header renders column labels only for md+ layout', () => {
    render(<CompareOptionsDesktopHeader />);

    const header = screen.getByTestId('compare-options-desktop-header');
    expect(header).toHaveClass('hidden');
    expect(header).toHaveClass('md:grid');
    expect(within(header).getByText('Option')).toBeInTheDocument();
    expect(within(header).getByText('Status')).toBeInTheDocument();
    expect(within(header).getByText('Cost')).toBeInTheDocument();
    expect(within(header).getByText('Time')).toBeInTheDocument();
    expect(within(header).getByText('Note')).toBeInTheDocument();
    expect(within(header).getByText('Action')).toBeInTheDocument();
  });

  test('renders mobile stacked cards and hides desktop table row on small screens', () => {
    render(
      <OptionComparisonCard
        confidence="High"
        label="Airport parking"
        name="Official SEA Airport Garage"
        cost="$18"
        time="6h 28m"
        pros={['Official airport option']}
        cons={['May cost more than transit']}
        status="cheapest"
        isCheapestMode
        actions={[
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS.parking,
          },
        ]}
      />,
    );

    const mobileCard = screen.getByTestId('option-comparison-mobile-card');
    expect(mobileCard).toHaveClass('md:hidden');
    expect(within(mobileCard).getByText('Airport parking')).toBeInTheDocument();
    expect(within(mobileCard).getByText('Cheapest')).toBeInTheDocument();
    expect(within(mobileCard).getByText('Official SEA Airport Garage')).toBeInTheDocument();
    expect(within(mobileCard).getByText('May cost more than transit')).toBeInTheDocument();
    expect(within(mobileCard).getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(screen.queryByText('Option')).not.toBeInTheDocument();

    const desktopRow = screen.getByTestId('option-comparison-row');
    expect(desktopRow).toHaveClass('hidden');
    expect(desktopRow).toHaveClass('md:grid');
    expect(desktopRow).toHaveClass(OPTION_COMPARISON_GRID_CLASS);
  });

  test('renders desktop table row cells while mobile card stays in the DOM', () => {
    const { container } = render(
      <OptionComparisonCard
        confidence="Medium"
        label="Transit"
        name="Sound Transit"
        cost="$6"
        time="52 min"
        pros={['Usually low cost']}
        cons={['More walking and waiting']}
        actions={[
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS.transit,
          },
        ]}
      />,
    );

    const desktopRow = screen.getByTestId('option-comparison-row');
    expect(desktopRow).toHaveClass('md:grid');
    expect(within(desktopRow).getAllByText('$6').length).toBeGreaterThan(0);
    expect(within(desktopRow).getAllByText('52 min').length).toBeGreaterThan(0);
    expect(within(desktopRow).getByText('More walking and waiting')).toBeInTheDocument();
    expect(within(desktopRow).getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByTestId('option-comparison-mobile-card')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="option-comparison-actions-desktop"]')).toBeInTheDocument();
  });

  test('mobile unavailable Park & Ride card shows Why? and not View', () => {
    render(
      <OptionComparisonCard
        confidence="Low"
        label="Park & Ride"
        name="Park & Ride not confirmed for this destination"
        cost="Not estimated"
        time="Not estimated"
        pros={[]}
        cons={['Park & Ride not confirmed for this destination']}
        unavailable
        verdict="Unavailable"
        actions={[
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS['park-ride'],
          },
        ]}
      />,
    );

    const mobileCard = screen.getByTestId('option-comparison-mobile-card');
    expect(within(mobileCard).getByText('Unavailable')).toBeInTheDocument();
    expect(
      within(mobileCard).getAllByText('Park & Ride not confirmed for this destination').length,
    ).toBeGreaterThan(0);
    expect(within(mobileCard).getAllByText('Not estimated').length).toBeGreaterThanOrEqual(2);
    expect(within(mobileCard).getByRole('link', { name: 'Why?' })).toBeInTheDocument();
    expect(within(mobileCard).queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
  });

  test('keeps unavailable options readable with dimmed state and one Why action', () => {
    render(
      <OptionComparisonCard
        confidence="Low"
        label="Transit"
        name="Transit route not confirmed"
        cost="Check route"
        time="Check route"
        pros={['Usually low cost']}
        cons={['Open transit to confirm route timing']}
        unavailable
        verdict="Live route needed"
        actions={[
          {
            label: 'Details',
            onClick: () => undefined,
            ariaControls: POINT_AB_DETAILS_SECTION_IDS.transit,
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Transit route not confirmed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Check route').length).toBeGreaterThan(0);
    expect(screen.queryByText('Caveat:')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Why?' }).some((link) => link.getAttribute('href') === '#transit-details'),
    ).toBe(true);

    const card = screen.getByRole('group', { name: 'Transit recommendation' });
    expect(card).toHaveClass('opacity-80');
    expect(screen.getByTestId('option-comparison-actions-desktop')).toHaveClass('md:justify-end');
    expect(screen.getAllByRole('link', { name: 'Why?' }).length).toBeGreaterThan(0);
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
    expect(card).toHaveClass('min-h-[4.75rem]');
    expect(screen.getByTestId('option-comparison-row')).toHaveClass('md:grid');
    expect(screen.getByTestId('option-comparison-row')).toHaveClass('md:items-center');
    expect(screen.getByTestId('option-comparison-row')).toHaveClass(OPTION_COMPARISON_GRID_CLASS);
    expect(screen.getByTestId('option-comparison-actions-desktop')).toHaveClass('md:justify-end');
    expect(screen.getByTestId('option-comparison-actions-desktop')).toHaveClass('md:self-center');
  });

  test('uses dedicated action area with desktop right-column classes', () => {
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

    const actionContainer = screen.getByTestId('option-comparison-actions-desktop');
    expect(actionContainer).toHaveClass('md:justify-end');
    expect(within(actionContainer).getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(within(actionContainer).queryByRole('link', { name: 'Details' })).not.toBeInTheDocument();
  });

  test('uses one quiet View action when a details target exists', () => {
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
    expect(card).toHaveClass('min-h-[4.75rem]');
    expect(card).toHaveClass('cursor-pointer');
    expect(card).toHaveClass('hover:bg-muted/30');
    expect(screen.getByTestId('option-comparison-row')).toHaveClass(OPTION_COMPARISON_GRID_CLASS);
    expect(screen.getByTestId('option-comparison-actions-desktop')).toHaveClass('md:justify-end');

    // Compare rows expose one small action; the full mode actions live in details sections.
    expect(screen.queryByRole('link', { name: 'View ride estimates' })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'View' }).some((link) => link.getAttribute('href') === '#rideshare-details'),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument();

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
    expect(
      within(cardContainer)
        .getAllByRole('link', { name: 'View' })
        .some((link) => link.getAttribute('href') === '#park-ride-details'),
    ).toBe(true);

    const { container: detailsContainer } = render(
      <ParkAndRideDetailsPanel details={presentation!.details} />,
    );

    expect(within(detailsContainer).getByText(/Nearby Park & Ride lots/i)).toBeInTheDocument();
    expect(within(detailsContainer).getByText(/Parking rules/i)).toBeInTheDocument();
    expect(within(detailsContainer).getByText(/Estimated wait:/i)).toBeInTheDocument();
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
