import { parseTripTextMock } from '../mockTripParser';
import {
  isAirportPlanningTrip,
  isLocalDestinationTrip,
  normalizeParsedTripAssistantResult,
} from '../normalizeParsedTrip';
import { parsedTripToSearchParams } from '../parsedTripToSearchParams';
import {
  applyTripPlanningDefaults,
  buildTripPlanningTurn,
  extractCityLabelFromAddress,
  getNextMissingField,
  reprocessParsedTrip,
} from '../tripPlanningConversation';

const NOW = new Date('2026-06-05T12:00:00');

describe('AI trip planner classification guards', () => {
  test('Pike Place is classified as local destination, not airport', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock("I'm going to Pike Place Market", NOW),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.destinationKind).toBe('downtown');
    expect(isLocalDestinationTrip(parsed)).toBe(true);
    expect(isAirportPlanningTrip(parsed)).toBe(false);
    expect(parsed.airportCode).toBeNull();
  });

  test('Pike Place never asks which airport even when parser returns airport_trip', () => {
    const parsed = reprocessParsedTrip(
      normalizeParsedTripAssistantResult(
        {
          mode: 'airport_trip',
          destinationText: 'Pike Place Market',
          destinationKind: 'downtown',
          originText: null,
          airportCode: null,
          confidence: 'medium',
          missingFields: ['originText', 'airportCode'],
        },
        'openai',
      )!,
      {},
      NOW,
    );

    const turn = buildTripPlanningTurn(parsed, {
      geolocationAvailable: true,
      geolocationDenied: false,
      currentLocationLabel: 'Monroe, WA',
    });

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.missingFields).not.toContain('airportCode');
    expect(turn.question).toMatch(/starting near Monroe, WA/i);
    expect(turn.question).not.toMatch(/Which airport/i);
    expect(turn.quickReplies.map((reply) => reply.label)).not.toContain('SEA');
    expect(turn.quickReplies.map((reply) => reply.label)).not.toContain('PAE');
  });

  test('Pike Place asks origin before any other field', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock("I'm going to Pike Place Market", NOW),
      {},
      NOW,
    );

    expect(getNextMissingField(parsed)).toBe('originText');
    expect(parsed.missingFields[0]).toBe('originText');
    expect(parsed.clarificationQuestions).toHaveLength(1);
  });

  test('Fred Meyer does not trigger airport flow', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock("I'm heading to Fred Meyer in Monroe", NOW),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('quick_go');
    expect(isAirportPlanningTrip(parsed)).toBe(false);
    expect(parsed.missingFields).not.toContain('airportCode');

    const turn = buildTripPlanningTurn(parsed, {
      geolocationAvailable: false,
      geolocationDenied: false,
      currentLocationLabel: null,
    });
    expect(turn.question).not.toMatch(/Which airport/i);
  });

  test('SeaTac airport asks flight follow-up after origin is known', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18', NOW),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.airportCode).toBe('SEA');
    expect(isAirportPlanningTrip(parsed)).toBe(true);
    expect(getNextMissingField(parsed)).toBe('departureTime');
  });

  test('LAX parking for 4 days stays in airport parking flow', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Need parking at LAX for 4 days', NOW),
      {},
      NOW,
    );

    expect(parsed.airportCode).toBe('LAX');
    expect(isAirportPlanningTrip(parsed)).toBe(true);
    expect(isLocalDestinationTrip(parsed)).toBe(false);
    expect(['airport_trip', 'parking_only']).toContain(parsed.mode);
    expect(parsed.missingFields).not.toContain('destinationText');
  });

  test('only one active clarification question at a time', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Flying to Vegas Friday night and coming back Sunday.', NOW),
      {},
      NOW,
    );

    expect(parsed.missingFields.length).toBeGreaterThan(1);
    expect(parsed.clarificationQuestions).toHaveLength(1);
    expect(getNextMissingField(parsed)).toBe('originText');
  });

  test('local trips never expose SEA or PAE quick replies', () => {
    const turn = buildTripPlanningTurn(
      reprocessParsedTrip(
        parseTripTextMock("I'm going to Pike Place Market tomorrow. Plan commute for me.", NOW),
        {},
        NOW,
      ),
      {
        geolocationAvailable: true,
        geolocationDenied: false,
        currentLocationLabel: 'Monroe, WA',
      },
    );

    const labels = turn.quickReplies.map((reply) => reply.label);
    expect(labels).not.toContain('SEA');
    expect(labels).not.toContain('PAE');
  });
});

