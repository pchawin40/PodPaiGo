/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import AirportTravelChecklist, {
  AIRPORT_CHECKLIST_STORAGE_PREFIX,
  buildAirportChecklistStorageKey,
  buildAirportTravelChecklistItems,
  buildDefaultChecklistState,
  mergeChecklistStateWithDefaults,
  parseAirportChecklistStorage,
} from '@/app/components/AirportTravelChecklist';

const TRIP_KEY = 'SEA:2026-06-01:12:00';

describe('AirportTravelChecklist', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  test('renders core checklist items', () => {
    const html = renderToStaticMarkup(
      React.createElement(AirportTravelChecklist, {
        bagPlan: 'none',
        hasParkingOrRidesharePlan: true,
      }),
    );

    expect(html).toContain('ID / passport');
    expect(html).toContain('Boarding pass');
    expect(html).toContain('Parking reservation / rideshare plan');
    expect(html).toContain('TSA liquids');
    expect(html).toContain('Phone charger / power bank');
    expect(html).toContain('+ Add item');
    expect(html).toContain('Reset');
  });

  test('includes checked bag cutoff and return reminder when applicable', () => {
    const items = buildAirportTravelChecklistItems({
      bagPlan: 'checked',
      hasParkingOrRidesharePlan: false,
      returnDate: '2026-06-10',
    });

    expect(items.some((item) => item.label.includes('Checked bag drop-off cutoff'))).toBe(true);
    expect(items.some((item) => item.label.includes('Return trip reminder'))).toBe(true);
  });

  test('can check and uncheck an item', () => {
    render(
      <AirportTravelChecklist
        bagPlan="none"
        storageKey={TRIP_KEY}
      />,
    );

    const passport = screen.getByLabelText('ID / passport') as HTMLInputElement;
    expect(passport.checked).toBe(false);

    fireEvent.click(passport);
    expect(passport.checked).toBe(true);

    fireEvent.click(passport);
    expect(passport.checked).toBe(false);
  });

  test('can add a custom item', () => {
    render(
      <AirportTravelChecklist
        bagPlan="none"
        storageKey={TRIP_KEY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fireEvent.change(screen.getByLabelText('New checklist item'), {
      target: { value: 'Print boarding pass backup' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Print boarding pass backup')).toBeInTheDocument();
  });

  test('can delete a custom item', () => {
    render(
      <AirportTravelChecklist
        bagPlan="none"
        storageKey={TRIP_KEY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fireEvent.change(screen.getByLabelText('New checklist item'), {
      target: { value: 'Snacks for flight' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Snacks for flight' }));
    expect(screen.queryByText('Snacks for flight')).not.toBeInTheDocument();
  });

  test('reset restores defaults after confirm', () => {
    const confirmMock = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AirportTravelChecklist
        bagPlan="none"
        hasParkingOrRidesharePlan
        storageKey={TRIP_KEY}
      />,
    );

    const parking = screen.getByLabelText('Parking reservation / rideshare plan') as HTMLInputElement;
    expect(parking.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fireEvent.change(screen.getByLabelText('New checklist item'), {
      target: { value: 'Travel pillow' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(confirmMock).toHaveBeenCalled();
    expect(screen.queryByText('Travel pillow')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Parking reservation / rideshare plan') as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText('ID / passport') as HTMLInputElement).checked).toBe(false);
  });

  test('state persists via localStorage', () => {
    const { unmount } = render(
      <AirportTravelChecklist
        bagPlan="none"
        storageKey={TRIP_KEY}
      />,
    );

    fireEvent.click(screen.getByLabelText('Boarding pass'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fireEvent.change(screen.getByLabelText('New checklist item'), {
      target: { value: 'Water bottle' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    unmount();

    render(
      <AirportTravelChecklist
        bagPlan="none"
        storageKey={TRIP_KEY}
      />,
    );

    expect((screen.getByLabelText('Boarding pass') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Water bottle')).toBeInTheDocument();

    const raw = window.localStorage.getItem(buildAirportChecklistStorageKey(TRIP_KEY));
    expect(raw).toContain('Water bottle');
    expect(raw).toContain('"boarding-pass":true');
  });

  test('merge and parse helpers keep stable default ids', () => {
    const defaults = buildAirportTravelChecklistItems({
      bagPlan: 'none',
      hasParkingOrRidesharePlan: false,
    });

    const merged = mergeChecklistStateWithDefaults(defaults, {
      checked: { 'id-passport': true, 'custom-abc': true },
      customItems: [{ id: 'custom-abc', label: 'Neck pillow', custom: true }],
    });

    expect(merged.checked['id-passport']).toBe(true);
    expect(merged.customItems).toHaveLength(1);

    const serialized = JSON.stringify(merged);
    const parsed = parseAirportChecklistStorage(serialized);
    expect(parsed?.customItems[0]?.label).toBe('Neck pillow');
    expect(buildAirportChecklistStorageKey('trip-1')).toBe(
      `${AIRPORT_CHECKLIST_STORAGE_PREFIX}trip-1`,
    );
    expect(buildDefaultChecklistState(defaults).customItems).toEqual([]);
  });
});
