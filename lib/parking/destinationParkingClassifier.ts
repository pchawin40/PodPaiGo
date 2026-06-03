export type DestinationParkingMode =
  | 'free_likely'
  | 'validated_possible'
  | 'paid_likely'
  | 'permit_possible'
  | 'restricted_possible'
  | 'unknown'
  | 'airport';

export type ParkingAccessType =
  | 'public'
  | 'customer_only'
  | 'validated_customer'
  | 'employee_only'
  | 'resident_only'
  | 'tenant_only'
  | 'permit_only'
  | 'event_only'
  | 'trailhead_permit'
  | 'unknown';

export type DestinationParkingClassification = {
  mode: DestinationParkingMode;
  accessType: ParkingAccessType;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  reason: string;
  recommendedAction: string;
  shouldSearchPaidParking: boolean;
};

export type ClassifyDestinationParkingInput = {
  destination?: string | null;
  destinationKind?: string | null;
  airportCode?: string | null;
};

const RETAIL_PATTERN =
  /\b(costco|safeway|walmart|target|fred meyer|qfc|whole foods|trader joe'?s?|home depot|lowe'?s?|grocer(?:y|ies)|supermarket)\b/i;
const MALL_PATTERN =
  /\b(mall|shopping center|shopping centre|outlet mall|town center|town centre|collection|square)\b/i;
const RESTAURANT_PATTERN =
  /\b(restaurant|cafe|café|coffee shop|bar|grill|bistro|diner|eatery|pizzeria|brewpub)\b/i;
const MEDICAL_PATTERN =
  /\b(hospital|clinic|medical center|medical centre|health center|health centre|urgent care)\b/i;
const TRAIL_PATTERN =
  /\b(trail|trailhead|state park|national forest|national park|park entrance|lake|mountain|hiking|campground)\b/i;
const PAID_VENUE_PATTERN =
  /\b(downtown|stadium|arena|convention center|convention centre|event center|event centre|ballpark|coliseum|theatre|theater)\b/i;
const RESTRICTED_PATTERN =
  /\b(office|corporate|headquarters|\bhq\b|campus|employee|tenant|private garage|badge|permit only|secured parking|pse\b|utility|power company)\b/i;