describe('AI trip planner Pike Place flow', () => {
  test('incomplete Pike Place asks only for origin with conversational copy', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock(
        'I am going to Pike Place Market tomorrow. Plan commute for me.',
        NOW,
      ),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.destinationText).toBe('Pike Place Market');
    expect(parsed.departureDate).toBe('2026-06-06');
    expect(parsed.departureTime).toBe('09:00');
    expect(parsed.transportAvailability).toBe('all');
    expect(parsed.parkingPreference).toBe('nearby');
    expect(parsed.status).toBe('needs_clarification');
    expect(parsed.missingFields).toEqual(['originText']);
    expect(parsed.missingFields).not.toContain('targetTime');
    expect(parsed.missingFields).not.toContain('transportAvailability');
    expect(parsed.missingFields).not.toContain('parkingPreference');

    const turn = buildTripPlanningTurn(parsed, {
      geolocationAvailable: true,
      geolocationDenied: false,
      currentLocationLabel: 'Monroe, WA',
    });

    expect(turn.headline).toBe('I just need one detail');
    expect(turn.acknowledgment).toMatch(/Got it — Pike Place Market/i);
    expect(turn.acknowledgment).toMatch(/compare driving, parking, rideshare, and transit/i);
    expect(turn.question).toMatch(/starting near Monroe, WA/i);
    expect(turn.quickReplies.map((reply) => reply.label)).toEqual(['Yes', 'Change start']);
    expect(turn.assumptions.some((item) => item.label === 'Compare all options')).toBe(true);
    expect(turn.assumptions.some((item) => item.label === 'Parking near destination')).toBe(true);
    expect(turn.question).toMatch(/starting near Monroe, WA/i);
    expect(parsed.clarificationQuestions?.[0]).toMatch(/starting from for Pike Place Market/i);
    expect(parsed.clarificationQuestions?.[0]).not.toMatch(/A few details needed/i);
  });

  test('complete Pike Place flow becomes review-ready', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock(
        [
          'I am going to Pike Place Market tomorrow. Plan commute for me.',
          'From Monroe, arrive by 9 AM, compare all, park for 8 hours.',
        ].join('\n'),
        NOW,
      ),
      {},
      NOW,
    );

    expect(parsed.status).toBe('ready_for_review');
    expect(parsed.originText).toBe('Monroe');
    expect(parsed.transportAvailability).toBe('all');
    expect(parsed.parkingPreference).toBe('nearby');
    expect(parsed.parkingDurationMinutes).toBe(480);

    const params = parsedTripToSearchParams(parsed, { confirmed: true });
    expect(params?.get('type')).toBe('general-trip');
    expect(params?.get('origin')).toBe('Monroe');
    expect(params?.get('destination')).toBe('Pike Place Market');
    expect(params?.get('transport')).toBe('all');
  });
});

describe('AI trip planner Fred Meyer and defaults', () => {
  test('Fred Meyer infers destination parking and compare-all default', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock(
        "I'm heading to Fred Meyer in Monroe. Please prepare a commute for me",
        NOW,
      ),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.destinationText).toMatch(/Fred Meyer/i);
    expect(parsed.transportAvailability).toBe('all');
    expect(parsed.parkingPreference).toBe('destination');
    expect(parsed.parkingDurationMinutes).toBe(90);
    expect(parsed.missingFields).toEqual(['originText']);
    expect(parsed.missingFields).not.toContain('transportAvailability');
    expect(parsed.missingFields).not.toContain('parkingPreference');
  });

  test('compare-all default avoids compare question', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Take me to Bellevue Square tomorrow from Monroe at 9am', NOW),
      {},
      NOW,
    );

    expect(parsed.transportAvailability).toBe('all');
    expect(getNextMissingField(parsed)).not.toBe('transportAvailability');
    const turn = buildTripPlanningTurn(parsed, {
      geolocationAvailable: false,
      geolocationDenied: false,
      currentLocationLabel: null,
    });
    expect(turn.question).not.toMatch(/compare all options unless/i);
  });
});

