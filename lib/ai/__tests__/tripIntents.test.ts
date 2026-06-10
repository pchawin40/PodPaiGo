import { extractTripIntents, segmentTripText, tripIntentToCard } from '../tripIntents';
import { buildTripPlanningTurn } from '../tripPlanningConversation';

const NOW = new Date('2026-06-05T12:00:00');

const GEO_CONTEXT = {
  geolocationAvailable: true,
  geolocationDenied: false,
  currentLocationLabel: 'Monroe, WA',
};

describe('segmentTripText', () => {
  test('keeps a single trip described across several sentences as one segment', () => {
    const segments = segmentTripText(
      'I am going to seattle seahawks game when they go to vegas. November 13 - november 15. Help me find a way to get to the raiders stadium if I am staying at bellagio hotel in vegas',
    );
    expect(segments).toHaveLength(1);
  });

  test('splits on a new-trip connector ("Also for my Vegas trip")', () => {
    const segments = segmentTripText(
      "Tomorrow I need the best way to get to SeaTac from Monroe. I might have a carpool and I have Express Pass / toll lane access. Also for my Vegas trip, I'm staying at Bellagio and need to get to the Seahawks/Raiders game.",
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatch(/SeaTac/i);
    expect(segments[0]).toMatch(/Express Pass/i);
    expect(segments[1]).toMatch(/Bellagio/i);
    expect(segments[1]).toMatch(/Seahawks\/Raiders/i);
  });
});

describe('Scenario A — Vegas event lodging', () => {
  const extraction = extractTripIntents(
    'I am going to seattle seahawks game when they go to vegas. November 13 - november 15. Help me find a way to get to the raiders stadium if I am staying at bellagio hotel in vegas',
    { now: NOW },
  );
  const intent = extraction.intents[0];

  test('detects exactly one event-local intent', () => {
    expect(extraction.intents).toHaveLength(1);
    expect(intent.intentType).toBe('event-local');
  });

  test('uses Las Vegas trip city and Bellagio origin, not Monroe/current location', () => {
    expect(intent.tripCity).toBe('Las Vegas');
    expect(intent.origin).toBe('Bellagio Hotel & Casino, Las Vegas');
    expect(intent.originSource).toBe('manual');
    expect(intent.missingSlots).not.toContain('originText');
  });

  test('infers Allegiant Stadium as the destination', () => {
    expect(intent.destination).toBe('Allegiant Stadium');
    expect(intent.parsed.destinationKind).toBe('event');
  });

  test('captures Seahawks/Raiders event context', () => {
    expect(intent.eventContext?.isEvent).toBe(true);
    expect(intent.eventContext?.eventLabel).toMatch(/seahawks\/raiders/i);
    expect(intent.eventContext?.venueName).toBe('Allegiant Stadium');
  });

  test('asks for the game time and never asks about Monroe', () => {
    expect(intent.recommendedNextQuestion).toMatch(/game time/i);
    const turn = buildTripPlanningTurn(intent.parsed, GEO_CONTEXT);
    expect(turn.question).toMatch(/game time/i);
    expect(turn.question).not.toMatch(/Monroe/i);
    expect(turn.acknowledgment).not.toMatch(/Monroe/i);
    expect(turn.quickReplies.map((reply) => reply.label)).not.toContain('Yes');
  });
});

describe('Scenario B — multi-intent message', () => {
  const extraction = extractTripIntents(
    "Tomorrow I need the best way to get to SeaTac from Monroe. I might have a carpool and I have Express Pass / toll lane access. Also for my Vegas trip, I'm staying at Bellagio and need to get to the Seahawks/Raiders game.",
    { now: NOW },
  );

  test('detects at least two distinct intents', () => {
    expect(extraction.intents.length).toBeGreaterThanOrEqual(2);
  });

  test('first intent is Monroe → SeaTac airport access with carpool/toll preferences', () => {
    const airport = extraction.intents[0];
    expect(airport.intentType).toBe('airport-access');
    expect(airport.parsed.airportCode).toBe('SEA');
    expect(airport.parsed.originText).toBe('Monroe');
    expect(airport.drivingPreferences?.carpoolPossible).toBe(true);
    expect(airport.drivingPreferences?.expressPassAvailable).toBe(true);
    expect(airport.drivingPreferences?.tollLaneAllowed).toBe(true);
  });

  test('second intent is the Bellagio → Allegiant Stadium event, not merged with SeaTac', () => {
    const event = extraction.intents[1];
    expect(event.intentType).toBe('event-local');
    expect(event.destination).toBe('Allegiant Stadium');
    expect(event.origin).toBe('Bellagio Hotel & Casino, Las Vegas');
    expect(event.parsed.airportCode).toBeNull();
  });

  test('intents convert to selection cards with distinct Plan buttons', () => {
    const cards = extraction.intents.map(tripIntentToCard);
    expect(cards).toHaveLength(2);
    expect(cards[0].buttonLabel).toMatch(/SEA/);
    expect(cards[1].buttonLabel).toMatch(/stadium|event/i);
    expect(new Set(cards.map((card) => card.buttonLabel)).size).toBe(2);
  });
});

describe('Scenario C — carpool/toll SeaTac', () => {
  const extraction = extractTripIntents(
    'Best way from Monroe to SeaTac tomorrow morning with carpool and Express Pass.',
    { now: NOW },
  );
  const intent = extraction.intents[0];

  test('is a single airport-access intent from Monroe to SEA', () => {
    expect(extraction.intents).toHaveLength(1);
    expect(intent.intentType).toBe('airport-access');
    expect(intent.parsed.originText).toBe('Monroe');
    expect(intent.parsed.airportCode).toBe('SEA');
  });

  test('captures carpool / Express Pass / toll preferences', () => {
    expect(intent.drivingPreferences?.carpoolPossible).toBe(true);
    expect(intent.drivingPreferences?.expressPassAvailable).toBe(true);
    expect(intent.drivingPreferences?.tollLaneAllowed).toBe(true);
  });

  test('does not claim HOV eligibility before passenger count is known', () => {
    expect(intent.drivingPreferences?.hovLaneEligible).toBe('unknown');
  });

  test('asks for passenger count as the next best detail', () => {
    expect(intent.missingSlots).toContain('passengerCount');
    expect(intent.recommendedNextQuestion).toMatch(/how many people/i);
  });
});

describe('Scenario G — normal point A to B is unchanged', () => {
  const extraction = extractTripIntents("I'm going to Pike Place Market from Monroe", { now: NOW });
  const intent = extraction.intents[0];

  test('is a single general-local intent, not event or airport', () => {
    expect(extraction.intents).toHaveLength(1);
    expect(intent.intentType).toBe('general-local');
    expect(intent.parsed.mode).toBe('quick_go');
    expect(intent.destination).toMatch(/Pike Place/i);
    expect(intent.eventContext).toBeNull();
    expect(intent.drivingPreferences).toBeNull();
    expect(intent.parsed.airportCode).toBeNull();
  });
});