function normalizeDestination(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function airportClassification(): DestinationParkingClassification {
  return {
    mode: 'airport',
    accessType: 'public',
    confidence: 'high',
    reason: 'Airport trips use airport parking intelligence instead of destination parking rules.',
    recommendedAction: 'Use airport parking, rideshare, and transit options for this trip.',
    shouldSearchPaidParking: true,
  };
}

function freeRetailClassification(name: string): DestinationParkingClassification {
  return {
    mode: 'free_likely',
    accessType: 'customer_only',
    confidence: 'high',
    reason: `${name} destinations usually include customer parking.`,
    recommendedAction: 'Park in the store lot first. Paid parking search is skipped unless you ask for nearby options.',
    shouldSearchPaidParking: false,
  };
}

export function classifyDestinationParking(
  input: ClassifyDestinationParkingInput,
): DestinationParkingClassification {
  const destination = normalizeDestination(input.destination);
  const destinationKind = String(input.destinationKind || '').trim().toLowerCase();
  const airportCode = String(input.airportCode || '').trim().toUpperCase();

  if (destinationKind === 'airport' || airportCode) {
    return airportClassification();
  }

  const lower = destination.toLowerCase();

  if (RETAIL_PATTERN.test(lower)) {
    const match = lower.match(RETAIL_PATTERN)?.[0] || 'Retail';
    return freeRetailClassification(match.replace(/\b\w/g, (char) => char.toUpperCase()));
  }

  if (MALL_PATTERN.test(lower)) {
    const validatedHint = /\b(outlet|town center|town centre|collection)\b/i.test(lower);
    return {
      mode: validatedHint ? 'validated_possible' : 'free_likely',
      accessType: validatedHint ? 'validated_customer' : 'customer_only',
      confidence: 'medium',
      reason: 'Shopping centers often include customer parking, but validation rules vary by store.',
      recommendedAction: 'Start with mall or store parking. Confirm validation with the business if needed.',
      shouldSearchPaidParking: false,
    };
  }

  if (RESTAURANT_PATTERN.test(lower)) {
    return {
      mode: 'validated_possible',
      accessType: 'validated_customer',
      confidence: /\b(bar|brewpub)\b/i.test(lower) ? 'low' : 'medium',
      reason: 'Restaurants and cafes sometimes validate parking, but rules vary by location and time.',
      recommendedAction: 'Confirm with the business before relying on validation.',
      shouldSearchPaidParking: false,
    };
  }

  if (MEDICAL_PATTERN.test(lower)) {
    const paidLikely = /\b(hospital|medical center|medical centre)\b/i.test(lower);
    return {
      mode: paidLikely ? 'paid_likely' : 'validated_possible',
      accessType: paidLikely ? 'public' : 'validated_customer',
      confidence: 'medium',
      reason: paidLikely
        ? 'Medical campuses often use paid garages or timed parking.'
        : 'Clinics may validate parking, but policies vary by facility.',
      recommendedAction: paidLikely
        ? 'Check the facility parking page or arrival signs before your visit.'
        : 'Ask the front desk whether patient or visitor parking validation is available.',
      shouldSearchPaidParking: paidLikely,
    };
  }

  if (TRAIL_PATTERN.test(lower)) {
    return {
      mode: 'permit_possible',
      accessType: 'trailhead_permit',
      confidence: 'medium',
      reason: 'Trailheads and parks may require day-use passes and can fill early.',
      recommendedAction: 'Check trailhead or park authority rules for permits, passes, and early arrival.',
      shouldSearchPaidParking: false,
    };
  }

  if (PAID_VENUE_PATTERN.test(lower) || /\b(pike place|waterfront|market district)\b/i.test(lower)) {
    return {
      mode: 'paid_likely',
      accessType: 'public',
      confidence: 'medium',
      reason: 'Downtown venues and event districts often rely on paid garages or event parking.',
      recommendedAction: 'Plan for paid parking or transit unless you already have a reserved spot.',
      shouldSearchPaidParking: true,
    };
  }

  if (RESTRICTED_PATTERN.test(lower)) {
    let accessType: ParkingAccessType = 'employee_only';
    if (/\b(tenant|campus)\b/i.test(lower)) accessType = 'tenant_only';
    if (/\b(permit|badge|secured)\b/i.test(lower)) accessType = 'permit_only';

    return {
      mode: 'restricted_possible',
      accessType,
      confidence: 'medium',
      reason: 'Corporate campuses and private buildings often restrict parking to employees, tenants, or permit holders.',
      recommendedAction: 'Use employee or tenant parking only if you have badge, permit, or authorized access.',
      shouldSearchPaidParking: false,
    };
  }

  return {
    mode: 'unknown',
    accessType: 'unknown',
    confidence: 'unknown',
    reason: 'PodPaiGo could not infer parking rules from the destination name alone.',
    recommendedAction: 'Check the destination website or signs on arrival before choosing parking.',
    shouldSearchPaidParking: false,
  };
}

export function destinationParkingHeadline(mode: DestinationParkingMode): string {
  switch (mode) {
    case 'free_likely':
      return 'Parking likely free';
    case 'validated_possible':
      return 'Validation may be available';
    case 'paid_likely':
      return 'Paid parking may be needed';
    case 'permit_possible':
      return 'Parking may require a pass or permit';
    case 'restricted_possible':
      return 'Restricted parking may apply';
    case 'airport':
      return 'Airport parking rules apply';
    default:
      return 'Parking rules unknown';
  }
}

export function destinationParkingSubcopy(mode: DestinationParkingMode): string {
  switch (mode) {
    case 'free_likely':
      return 'Destination appears to have customer parking. Paid parking search skipped.';
    case 'validated_possible':
      return 'Confirm with the business before relying on validation.';
    case 'permit_possible':
      return 'Trailheads and parks may require day-use passes and can fill early.';
    case 'restricted_possible':
      return 'Use employee/tenant parking only if you have badge, permit, or authorized access.';
    case 'paid_likely':
      return 'Plan for paid parking or transit unless you already have a reserved spot.';
    case 'airport':
      return 'Use airport parking, rideshare, and transit options for this trip.';
    default:
      return 'Check the destination website or signs on arrival before choosing parking.';
  }
}

export function formatParkingAccessLabel(accessType: ParkingAccessType): string {
  switch (accessType) {
    case 'public':
      return 'Public';
    case 'customer_only':
    case 'validated_customer':
      return 'Customer only';
    case 'employee_only':
      return 'Employee only';
    case 'tenant_only':
      return 'Tenant only';
    case 'permit_only':
    case 'trailhead_permit':
    case 'resident_only':
      return 'Permit required';
    case 'event_only':
      return 'Visitor parking';
    default:
      return 'Unknown access';
  }
}

export function buildDestinationAccessStorageKey(destination: string): string {
  const normalized = normalizeDestination(destination).toLowerCase().slice(0, 160);
  return `podpaigo:destinationAccess:${normalized || 'unknown'}`;
}

export function readDestinationAccessConfirmed(destination: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(buildDestinationAccessStorageKey(destination)) === 'confirmed';
  } catch {
    return false;
  }
}

export function writeDestinationAccessConfirmed(destination: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(buildDestinationAccessStorageKey(destination), 'confirmed');
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function shouldSearchPaidParkingForTrip(
  input: ClassifyDestinationParkingInput & { forcePaidParkingSearch?: boolean },
): boolean {
  if (input.forcePaidParkingSearch) return true;

  const classification = classifyDestinationParking(input);
  if (classification.mode === 'airport') {
    return true;
  }

  return classification.shouldSearchPaidParking;
}
