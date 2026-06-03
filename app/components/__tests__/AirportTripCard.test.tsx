/**
 * @jest-environment jsdom
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AirportTripCard from '@/app/components/AirportTripCard';

describe('AirportTripCard', () => {
  test('renders airport companion sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(AirportTripCard, {
        airportCode: 'SEA',
        airlineOrFlight: 'AS 123',
        leaveByTime: '06:42',
        parkingPickName: 'SEA Garage',
        transportMode: 'parking',
        departureTime: '09:30',
      }),
    );

    expect(html).toContain('SEA');
    expect(html).toContain('Overview');
    expect(html).toContain('Timeline');
    expect(html).toContain('Checklist');
    expect(html).toContain('Actions');
    expect(html).toContain('Leave by');
    expect(html).toContain('SEA Garage');
  });
});
