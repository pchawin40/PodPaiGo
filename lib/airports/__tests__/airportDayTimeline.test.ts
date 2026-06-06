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
      'park-check-in',
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

  test('anchors lot arrival to explicit parking check-in time', () => {
    const milestones = buildAirportDayTimeline({
      leaveByTime: '05:10',
      parkingCheckInTime: '06:00',
      departureTime: '09:00',
      travelMinutes: 45,
      parkingBufferMinutes: 10,
      shuttleWalkMinutes: 17,
      airportBufferMinutes: 75,
      transportMode: 'parking',
      parkingPickName: 'WallyPark',
    });

    const arrive = milestones.find((item) => item.id === 'arrive-access');
    const park = milestones.find((item) => item.id === 'park-check-in');
    const shuttle = milestones.find((item) => item.id === 'terminal-access');

    expect(arrive?.timeLabel).toBe('6:00 AM');
    expect(park?.timeLabel).toBe('6:10 AM');
    expect(shuttle?.timeLabel).toBe('6:27 AM');
    expect(arrive?.timeLabel).not.toBe('TBD');
  });
});
