import { detectTripIntent } from '../lib/ai/detectTripIntent';
import { parseTripTextMock } from '../lib/ai/mockTripParser';
import { parseTripText } from '../lib/ai/parseTripText';
import {
  assistantRequiresConfirmation,
  parsedTripToSearchParams,
} from '../lib/ai/parsedTripToSearchParams';
import { resetAiParseBudgetForTests } from '../lib/ai/tripParseBudget';
import { isQuickGoMode } from '../lib/trip/quickGo';

describe('trip intent detection', () => {
  test('Fred Meyer commute is quick_go', () => {
    expect(
      detectTripIntent(
        "I'm heading to Fred Meyer in Monroe. Please prepare a commute for me",
      ),
    ).toBe('quick_go');
  });

  test('LAX parking is airport_trip', () => {
    expect(detectTripIntent('Need parking at LAX for 4 days')).toBe('airport_trip');
  });

  test('SEA to Vegas flight is airport_trip', () => {
    expect(detectTripIntent('Flying from SEA to Las Vegas Friday')).toBe('airport_trip');
  });
});

describe('mock trip parser', () => {
  beforeEach(() => {
    resetAiParseBudgetForTests();
    delete process.env.DISABLE_AI_ASSISTANT;
    delete process.env.AI_ASSISTANT_PROVIDER;
    delete process.env.MAX_AI_PARSE_CALLS_PER_REQUEST;
    delete process.env.OPENAI_API_KEY;
  });

  test('parses Fred Meyer Monroe as quick_go without airport missing fields', () => {
    const parsed = parseTripTextMock(
      "I'm heading to Fred Meyer in Monroe. Please prepare a commute for me",
      new Date('2026-06-02T14:30:00.000Z'),
    );

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.destinationText).toMatch(/Fred Meyer/i);
    expect(parsed.destinationText).toMatch(/Monroe/i);
    expect(parsed.missingFields).not.toContain('airportCode');
    expect(parsed.missingFields).not.toContain('departureDate');
    expect(parsed.airportCode).toBeNull();
  });

  test('parses Take me to Safeway Monroe as quick_go', () => {
    const parsed = parseTripTextMock('Take me to Safeway Monroe');

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.destinationText).toBe('Safeway Monroe');
  });

  test('parses "SEA to Vegas Nov 15 weekend"', () => {
    const parsed = parseTripTextMock(
      'SEA to Vegas Nov 15 weekend',
      new Date('2026-05-01T12:00:00.000Z'),
    );

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.airportCode).toBe('SEA');
    expect(parsed.destinationCity).toBe('Las Vegas');
    expect(parsed.departureDate).toBe('2026-11-15');
    expect(parsed.returnDate).toBe('2026-11-17');
    expect(parsed.needsParking).toBe(true);
    expect(parsed.missingFields).toContain('originText');
  });

  test('identifies missing origin when only airport and dates are present', () => {
    const parsed = parseTripTextMock('Need parking at LAX for 4 days starting Nov 15');

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.airportCode).toBe('LAX');
    expect(parsed.needsParking).toBe(true);
    expect(parsed.missingFields).toContain('originText');
  });

  test('parses Monroe to SeaTac weekend range', () => {
    const parsed = parseTripTextMock(
      'Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18, leaving from Monroe',
      new Date('2026-05-01T12:00:00.000Z'),
    );

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.originText).toBe('Monroe');
    expect(parsed.airportCode).toBe('SEA');
    expect(parsed.departureDate).toBe('2026-11-15');
    expect(parsed.returnDate).toBe('2026-11-18');
    expect(parsed.missingFields).not.toContain('originText');
  });

  test('mock mode makes zero external API calls', async () => {
    process.env.AI_ASSISTANT_PROVIDER = 'mock';

    const fetchMock = jest.spyOn(global, 'fetch');

    const parsed = await parseTripText(
      'Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18',
    );

    expect(parsed.parser).toBe('mock');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('confirm step required before recommendations', () => {
    const parsed = parseTripTextMock(
      'Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18',
      new Date('2026-05-01T12:00:00.000Z'),
    );

    expect(assistantRequiresConfirmation(false)).toBe(true);
    expect(parsedTripToSearchParams(parsed, { confirmed: false })).toBeNull();
    expect(parsedTripToSearchParams(parsed, { confirmed: true })).not.toBeNull();
  });

  test('quick_go search params omit airportCode', () => {
    const parsed = parseTripTextMock(
      "I'm heading to Fred Meyer in Monroe. Please prepare a commute for me",
      new Date('2026-06-02T14:30:00.000Z'),
    );

    const confirmed = {
      ...parsed,
      originSource: 'current_location' as const,
      departureDate: '2026-06-02',
      departureTime: '14:30',
      transportAvailability: 'all' as const,
      parkingPreference: 'destination' as const,
      parkingDurationMinutes: 60,
    };

    const params = parsedTripToSearchParams(confirmed, { confirmed: true });
    expect(params).not.toBeNull();
    expect(params?.get('airportCode')).toBeNull();
    expect(isQuickGoMode(params!)).toBe(true);
    expect(params?.get('intent')).toBe('general-trip');
    expect(params?.get('assistantParsed')).toBe('1');
    expect(params?.get('destination')).toMatch(/Fred Meyer/i);
    expect(params?.get('parkingCheckInDate')).toBe('2026-06-02');
    expect(params?.get('parkingCheckInTime')).toBe('14:30');
    expect(params?.get('parkingCheckOutDate')).toBe('2026-06-02');
    expect(params?.get('parkingCheckOutTime')).toBe('15:30');
  });

  test('extracts optional airline text and maps it to search params after confirm', () => {
    const parsed = parseTripTextMock(
      'Alaska flight to SeaTac Nov 15 weekend',
      new Date('2026-05-01T12:00:00.000Z'),
    );

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.airlineText).toBe('Alaska');
    expect(parsed.missingFields).toContain('originText');

    const confirmed = {
      ...parsed,
      originText: 'Monroe',
      missingFields: parsed.missingFields.filter((field) => field !== 'originText'),
    };

    const params = parsedTripToSearchParams(confirmed, { confirmed: true });
    expect(params?.get('airlineOrFlight')).toBe('Alaska Airlines');
    expect(params?.get('airport')).toBe('SEA');
  });
});

describe('/api/ai/parse-trip route', () => {
  beforeEach(() => {
    resetAiParseBudgetForTests();
    process.env.AI_ASSISTANT_PROVIDER = 'mock';
    process.env.MAX_AI_PARSE_CALLS_PER_REQUEST = '1';
  });

  test('does not trigger Google Places during parse', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const { POST } = await import('../app/api/ai/parse-trip/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/ai/parse-trip', {
      method: 'POST',
      body: JSON.stringify({ userText: 'SEA to Vegas Nov 15 weekend' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.airportCode).toBe('SEA');
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('openai.com')),
    ).toHaveLength(0);
  });
});
