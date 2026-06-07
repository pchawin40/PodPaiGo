import type { ParkingOption } from '../types';
import {
  classifyDestinationParking,
  isDenseUrbanDestination,
  isRetailOrGroceryDestination,
  type ClassifyDestinationParkingInput,
} from './destinationParkingClassifier';
import { inferParkingCategoryFromSignals } from './googleParkingOptionsSignals';

export type DestinationParkingVenueCategory =
  | 'restaurant_cafe_bar'
  | 'hotel'
  | 'grocery_store_mall'
  | 'park_trailhead'
  | 'office_building'
  | 'stadium_event_venue'
  | 'airport'
  | 'downtown_neighborhood'
  | 'general';

export type DestinationParkingDensitySignal =
  | 'dense_core'
  | 'paid_cluster'
  | 'mixed'
  | 'lower_density';

export type DestinationParkingNoteScope = 'place' | 'neighborhood' | 'city' | 'venue_type';
export type DestinationParkingNoteKind =
  | 'customer'
  | 'onsite'
  | 'street'
  | 'garage'
  | 'event'
  | 'permit'
  | 'unknown';
export type DestinationParkingCostExpectation =
  | 'likely_free'
  | 'mixed'
  | 'likely_paid'
  | 'verify';

export type DestinationParkingNote = {
  id?: string;
  scope: DestinationParkingNoteScope;
  placeId?: string | null;
  namePattern?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusMiles?: number | null;
  parkingKind: DestinationParkingNoteKind;
  costExpectation: DestinationParkingCostExpectation;
  confidence: number;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  note: string;
  updatedAt?: string;
};

export type DestinationCustomerParkingCandidate = {
  label: string;
  name: string;
  cost: number;
  costDisplay: string;
  costNote: string;
  confidence: 'High' | 'Medium' | 'Low';
  pros: string[];
  cons: string[];
  searchMinutes: number;
  scoreBonus: number;
  verifyRequired: boolean;
  sourceLabel: string;
};

export type DestinationParkingIntelligence = {
  category: DestinationParkingVenueCategory;
  densitySignal: DestinationParkingDensitySignal;
  paidParkingNearbyCount: number;
  downtownOrCore: boolean;
  paidParkingLikely: boolean;
  eventRulesLikely: boolean;
  customerParkingPlausible: boolean;
  customerCandidate: DestinationCustomerParkingCandidate | null;
  paidOptionBackupLabel: 'Bookable paid backup' | 'Reliable paid backup';
  paidOptionBestLabel: 'Best confirmed paid option' | 'Best confirmed event parking';
  warning: string | null;
};

const RESTAURANT_CAFE_BAR_PATTERN =
  /\b(restaurant|cafe|café|coffee shop|bar|grill|bistro|diner|eatery|pizzeria|pizza|taco|bbq|barbecue|brewery|brewpub|pub|deli|bakery|sushi|ramen|taqueria)\b/i;
const HOTEL_PATTERN = /\b(hotel|motel|inn|lodge|resort|suites)\b/i;
const STORE_MALL_PATTERN =
  /\b(store|market|mall|shopping center|shopping centre|outlet|town center|town centre|pharmacy|supermarket|grocery|grocer|costco|safeway|walmart|target|fred meyer|qfc|whole foods|trader joe'?s?|walgreens|cvs|rite aid|home depot|lowe'?s|best buy)\b/i;
const PARK_TRAILHEAD_PATTERN =
  /\b(trailhead|trail|state park|national park|national forest|county park|city park|park entrance|trail entrance|beach|lake|mountain|hiking|campground|preserve|recreation area)\b/i;
const OFFICE_BUILDING_PATTERN =
  /\b(office|office building|building|tower|plaza|corporate|headquarters|\bhq\b|campus|business park|suite|tenant|employee)\b/i;
const STADIUM_EVENT_PATTERN =
  /\b(stadium|arena|ballpark|coliseum|event venue|event center|event centre|concert venue|amphitheater|amphitheatre|convention center|convention centre|fairgrounds|racetrack|speedway)\b/i;
const DOWNTOWN_NEIGHBORHOOD_PATTERN =
  /\b(downtown|central business district|\bcbd\b|urban core|city center|city centre|financial district|entertainment district|arts district|historic district|midtown|uptown|waterfront district)\b/i;

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function inferDestinationParkingVenueCategory(
  input: ClassifyDestinationParkingInput,
): DestinationParkingVenueCategory {
  const destination = normalize(input.destination);
  const lowerKind = String(input.destinationKind || '').toLowerCase();
  const lower = destination.toLowerCase();

  if (lowerKind === 'airport') return 'airport';
  if (lowerKind === 'stadium' || lowerKind === 'event') return 'stadium_event_venue';
  if (lowerKind === 'restaurant') return 'restaurant_cafe_bar';
  if (lowerKind === 'hotel') return 'hotel';
  if (lowerKind === 'office' || lowerKind === 'hospital') return 'office_building';
  if (lowerKind === 'downtown') return 'downtown_neighborhood';

  if (STADIUM_EVENT_PATTERN.test(lower)) return 'stadium_event_venue';
  if (PARK_TRAILHEAD_PATTERN.test(lower)) return 'park_trailhead';
  if (isRetailOrGroceryDestination(destination) || STORE_MALL_PATTERN.test(lower)) {
    return 'grocery_store_mall';
  }
  if (HOTEL_PATTERN.test(lower)) return 'hotel';
  if (RESTAURANT_CAFE_BAR_PATTERN.test(lower)) return 'restaurant_cafe_bar';
  if (OFFICE_BUILDING_PATTERN.test(lower)) return 'office_building';
  if (DOWNTOWN_NEIGHBORHOOD_PATTERN.test(lower) || isDenseUrbanDestination(destination)) {
    return 'downtown_neighborhood';
  }

  return 'general';
}

