import {
  classifyDestinationParking,
  destinationParkingHeadline,
  destinationParkingSubcopy,
  formatParkingAccessLabel,
  type DestinationParkingClassification,
} from './destinationParkingClassifier';
import {
  buildParkingOptionsHints,
  type GoogleParkingOptionsSignals,
} from './googleParkingOptionsSignals';
import { evaluateLocalStreetParkingRules } from './localParkingRules';
import { matchCuratedLocalParkingZone } from './localParkingZones';

export type ParkingOutlookDiagnostics = {
  accessType: string;
  confidence: string;
  reason: string;
  recommendedAction: string;
};

export type ParkingOutlookPresentation = {
  title: string;
  body: string;
  hints: string[];
  verifyNotice: string;
  showSearchNearbyParking: boolean;
  diagnostics: ParkingOutlookDiagnostics;
};

const VERIFY_NOTICE = 'Verify posted signs and lot rules.';

const UNKNOWN_TITLE = 'Parking not confirmed yet';
const UNKNOWN_BODY =
  'PodPaiGo could not verify exact parking rules for this destination. I\'ll still compare drive, transit, rideshare, and nearby parking options.';

function consumerConfidenceLabel(
  confidence: DestinationParkingClassification['confidence'],
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

function bodyForGoogleHint(label: string): string {
  if (label === 'Free customer parking likely') {
    return 'Google Places suggests customer parking may be free. PodPaiGo will still compare drive, transit, rideshare, and nearby parking options.';
  }
  if (label === 'Paid parking likely') {
    return 'Google Places suggests paid parking near this destination. Compare drive, transit, rideshare, and nearby lots before you leave.';
  }
  if (label === 'Free street parking may be available nearby') {
    return 'Street parking may be available nearby. Compare drive, transit, rideshare, and nearby parking options.';
  }
  if (label === 'Metered street parking may be nearby') {
    return 'Metered street parking may be nearby. Compare drive, transit, rideshare, and nearby parking options.';
  }
  return 'Compare drive, transit, rideshare, and nearby parking options for this trip.';
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
    return {
      title: destinationParkingHeadline('airport'),
      body: destinationParkingSubcopy('airport'),
      hints: [],
      verifyNotice: VERIFY_NOTICE,
      showSearchNearbyParking: true,
      diagnostics: {
        accessType: formatParkingAccessLabel(classification.accessType),
        confidence: consumerConfidenceLabel(classification.confidence),
        reason: classification.reason,
        recommendedAction: classification.recommendedAction,
      },
    };
  }

  const googleHints = buildParkingOptionsHints(input.googleParkingOptions, {
    airportTrip: false,
  });
  const localRules = evaluateLocalStreetParkingRules({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes ?? 120,
    isAirportTrip: input.isAirportTrip ?? false,
  });
  const curatedZone = matchCuratedLocalParkingZone(input.destination);

  const hintChips = new Set<string>();
  for (const hint of googleHints.hints) {
    hintChips.add(hint.label);
  }

  if (localRules.freeLikely) {
    hintChips.add('Free street parking may be available today');
  }

  if (curatedZone?.maxStreetHours) {
    hintChips.add(`${curatedZone.maxStreetHours}-hour limit may apply`);
  }

  if (localRules.detail?.includes('longer than the posted limit')) {
    hintChips.add('Your stay may exceed posted street limits');
  }

  let title: string;
  let body: string;

  if (googleHints.hints.length > 0) {
    title = googleHints.hints[0].label;
    body = bodyForGoogleHint(title);
  } else if (classification.mode === 'unknown') {
    title = UNKNOWN_TITLE;
    body = UNKNOWN_BODY;
  } else {
    title = destinationParkingHeadline(classification.mode);
    body = destinationParkingSubcopy(classification.mode);
  }

  const hints = [...hintChips].filter((hint) => hint !== title);

  return {
    title,
    body,
    hints,
    verifyNotice: VERIFY_NOTICE,
    showSearchNearbyParking:
      classification.mode === 'unknown' ||
      classification.shouldSearchPaidParking ||
      googleHints.hints.some((hint) => hint.category === 'garage_paid'),
    diagnostics: {
      accessType: formatParkingAccessLabel(classification.accessType),
      confidence: consumerConfidenceLabel(classification.confidence),
      reason: classification.reason,
      recommendedAction: classification.recommendedAction,
    },
  };
}
