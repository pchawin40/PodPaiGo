import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildAirportDayTimeline } from '../airportDayTimeline';
import AirportDayTimeline from '@/app/components/AirportDayTimeline';

describe('buildAirportDayTimeline', () => {
  test('renders leave, arrive, security, boarding, and departure milestones', () => {
    const milestones = buildAirportDayTimeline({
      leaveByTime: '08:00',
      departureTime: '12:00',
      travelMinutes: 45,
      airportBufferMinutes: 90,
      transportMode: 'parking',
      shuttleWalkMinutes: 20,
      parkingPickName: 'WallyPark',
    });

    expect(milestones.map((item) => item.id)).toEqual([
      'leave-home',
      'arrive-access',
      'terminal-access',
      'security-target',
      'boarding-target',
      'flight-departure',
    ]);

    const html = renderToStaticMarkup(
      React.createElement(AirportDayTimeline, { milestones }),
    );

    expect(html).toContain('Leave home');
    expect(html).toContain('Security target');
    expect(html).toContain('Boarding target');
    expect(html).toContain('Flight departure');
  });

  test('uses backup route travel minutes for airport arrival timing', () => {
    const milestones = buildAirportDayTimeline({
      leaveByTime: '08:00',
      departureTime: '12:00',
      travelMinutes: 42,
      airportBufferMinutes: 90,
      transportMode: 'parking',
    });

    const html = renderToStaticMarkup(
      React.createElement(AirportDayTimeline, { milestones }),
    );

    expect(html).toContain('Arrive at parking / pickup point');
    expect(html).toContain('8:42 AM');
    expect(html).toContain('42 min travel estimate');
    expect(html).not.toContain('Travel time estimate unavailable');
  });
});