export function isPaidParkingOption(option: ParkingOption): boolean {
  const category =
    option.parkingCategory || inferParkingCategoryFromSignals(option.googleParkingOptions);

  if (category === 'garage_paid') return true;
  if (option.googleParkingOptions?.paidGarageParking || option.googleParkingOptions?.paidParkingLot) {
    return true;
  }
  if (option.bookingProvider) return true;
  if (option.providerSource === 'parkwhiz') return true;
  if (option.validationStatus === 'paid_only') return true;

  const name = `${option.name} ${option.sourceName || ''}`.toLowerCase();
  const looksLikeGarageOrLot = /\b(garage|parking|lot|deck|parkwhiz|spothero)\b/.test(name);
  return (option.price ?? 0) > 0 && looksLikeGarageOrLot;
}

function countPaidParkingOptions(options: ParkingOption[]): number {
  return options.filter(isPaidParkingOption).length;
}

function hasFreeCustomerSignal(options: ParkingOption[]): boolean {
  return options.some(
    (option) =>
      option.googleParkingOptions?.freeGarageParking ||
      option.googleParkingOptions?.freeParkingLot ||
      option.parkingCategory === 'customer_lot' ||
      option.validationStatus === 'free' ||
      option.validationStatus === 'validated',
  );
}

function usuallyHasCustomerOrOnsiteParking(category: DestinationParkingVenueCategory): boolean {
  return (
    category === 'restaurant_cafe_bar' ||
    category === 'hotel' ||
    category === 'grocery_store_mall' ||
    category === 'park_trailhead'
  );
}

function buildCustomerCandidate(args: {
  category: DestinationParkingVenueCategory;
  googleFreeSignal: boolean;
}): DestinationCustomerParkingCandidate {
  const highConfidence = args.googleFreeSignal || args.category === 'grocery_store_mall';
  const park = args.category === 'park_trailhead';
  const hotel = args.category === 'hotel';

  return {
    label: 'Customer parking',
    name: park
      ? 'Park or trailhead parking'
      : hotel
        ? 'Hotel / guest parking'
        : 'Customer parking at destination',
    cost: 0,
    costDisplay: 'Free? Verify',
    costNote: park
      ? 'Verify hours, passes, and posted rules'
      : 'Check signs, validation, time limits, and towing rules',
    confidence: highConfidence ? 'Medium' : 'Low',
    pros: park
      ? ['Dedicated or free lot may exist', 'Often closest when allowed by posted rules']
      : [
          hotel ? 'Guest or visitor parking may exist' : 'Customer or on-site parking may exist',
          'Free or validated parking is plausible outside dense cores',
        ],
    cons: park
      ? ['Pass, gate, or hour rules may apply', 'Not a reserved space']
      : ['Not a booked space', 'Verify signs before leaving your car'],
    searchMinutes: park ? 5 : highConfidence ? 2 : 3,
    scoreBonus: highConfidence ? 20 : 14,
    verifyRequired: true,
    sourceLabel: args.googleFreeSignal ? 'Provider parking signal' : 'Destination type estimate',
  };
}

export function buildDestinationParkingIntelligence(input: {
  destination: string;
  destinationKind?: string | null;
  airportCode?: string | null;
  parkingOptions?: ParkingOption[];
}): DestinationParkingIntelligence {
  const destination = normalize(input.destination);
  const parkingOptions = input.parkingOptions || [];
  const category = inferDestinationParkingVenueCategory(input);
  const classification = classifyDestinationParking(input);
  const paidParkingNearbyCount = countPaidParkingOptions(parkingOptions);
  const downtownOrCore =
    category === 'downtown_neighborhood' ||
    category === 'stadium_event_venue' ||
    isDenseUrbanDestination(destination);
  const manyPaidLotsNearby = paidParkingNearbyCount >= 3;
  const densitySignal: DestinationParkingDensitySignal = downtownOrCore
    ? 'dense_core'
    : manyPaidLotsNearby
      ? 'paid_cluster'
      : paidParkingNearbyCount > 0
        ? 'mixed'
        : 'lower_density';
  const eventRulesLikely = category === 'stadium_event_venue';
  const googleFreeSignal = hasFreeCustomerSignal(parkingOptions);
  const customerParkingPlausible =
    !eventRulesLikely &&
    category !== 'airport' &&
    usuallyHasCustomerOrOnsiteParking(category) &&
    !downtownOrCore &&
    !manyPaidLotsNearby;

  const customerCandidate =
    customerParkingPlausible || (googleFreeSignal && !downtownOrCore && !eventRulesLikely)
      ? buildCustomerCandidate({ category, googleFreeSignal })
      : null;

  const paidParkingLikely =
    category === 'airport' ||
    eventRulesLikely ||
    downtownOrCore ||
    manyPaidLotsNearby ||
    classification.mode === 'paid_likely';

  return {
    category,
    densitySignal,
    paidParkingNearbyCount,
    downtownOrCore,
    paidParkingLikely,
    eventRulesLikely,
    customerParkingPlausible,
    customerCandidate,
    paidOptionBackupLabel: customerCandidate ? 'Bookable paid backup' : 'Reliable paid backup',
    paidOptionBestLabel: eventRulesLikely ? 'Best confirmed event parking' : 'Best confirmed paid option',
    warning: eventRulesLikely
      ? 'Event-zone or special paid parking rules may apply. Check venue-day signs and rates.'
      : paidParkingLikely && downtownOrCore
        ? 'Dense downtown/core destination; paid garages or meters are more likely.'
        : null,
  };
}
