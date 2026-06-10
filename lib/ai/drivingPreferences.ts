import type { DrivingPreferences } from './tripParseTypes';

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const CARPOOL_PATTERN = /\b(carpool(?:ing)?|car ?pool|ride together|riding together|share a ride)\b/i;
const HOV_PATTERN = /\b(hov|high[- ]occupancy|carpool lane)\b/i;
const EXPRESS_PASS_PATTERN =
  /\b(express pass|express toll|express lane(?:s)? (?:pass|access)|good ?to ?go|flex pass)\b/i;
const TOLL_LANE_PATTERN = /\b(toll lane(?:s)?|toll road(?:s)?|express toll|hot lane(?:s)?)\b/i;
const AVOID_TOLLS_PATTERN = /\b(avoid tolls?|no tolls?|without tolls?|skip the toll)\b/i;
const PAY_TOLL_FOR_TIME_PATTERN =
  /\b(?:pay|use|take|ok with|okay with|fine with) (?:the )?tolls?\b[^.]*\b(?:save|faster|quicker|time|speed)\b/i;
const TOLL_OK_PATTERN = /\b(toll(?:s)? (?:ok|okay|allowed|fine|are fine)|allow tolls?|tolls? are ok)\b/i;

function extractNumberOfPeople(text: string): number | null {
  const lower = text.toLowerCase();

  if (/\b(just me|by myself|solo|alone|driving alone|just myself)\b/.test(lower)) return 1;

  const digitMatch = lower.match(/\b(\d{1,2})\s*(?:people|passengers?|of us|adults?|riders?|in the car|in my car)\b/);
  if (digitMatch) {
    const value = Number(digitMatch[1]);
    if (Number.isFinite(value) && value >= 1 && value <= 8) return value;
  }

  const partyMatch = lower.match(/\b(?:party|group)\s+of\s+(\d{1,2})\b/);
  if (partyMatch) {
    const value = Number(partyMatch[1]);
    if (Number.isFinite(value) && value >= 1 && value <= 8) return value;
  }

  const wordMatch = lower.match(/\b(one|two|three|four|five|six)\s+(?:people|passengers?|of us|adults?|riders?)\b/);
  if (wordMatch) {
    return WORD_NUMBERS[wordMatch[1]] ?? null;
  }

  return null;
}

function resolveHovEligibility(
  carpoolPossible: boolean,
  hovMentioned: boolean,
  numberOfPeople: number | null,
): DrivingPreferences['hovLaneEligible'] {
  if (numberOfPeople != null) {
    return numberOfPeople >= 2 ? 'yes' : 'no';
  }
  if (carpoolPossible || hovMentioned) return 'unknown';
  return 'unknown';
}

/**
 * Extract structured driving preferences from free text. Returns null when the
 * text has no carpool/HOV/Express Pass/toll signal so ordinary trips stay clean.
 *
 * IMPORTANT: HOV/toll eligibility is never asserted as fact here. hovLaneEligible
 * is only 'yes' when an occupancy of 2+ was explicitly stated, and even then the
 * surrounding copy must tell the user to confirm posted lane rules.
 */
export function extractDrivingPreferences(text: string): DrivingPreferences | null {
  const carpoolPossible = CARPOOL_PATTERN.test(text);
  const hovMentioned = HOV_PATTERN.test(text);
  const expressPassAvailable = EXPRESS_PASS_PATTERN.test(text);
  const tollLaneMentioned = TOLL_LANE_PATTERN.test(text) || TOLL_OK_PATTERN.test(text);
  const avoidTolls = AVOID_TOLLS_PATTERN.test(text);
  const payTollForTime = PAY_TOLL_FOR_TIME_PATTERN.test(text);
  const tollMentioned = /\btolls?\b/i.test(text);
  const numberOfPeople = extractNumberOfPeople(text);

  const hasSignal =
    carpoolPossible ||
    hovMentioned ||
    expressPassAvailable ||
    tollLaneMentioned ||
    avoidTolls ||
    payTollForTime ||
    tollMentioned ||
    numberOfPeople != null;

  if (!hasSignal) return null;

  let tollLaneAllowed: boolean | null = null;
  if (avoidTolls) tollLaneAllowed = false;
  else if (tollLaneMentioned || expressPassAvailable || payTollForTime) tollLaneAllowed = true;

  let willingToPayTollForTime: boolean | null = null;
  if (payTollForTime) willingToPayTollForTime = true;
  else if (avoidTolls) willingToPayTollForTime = false;

  return {
    carpoolPossible,
    numberOfPeople,
    hovLaneEligible: resolveHovEligibility(carpoolPossible, hovMentioned, numberOfPeople),
    expressPassAvailable,
    tollLaneAllowed,
    avoidTolls,
    willingToPayTollForTime,
  };
}

/**
 * True when the driving preferences indicate the user wants HOV/express/toll
 * consideration but the passenger count is still unknown — the highest-value
 * follow-up before we can talk about HOV eligibility honestly.
 */
export function needsPassengerCount(prefs: DrivingPreferences | null | undefined): boolean {
  if (!prefs) return false;
  if (prefs.numberOfPeople != null || prefs.occupancyConfirmedUnknown) return false;
  return prefs.carpoolPossible || prefs.hovLaneEligible === 'unknown' || prefs.expressPassAvailable;
}