describe('AI trip planner airport weekend flow', () => {
  test('SeaTac weekend without origin asks for starting point first', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Weekend trip to SeaTac, Nov 15 to Nov 18', NOW),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.airportCode).toBe('SEA');
    expect(parsed.departureDate).toBe('2026-11-15');
    expect(parsed.returnDate).toBe('2026-11-18');
    expect(parsed.transportAvailability).toBe('all');
    expect(getNextMissingField(parsed)).toBe('originText');
  });

  test('SeaTac weekend with origin may still need flight time', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18', NOW),
      {},
      NOW,
    );

    expect(parsed.originText).toBe('Monroe');
    expect(parsed.missingFields).toContain('departureTime');
    expect(getNextMissingField(parsed)).toBe('departureTime');
  });

  test('incomplete Vegas flight asks one airport field at a time', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('Flying to Vegas Friday night and coming back Sunday.', NOW),
      {},
      NOW,
    );

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.destinationCity).toBe('Las Vegas');
    expect(parsed.missingFields).toContain('originText');
    expect(parsed.missingFields).toContain('airportCode');
    expect(parsed.clarificationQuestions).toHaveLength(1);
    expect(parsed.clarificationQuestions?.[0]).toMatch(/starting from/i);
  });
});

describe('AI trip planner conversation UX helpers', () => {
  test('one field at a time via priority order', () => {
    const parsed = reprocessParsedTrip(
      parseTripTextMock('I am going to Pike Place Market tomorrow. Plan commute for me.', NOW),
      {},
      NOW,
    );

    expect(getNextMissingField(parsed)).toBe('originText');
    expect(parsed.clarificationQuestions).toHaveLength(1);
  });

  test('quick replies exist for current location confirmation', () => {
    const turn = buildTripPlanningTurn(
      reprocessParsedTrip(
        parseTripTextMock('I am going to Pike Place Market tomorrow. Plan commute for me.', NOW),
        {},
        NOW,
      ),
      {
        geolocationAvailable: true,
        geolocationDenied: false,
        currentLocationLabel: 'Monroe, WA',
      },
    );

    expect(turn.quickReplies).toHaveLength(2);
    expect(turn.quickReplies[0].patch).toEqual({
      originSource: 'current_location',
      originText: null,
    });
  });

  test('denied geolocation uses gentle copy', () => {
    const turn = buildTripPlanningTurn(
      reprocessParsedTrip(
        parseTripTextMock('I am going to Pike Place Market tomorrow. Plan commute for me.', NOW),
        {},
        NOW,
      ),
      {
        geolocationAvailable: true,
        geolocationDenied: true,
        currentLocationLabel: null,
      },
    );

    expect(turn.question).toBe('No problem — enter your starting address.');
    expect(turn.question).not.toMatch(/Where are you starting from for Pike Place/i);
  });

  test('Plan Trip gating only when review-ready', () => {
    const incomplete = reprocessParsedTrip(
      parseTripTextMock('I am going to Pike Place Market tomorrow. Plan commute for me.', NOW),
      {},
      NOW,
    );
    const complete = reprocessParsedTrip(incomplete, {
      originSource: 'current_location',
      originText: null,
    }, NOW);

    expect(buildTripPlanningTurn(incomplete, {
      geolocationAvailable: true,
      geolocationDenied: false,
      currentLocationLabel: 'Monroe, WA',
    }).status).toBe('needs_clarification');
    expect(buildTripPlanningTurn(complete, {
      geolocationAvailable: true,
      geolocationDenied: false,
      currentLocationLabel: 'Monroe, WA',
    }).status).toBe('ready_for_review');
    expect(parsedTripToSearchParams(complete, { confirmed: true })).not.toBeNull();
    expect(parsedTripToSearchParams(incomplete, { confirmed: true })).toBeNull();
  });

  test('extractCityLabelFromAddress formats reverse-geocode labels', () => {
    expect(extractCityLabelFromAddress('19651 US-2, Monroe, WA, USA')).toBe('Monroe, WA');
    expect(extractCityLabelFromAddress('Current location near Monroe, WA')).toBe('Monroe, WA');
  });

  test('applyTripPlanningDefaults leaves explicit user preferences intact', () => {
    const parsed = applyTripPlanningDefaults(
      parseTripTextMock("I'll Uber to Pike Place tomorrow from Monroe at 9am with no parking.", NOW),
      NOW,
    );

    expect(parsed.transportAvailability).toBe('rideshare');
    expect(parsed.parkingPreference).toBe('none');
  });
});
