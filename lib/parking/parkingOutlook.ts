import {
  classifyDestinationParking,
  destinationParkingHeadline,
  destinationParkingSubcopy,
  formatParkingAccessLabel,
  isDenseUrbanDestination,
  qualifiesForSuburbanCustomerParkingInference,
  type DestinationParkingClassification,
} from './destinationParkingClassifier';
import {
  type GoogleParkingOptionsSignals,
} from './googleParkingOptionsSignals';
import { evaluateLocalStreetParkingRules } from './localParkingRules';
import { matchCuratedLocalParkingZone } from './localParkingZones';
import {
  seattleStreetParkingExpectationLabel,
} from './seattleStreetParkingRules';
import {
  CITY_STREET_PARKING_SPECIAL_SIGNAL_LABELS,
  type CityStreetParkingSpecialSignal,
} from './cityStreetParkingRules';

export type ParkingOutlookStatus =
  | 'free_customer_likely'
  | 'free_street_possible'
  | 'paid_parking_likely'
  | 'parking_not_confirmed'
  | 'no_parking_needed';

export type ParkingOutlookSource =
  | 'google_parking_options'
  | 'curated_local_rule'
  | 'city_rule'
  | 'generic_us_city_rule'
  | 'destination_type_inference'
  | 'unknown';

export type ParkingOutlookRuleDetails = {
  dayOfWeek?: string;
  holidayName?: string;
  meterHours?: string;
  maxDuration?: number;
};

export type ParkingOutlook = {
  status: ParkingOutlookStatus;
  headline: string;
  reason: string;
  source: ParkingOutlookSource;
  confidence: 'high' | 'medium' | 'low';
  caveat: string;
  appliesToday?: boolean;
  ruleDetails?: ParkingOutlookRuleDetails;
  specialSignals?: CityStreetParkingSpecialSignal[];
};

export type ParkingOutlookDiagnostics = {
  accessType: string;
  confidence: string;
  reason: string;
  recommendedAction: string;
};

export type ParkingOutlookPresentation = ParkingOutlook & {
  title: string;
  body: string;
  hints: string[];
  verifyNotice: string;
  showSearchNearbyParking: boolean;
  diagnostics: ParkingOutlookDiagnostics;
};

const VERIFY_CAVEAT = 'Verify posted signs and lot rules before you park.';

const STATUS_HEADLINES: Record<ParkingOutlookStatus, string> = {
  free_customer_likely: 'Free customer parking likely',
  free_street_possible: 'Likely free street parking',
  paid_parking_likely: 'Likely paid street parking',
  parking_not_confirmed: 'Parking not confirmed yet',
  no_parking_needed: 'No parking needed',
};

function seattleStreetOutlookStatus(
  paymentExpectation: 'likely_free' | 'likely_paid' | 'check_signs' | undefined,
): ParkingOutlookStatus {
  switch (paymentExpectation) {
    case 'likely_free':
      return 'free_street_possible';
    case 'likely_paid':
      return 'paid_parking_likely';
    case 'check_signs':
      return 'parking_not_confirmed';
    default:
      return 'parking_not_confirmed';
  }
}

function appendStreetRuleSubtext(reason: string, supplementalText?: string): string {
  if (!supplementalText) return reason;
  return `${reason} ${supplementalText}`;
}

function consumerConfidenceLabel(
  confidence: DestinationParkingClassification['confidence'] | ParkingOutlook['confidence'],
): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
    default:
      return 'Not confirmed yet';
  }
}

function confidenceLabelChip(confidence: ParkingOutlook['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
  }
}

function sourceChip(source: ParkingOutlookSource): string | null {
  switch (source) {
    case 'google_parking_options':
      return 'Google signal';
    case 'city_rule':
      return 'Seattle rule';
    case 'generic_us_city_rule':
      return 'City estimate';
    case 'curated_local_rule':
      return 'Local rule';
    case 'destination_type_inference':
      return 'Destination type';
    default:
      return null;
  }
}

function buildOutlookChips(
  outlook: ParkingOutlook,
  extraHints: string[],
): string[] {
  const chips = new Set<string>();

  const source = sourceChip(outlook.source);
  if (source) chips.add(source);
  chips.add('Verify signs');
  chips.add(confidenceLabelChip(outlook.confidence));

  for (const hint of extraHints) {
    if (hint !== outlook.headline) chips.add(hint);
  }

  return [...chips];
}

function googleHasPaidSignals(signals: GoogleParkingOptionsSignals | null | undefined): boolean {
  return Boolean(
    signals?.paidGarageParking ||
      signals?.paidParkingLot ||
      signals?.paidStreetParking,
  );
}

