import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TripAssistantConfirm from '@/app/components/TripAssistantConfirm';
import type { ParsedTripAssistantResult } from '@/lib/ai/tripParseTypes';

function buildParsed(airlineText: string | null): ParsedTripAssistantResult {
  return {
    mode: 'airport_trip',
    destinationText: null,
    originSource: 'manual',
    destinationCategory: null,
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

function buildQuickGoParsed(): ParsedTripAssistantResult {
  return {
    mode: 'quick_go',
    destinationText: 'Fred Meyer Monroe',
    originSource: 'unknown',
    destinationCategory: 'grocery_or_retail',
    originText: null,
    airportCode: null,
    destinationCity: null,
    airlineText: null,
    departureDate: '2026-06-02',
    departureTime: '14:30',
    returnDate: null,
    returnTime: null,
    tripType: 'quick-go',
    needsParking: false,
    needsLeaveTime: false,
    missingFields: [],
    confidence: 'high',
    parser: 'mock',
  };
}

describe('TripAssistantConfirm quick go', () => {
  test('does not render airport code field for quick_go', () => {
    const html = renderToStaticMarkup(
      React.createElement(TripAssistantConfirm, {
        parsed: buildQuickGoParsed(),
        onChange: () => undefined,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(html).toContain('Review Quick Go trip');
    expect(html).toContain('Destination');
    expect(html).not.toContain('Airport code');
    expect(html).not.toContain('Departure date');
  });
});

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
