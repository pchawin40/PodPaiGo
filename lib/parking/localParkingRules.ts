import { matchCuratedLocalParkingZone } from './localParkingZones';
import type { CityStreetParkingSpecialSignal } from './cityStreetParkingRules';
import {
  buildTripDateTime,
  evaluateSeattleStreetParkingRules,
  SEATTLE_STREET_PARKING_SUBTEXT,
  seattleStreetParkingExpectationLabel,
  type SeattleParkingPaymentExpectation,
} from './seattleStreetParkingRules';
import { evaluateUsCityStreetParkingRules } from './usCityStreetParkingRules';

export type LocalParkingRuleDetails = {
  dayOfWeek?: string;
  holidayName?: string;
  meterHours?: string;
  maxDuration?: number;
};

export type LocalStreetParkingSignal = {
  freeLikely: boolean;
  paidLikely: boolean;
  penalty: number;
  headline?: string;
  detail?: string;
  verifyRequired: boolean;
  appliesToday?: boolean;
  ruleDetails?: LocalParkingRuleDetails;
  paymentExpectation?: SeattleParkingPaymentExpectation;
  confidence?: 'low' | 'medium' | 'high';
  rulesSource?: 'seattle' | 'us_city_fallback';
  cityRuleId?: string;
  jurisdictionName?: string;
  sourceLabel?: string;
  specialSignals?: CityStreetParkingSpecialSignal[];
  supplementalText?: string;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function mapExpectationToSignal(
  expectation: SeattleParkingPaymentExpectation,
): Pick<LocalStreetParkingSignal, 'freeLikely' | 'paidLikely' | 'penalty'> {
  switch (expectation) {
    case 'likely_free':
      return { freeLikely: true, paidLikely: false, penalty: 0 };
    case 'likely_paid':
      return { freeLikely: false, paidLikely: true, penalty: 0 };
    case 'check_signs':
      return { freeLikely: false, paidLikely: false, penalty: 8 };
  }
}

function inferParkingType(
  destination: string,
  explicit?: 'street' | 'garage' | 'unknown',
): 'street' | 'garage' | 'unknown' {
  if (explicit) return explicit;
  if (/\b(?:parking\s+)?(?:garage|lot|deck)\b/i.test(destination)) return 'garage';
  return 'street';
}

export function evaluateLocalStreetParkingRules(input: {
  destination: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationCity?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes: number;
  isAirportTrip?: boolean;
  parkingType?: 'street' | 'garage' | 'unknown';
}): LocalStreetParkingSignal {
  if (input.isAirportTrip) {
    return {
      freeLikely: false,
      paidLikely: false,
      penalty: 5000,
      headline: 'Street parking not recommended',
      detail: 'Airport and overnight trips should use verified lots or garages.',
      verifyRequired: true,
    };
  }

  const arrival = buildTripDateTime(input.arrivalDate, input.arrivalTime);
  const parkingType = inferParkingType(input.destination, input.parkingType);
  const durationHours = Math.max(0, input.durationMinutes) / 60;
  const curatedZone = matchCuratedLocalParkingZone(input.destination);
  let penalty = 0;
  let headline: string | undefined;
  let detail: string | undefined;
  let appliesToday: boolean | undefined;
  let ruleDetails: LocalParkingRuleDetails | undefined;
  let freeLikely = false;
  let paidLikely = false;
  let paymentExpectation: SeattleParkingPaymentExpectation | undefined;
  let confidence: 'low' | 'medium' | 'high' | undefined;
  let rulesSource: LocalStreetParkingSignal['rulesSource'];
  let cityRuleId: string | undefined;
  let jurisdictionName: string | undefined;
  let sourceLabel: string | undefined;
  let specialSignals: CityStreetParkingSpecialSignal[] | undefined;
  let supplementalText: string | undefined;

  if (arrival) {
    const seattleRules = evaluateSeattleStreetParkingRules({
      destination: input.destination,
      destinationLat: input.destinationLat,
      destinationLng: input.destinationLng,
      destinationCity: input.destinationCity,
      tripDateTime: arrival,
      parkingType,
    });

    if (seattleRules) {
      const mapped = mapExpectationToSignal(seattleRules.paymentExpectation);
      freeLikely = mapped.freeLikely;
      paidLikely = mapped.paidLikely;
      penalty += mapped.penalty;
      paymentExpectation = seattleRules.paymentExpectation;
      confidence = seattleRules.confidence;
      headline = seattleStreetParkingExpectationLabel(seattleRules.paymentExpectation);
      detail = seattleRules.reason;
      rulesSource = 'seattle';
      cityRuleId = seattleRules.cityRuleId;
      jurisdictionName = seattleRules.jurisdictionName;
      sourceLabel = seattleRules.sourceLabel;
      specialSignals = seattleRules.specialSignals;
      supplementalText = SEATTLE_STREET_PARKING_SUBTEXT;
      appliesToday = true;
      ruleDetails = {
        dayOfWeek: DAY_NAMES[arrival.getDay()],
        holidayName: seattleRules.holidayName,
        meterHours:
          seattleRules.paidStartHour != null && seattleRules.paidEndHour != null
            ? `Mon–Sat ~${seattleRules.paidStartHour}:00–${seattleRules.paidEndHour}:00`
            : undefined,
      };
    } else {
      const usCityRules = evaluateUsCityStreetParkingRules({
        destination: input.destination,
        destinationLat: input.destinationLat,
        destinationLng: input.destinationLng,
        destinationCity: input.destinationCity,
        tripDateTime: arrival,
        parkingType,
      });

      if (usCityRules) {
        const mapped = mapExpectationToSignal(usCityRules.paymentExpectation);
        freeLikely = mapped.freeLikely;
        paidLikely = mapped.paidLikely;
        penalty += mapped.penalty;
        paymentExpectation = usCityRules.paymentExpectation;
        confidence = usCityRules.confidence;
        headline = seattleStreetParkingExpectationLabel(usCityRules.paymentExpectation);
        detail = usCityRules.reason;
        rulesSource = 'us_city_fallback';
        cityRuleId = usCityRules.cityRuleId;
        jurisdictionName = usCityRules.jurisdictionName;
        sourceLabel = usCityRules.sourceLabel;
        specialSignals = usCityRules.specialSignals;
        supplementalText = usCityRules.supplementalText;
        appliesToday = true;
        ruleDetails = {
          dayOfWeek: DAY_NAMES[arrival.getDay()],
          holidayName: usCityRules.holidayName,
        };
      }
    }
  }

  if (curatedZone) {
    if (!rulesSource || rulesSource === 'us_city_fallback') {
      headline = curatedZone.headline;
      detail = curatedZone.detail;
    } else {
      headline = headline || curatedZone.headline;
      detail = detail || curatedZone.detail;
    }

    if (curatedZone.maxStreetHours) {
      ruleDetails = {
        ...ruleDetails,
        maxDuration: curatedZone.maxStreetHours,
      };
    }

    if (curatedZone.maxStreetHours && durationHours > curatedZone.maxStreetHours) {
      penalty += 28 + Math.round((durationHours - curatedZone.maxStreetHours) * 6);
      detail = `${curatedZone.detail} Your stay looks longer than the posted limit.`;
    }
  }

  if (durationHours >= 8) {
    penalty += 16;
  }

  return {
    freeLikely,
    paidLikely,
    penalty,
    headline,
    detail,
    verifyRequired: true,
    appliesToday,
    ruleDetails,
    paymentExpectation,
    confidence,
    rulesSource,
    cityRuleId,
    jurisdictionName,
    sourceLabel,
    specialSignals,
    supplementalText,
  };
}