function resolveGeneralParkingOutlook(input: {
  destination: string;
  destinationKind?: string | null;
  googleParkingOptions?: GoogleParkingOptionsSignals | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number;
  classification: DestinationParkingClassification;
}): ParkingOutlook {
  const signals = input.googleParkingOptions;
  const denseUrban = isDenseUrbanDestination(input.destination);
  const localRules = evaluateLocalStreetParkingRules({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes ?? 120,
    isAirportTrip: false,
  });
  const curatedZone = matchCuratedLocalParkingZone(input.destination);
  const suburbanCustomer = qualifiesForSuburbanCustomerParkingInference({
    destination: input.destination,
    destinationKind: input.destinationKind,
  });

  if (signals?.freeGarageParking) {
    return {
      status: 'free_customer_likely',
      headline: STATUS_HEADLINES.free_customer_likely,
      reason:
        'Google Places reports free garage parking at this destination. Verify the garage rules before parking.',
      source: 'google_parking_options',
      confidence: 'high',
      caveat: VERIFY_CAVEAT,
    };
  }

  if (signals?.freeParkingLot && !denseUrban) {
    return {
      status: 'free_customer_likely',
      headline: STATUS_HEADLINES.free_customer_likely,
      reason:
        'Google Places reports free customer parking at this destination. PodPaiGo will still compare drive, transit, rideshare, and nearby parking options.',
      source: 'google_parking_options',
      confidence: 'high',
      caveat: VERIFY_CAVEAT,
    };
  }

  if (suburbanCustomer && input.classification.mode === 'free_likely') {
    return {
      status: 'free_customer_likely',
      headline: STATUS_HEADLINES.free_customer_likely,
      reason: input.classification.reason,
      source: 'destination_type_inference',
      confidence: input.classification.confidence === 'unknown' ? 'medium' : input.classification.confidence,
      caveat: VERIFY_CAVEAT,
    };
  }

  if (
    localRules.detail &&
    localRules.paymentExpectation &&
    !(localRules.rulesSource === 'us_city_fallback' && googleHasPaidSignals(signals)) &&
    (localRules.freeLikely || localRules.paidLikely || localRules.paymentExpectation === 'check_signs')
  ) {
    const status = seattleStreetOutlookStatus(localRules.paymentExpectation);
    const headline =
      localRules.headline ||
      seattleStreetParkingExpectationLabel(localRules.paymentExpectation);
    const source: ParkingOutlookSource =
      localRules.rulesSource === 'seattle' ? 'city_rule' : 'generic_us_city_rule';
    return {
      status,
      headline,
      reason: appendStreetRuleSubtext(localRules.detail, localRules.supplementalText),
      source,
      confidence: localRules.confidence ?? 'medium',
      caveat: VERIFY_CAVEAT,
      appliesToday: localRules.appliesToday,
      ruleDetails: localRules.ruleDetails,
      specialSignals: localRules.specialSignals,
    };
  }

  if (googleHasPaidSignals(signals)) {
    const paidStreet = Boolean(signals?.paidStreetParking);
    return {
      status: 'paid_parking_likely',
      headline: STATUS_HEADLINES.paid_parking_likely,
      reason: paidStreet
        ? 'Google Places suggests paid garage or lot parking nearby, and metered street parking may also be nearby.'
        : 'Google Places suggests paid garage or lot parking near this destination. Compare drive, transit, rideshare, and nearby lots before you leave.',
      source: 'google_parking_options',
      confidence: 'medium',
      caveat: VERIFY_CAVEAT,
    };
  }

  if (signals?.freeStreetParking && !denseUrban) {
    return {
      status: 'free_street_possible',
      headline: STATUS_HEADLINES.free_street_possible,
      reason:
        'Google Places suggests free street parking may be available nearby. This is not the same as confirmed customer lot parking.',
      source: 'google_parking_options',
      confidence: 'low',
      caveat: VERIFY_CAVEAT,
    };
  }

  if (input.classification.mode === 'paid_likely') {
    return {
      status: 'paid_parking_likely',
      headline: STATUS_HEADLINES.paid_parking_likely,
      reason: input.classification.reason,
      source: 'destination_type_inference',
      confidence: input.classification.confidence === 'unknown' ? 'medium' : input.classification.confidence,
      caveat: VERIFY_CAVEAT,
    };
  }

  if (curatedZone && !denseUrban) {
    return {
      status: 'parking_not_confirmed',
      headline: STATUS_HEADLINES.parking_not_confirmed,
      reason: curatedZone.detail,
      source: 'curated_local_rule',
      confidence: 'low',
      caveat: VERIFY_CAVEAT,
      ruleDetails: curatedZone.maxStreetHours
        ? { maxDuration: curatedZone.maxStreetHours }
        : undefined,
    };
  }

  if (denseUrban && !localRules.paymentExpectation) {
    return {
      status: 'paid_parking_likely',
      headline: STATUS_HEADLINES.paid_parking_likely,
      reason:
        'Dense urban destinations usually rely on paid street, garage, or lot parking unless signs or a business confirm otherwise.',
      source: 'destination_type_inference',
      confidence: 'low',
      caveat: VERIFY_CAVEAT,
    };
  }

  return {
    status: 'parking_not_confirmed',
    headline: STATUS_HEADLINES.parking_not_confirmed,
    reason:
      input.classification.mode === 'unknown'
        ? 'PodPaiGo could not verify exact parking rules for this destination. I\'ll still compare drive, transit, rideshare, and nearby parking options.'
        : destinationParkingSubcopy(input.classification.mode),
    source: 'unknown',
    confidence: 'low',
    caveat: VERIFY_CAVEAT,
  };
}

