import { extractTripIntents, tripIntentToCard } from '../tripIntents';
import { parsedTripToSearchParams } from '../parsedTripToSearchParams';
import {
  buildMultiIntentTurn,
  buildTripPlanningTurn,
  reprocessParsedTrip,
  shouldAppendPlanningTurn,
} from '../tripPlanningConversation';

const NOW = new Date('2026-06-05T12:00:00');

const GEO_CONTEXT = {
  geolocationAvailable: true,
  geolocationDenied: false,
  currentLocationLabel: 'Monroe, WA',
};

function vegasEventIntent() {
  return extractTripIntents(
    'Help me get to the raiders stadium if I am staying at bellagio hotel in vegas',
    { now: NOW },
  ).intents[0];
}

describe('Scenario D — correction recovery', () => {
  test('a lodging-origin event never asks to confirm Monroe in the first place', () => {
    const turn = buildTripPlanningTurn(vegasEventIntent().parsed, GEO_CONTEXT);
    expect(turn.question).not.toMatch(/starting near Monroe/i);
    expect(turn.quickReplies.map((reply) => reply.label)).not.toContain('Yes');
  });

  test('reject flow recovers the origin from the original message instead of a blank box', () => {
    const intent = vegasEventIntent();
    // Simulate the assistant having wrongly cleared the origin, then "No".
    const withoutOrigin = reprocessParsedTrip(
      intent.parsed,
      { originText: null, originSource: 'unknown' },
      NOW,
    );

    const turn = buildTripPlanningTurn(withoutOrigin, GEO_CONTEXT, {
      originInputMode: true,
      originInputReason: 'reject',
      suggestedOrigin: intent.origin,
    });

    expect(turn.question).toMatch(/Bellagio/i);
    const labels = turn.quickReplies.map((reply) => reply.label);
    expect(labels.some((label) => /Use Bellagio/i.test(label))).toBe(true);
  });
});

describe('Scenario F — event parking behavior is preserved', () => {
  const intent = vegasEventIntent();

  test('compare modes prioritize event parking / transit / rideshare over street/meter', () => {
    expect(intent.compareModes[0]).toBe('event-parking');
    expect(intent.compareModes).toContain('transit');
    expect(intent.compareModes).toContain('rideshare');
    // Street/meter is present only as the trailing fallback.
    expect(intent.compareModes[intent.compareModes.length - 1]).toBe('street-meter');
    expect(intent.compareModes.indexOf('street-meter')).toBeGreaterThan(
      intent.compareModes.indexOf('event-parking'),
    );
  });

  test('search params mark the trip as an event venue and never use destination/customer parking', () => {
    const params = parsedTripToSearchParams(intent.parsed, { confirmed: true });
    expect(params).not.toBeNull();
    expect(params?.get('destinationKind')).toBe('event');
    expect(params?.get('assistantEvent')).toBe('1');
    expect(params?.get('parkingPreference')).not.toBe('destination');
  });
});

describe('event game-time clarification', () => {
  test('acknowledging an unknown game time makes the trip review-ready with no invented time', () => {
    const intent = vegasEventIntent();
    expect(intent.parsed.missingFields).toContain('eventTime');

    const acknowledged = reprocessParsedTrip(
      intent.parsed,
      { eventContext: { ...intent.parsed.eventContext!, eventTimeAcknowledged: true } },
      NOW,
    );

    expect(acknowledged.missingFields).not.toContain('eventTime');
    expect(acknowledged.status).toBe('ready_for_review');
    // We never fabricate a real game time.
    expect(acknowledged.eventContext?.eventTimeKnown).toBe(false);
  });
});

describe('driving preferences flow into additive route params without claiming HOV', () => {
  test('Express Pass attaches toll-pass but not HOV eligibility when occupancy unknown', () => {
    const intent = extractTripIntents(
      'Best way from Monroe to SeaTac tomorrow morning with carpool and Express Pass.',
      { now: NOW },
    ).intents[0];
    // Resolve the passenger-count slot as "not sure" so we can build params.
    const resolved = reprocessParsedTrip(
      intent.parsed,
      {
        drivingPreferences: {
          ...intent.parsed.drivingPreferences!,
          occupancyConfirmedUnknown: true,
        },
      },
      NOW,
    );

    const params = parsedTripToSearchParams(resolved, { confirmed: true });
    expect(params?.get('hasTollPass')).toBe('1');
    expect(params?.get('hovEligible')).toBe('0');
    expect(params?.get('showExpressLaneNotes')).toBe('1');
  });
});

describe('Scenario H — multi-intent selection produces no duplicate cards', () => {
  const extraction = extractTripIntents(
    "Tomorrow I need the best way to get to SeaTac from Monroe. Also for my Vegas trip, I'm staying at Bellagio and need to get to the Seahawks/Raiders game.",
    { now: NOW },
  );

  test('builds a single selection turn with one card and button per intent', () => {
    const cards = extraction.intents.map(tripIntentToCard);
    const turn = buildMultiIntentTurn(cards);

    expect(turn.intents).toHaveLength(2);
    expect(turn.quickReplies).toHaveLength(2);
    expect(turn.quickReplies.every((reply) => reply.action === 'select_intent')).toBe(true);
    expect(turn.quickReplies.map((reply) => reply.intentId)).toEqual(
      extraction.intents.map((intent) => intent.id),
    );
  });

  test('the same unresolved clarification is not appended twice', () => {
    const intent = extraction.intents[0];
    const turn = buildTripPlanningTurn(intent.parsed, GEO_CONTEXT);
    expect(shouldAppendPlanningTurn(turn, turn, intent.parsed, intent.parsed)).toBe(false);
  });
});
