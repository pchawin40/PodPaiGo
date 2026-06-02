import {
  buildMockAssistantReply,
  buildResultsExplanation,
  isTripPlanningMessage,
} from '../assistantChat';
import type { Recommendation, TripData } from '../../types';

describe('assistantChat', () => {
  test('results explanation uses existing recommendation data', () => {
    const tripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      airportCode: 'SEA',
      destinationKind: 'airport',
      departureDate: '2026-11-15',
      departureTime: '12:00',
    } as TripData;

    const recommendation = {
      parking: [
        {
          id: 'jiffy',
          name: 'Jiffy Airport Parking',
          type: 'off-airport',
          price: 42,
          distance: 1,
          availability: 80,
          trustStatus: 'live',
          sourceName: 'ParkWhiz',
          lastUpdated: '2026-01-01T00:00:00.000Z',
          assumptions: [],
        },
      ],
      rideshare: [],
      transit: [],
      tsaEstimate: {
        destination: 'SEA',
        waitTime: 18,
        status: 'estimated',
        trustStatus: 'estimated',
        sourceName: 'TSA estimate',
        assumptions: [],
      },
      leaveByTime: '08:30',
    } as Recommendation;

    const reply = buildResultsExplanation('When should I leave?', {
      tripData,
      recommendation,
      leaveByTime: '08:15',
    });

    expect(reply).toContain('leave by 8:15 AM');
    expect(reply).toContain('already shown on this page');
    expect(reply).not.toContain('Google Routes');
  });

  test('mock chat response stays beginner friendly', () => {
    const reply = buildMockAssistantReply('hello there', 'home');
    expect(reply.toLowerCase()).toContain('hi');
    expect(reply).toContain('airport trip');
  });

  test('detects trip planning messages', () => {
    expect(
      isTripPlanningMessage('Weekend trip from Monroe to SEA Nov 15 to Nov 18 with parking'),
    ).toBe(true);
    expect(isTripPlanningMessage('hello')).toBe(false);
  });
});
