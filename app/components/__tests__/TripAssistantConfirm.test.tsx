import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TripAssistantConfirm from '@/app/components/TripAssistantConfirm';
import type { ParsedTripAssistantResult } from '@/lib/ai/tripParseTypes';

function buildParsed(airlineText: string | null): ParsedTripAssistantResult {
  return {
    originText: 'Monroe',
    airportCode: 'SEA',
    destinationCity: null,
    airlineText,
    departureDate: '2026-11-15',
    departureTime: '12:00',
    returnDate: null,
    returnTime: null,
    tripType: 'one-way-departure',
    needsParking: true,
    needsLeaveTime: true,
    missingFields: [],
    confidence: 'high',
    parser: 'mock',
  };
}

describe('TripAssistantConfirm airline hint', () => {
  test('shows detected Alaska Airlines label for Alaska input', () => {
    const html = renderToStaticMarkup(
      React.createElement(TripAssistantConfirm, {
        parsed: buildParsed('Alaska'),
        onChange: () => undefined,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(html).toContain('Detected: Alaska Airlines');
  });

  test('does not show detected label for unknown airline', () => {
    const html = renderToStaticMarkup(
      React.createElement(TripAssistantConfirm, {
        parsed: buildParsed('Cool Airline'),
        onChange: () => undefined,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(html).not.toContain('Detected:');
  });
});