function collectExtraHints(input: {
  destination: string;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number;
  googleParkingOptions?: GoogleParkingOptionsSignals | null;
  outlook: ParkingOutlook;
}): string[] {
  const hints: string[] = [];
  const localRules = evaluateLocalStreetParkingRules({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes ?? 120,
    isAirportTrip: false,
  });
  const curatedZone = matchCuratedLocalParkingZone(input.destination);

  if (
    input.googleParkingOptions?.freeStreetParking &&
    input.outlook.status !== 'free_street_possible' &&
    input.outlook.source !== 'google_parking_options'
  ) {
    hints.push('Google also reports nearby street parking');
  }

  if (localRules.ruleDetails?.maxDuration) {
    hints.push(`${localRules.ruleDetails.maxDuration}-hour limit may apply`);
  } else if (curatedZone?.maxStreetHours) {
    hints.push(`${curatedZone.maxStreetHours}-hour limit may apply`);
  }

  if (localRules.detail?.includes('longer than the posted limit')) {
    hints.push('Your stay may exceed posted street limits');
  }

  for (const signal of localRules.specialSignals || []) {
    const label = CITY_STREET_PARKING_SPECIAL_SIGNAL_LABELS[signal];
    if (label) hints.push(label);
  }

  if (input.googleParkingOptions?.valetParking) {
    hints.push('Valet parking may be available');
  }

  return hints;
}

export function buildParkingOutlook(input: {
  destination: string;
  destinationKind?: string | null;
  airportCode?: string | null;
  googleParkingOptions?: GoogleParkingOptionsSignals | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number;
  isAirportTrip?: boolean;
}): ParkingOutlookPresentation {
  const classification = classifyDestinationParking({
    destination: input.destination,
    destinationKind: input.destinationKind,
    airportCode: input.airportCode,
  });

  if (classification.mode === 'airport') {
    const headline = destinationParkingHeadline('airport');
    const reason = destinationParkingSubcopy('airport');
    const outlook: ParkingOutlook = {
      status: 'no_parking_needed',
      headline,
      reason,
      source: 'destination_type_inference',
      confidence: 'high',
      caveat: VERIFY_CAVEAT,
    };

    return {
      ...outlook,
      title: headline,
      body: reason,
      hints: [],
      verifyNotice: VERIFY_CAVEAT,
      showSearchNearbyParking: true,
      diagnostics: {
        accessType: formatParkingAccessLabel(classification.accessType),
        confidence: consumerConfidenceLabel(classification.confidence),
        reason: classification.reason,
        recommendedAction: classification.recommendedAction,
      },
    };
  }

  const outlook = resolveGeneralParkingOutlook({
    destination: input.destination,
    destinationKind: input.destinationKind,
    googleParkingOptions: input.googleParkingOptions,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes,
    classification,
  });

  const extraHints = collectExtraHints({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes,
    googleParkingOptions: input.googleParkingOptions,
    outlook,
  });

  const hints = buildOutlookChips(outlook, extraHints);

  return {
    ...outlook,
    title: outlook.headline,
    body: outlook.reason,
    hints,
    verifyNotice: outlook.caveat,
    showSearchNearbyParking:
      outlook.status === 'parking_not_confirmed' ||
      outlook.status === 'paid_parking_likely' ||
      classification.shouldSearchPaidParking ||
      googleHasPaidSignals(input.googleParkingOptions),
    diagnostics: {
      accessType: formatParkingAccessLabel(classification.accessType),
      confidence: consumerConfidenceLabel(outlook.confidence),
      reason: `${outlook.reason} Source: ${outlook.source.replace(/_/g, ' ')}.`,
      recommendedAction: classification.recommendedAction,
    },
  };
}
