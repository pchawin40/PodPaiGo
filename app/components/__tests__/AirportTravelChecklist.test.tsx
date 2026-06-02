import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AirportTravelChecklist, {
  buildAirportTravelChecklistItems,
} from '@/app/components/AirportTravelChecklist';

describe('AirportTravelChecklist', () => {
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
});
