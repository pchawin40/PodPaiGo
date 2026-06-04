import type { ParkingOption } from '../../../../types';
import {
  getVerifiedUserParkingNear,
  type VerifiedUserParkingResult,
} from '../../../../parking/userParkingSpacesServer';
import type { ParkingProvider, ParkingSearchContext, ProviderHealth } from '../../types';
import { tagParkingFreshness } from '../../types';

function parkingTypeLabel(type: string): string {
  switch (type) {
    case 'customer_only':
      return 'Customer-only free parking';
    case 'time_limited_free':
      return 'Time-limited free parking';
    case 'street_free':
      return 'Free street parking';
    case 'retail_free':
      return 'Retail free parking';
    case 'event_free':
      return 'Event free parking';
    default:
      return 'Free parking';
  }
}

function accessTypeForParkingType(
  parkingType: string,
): ParkingOption['accessType'] {
  if (parkingType === 'customer_only' || parkingType === 'retail_free') {
    return 'customer_only';
  }
  if (parkingType === 'event_free') return 'event_only';
  if (parkingType === 'unknown') return 'unknown';
  return 'public';
}

function airportDurationHours(context: ParkingSearchContext): number | null {
  if (!context.checkInDate || !context.checkOutDate) return null;
  const start = new Date(`${context.checkInDate}T00:00:00`);
  const end = new Date(`${context.checkOutDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

function isAirportPlausible(row: VerifiedUserParkingResult, context: ParkingSearchContext): boolean {
  const durationHours = airportDurationHours(context);
  const requiresOvernight = durationHours == null || durationHours >= 18;

  if (requiresOvernight && row.overnight_allowed !== true) return false;
  if (row.parking_type === 'customer_only' || row.parking_type === 'retail_free') {
    return row.overnight_allowed === true && row.validation_required === false;
  }

  if (
    typeof row.time_limit_minutes === 'number' &&
    durationHours != null &&
    row.time_limit_minutes < durationHours * 60
  ) {
    return false;
  }

  return true;
}

export function userParkingSpaceToParkingOption(
  row: VerifiedUserParkingResult,
  context: Pick<ParkingSearchContext, 'airportCode' | 'destinationKind'>,
): ParkingOption {
  const distanceMiles = row.distanceMeters / 1609.34;
  const walkMinutes = Math.max(3, Math.round(row.distanceMeters / 80));
  const rules: string[] = [];

  if (typeof row.time_limit_minutes === 'number') {
    rules.push(`Time limit: ${row.time_limit_minutes} min`);
  }
  if (row.overnight_allowed === true) rules.push('Overnight allowed');
  if (row.overnight_allowed === false) rules.push('No verified overnight parking');
  if (row.validation_required) rules.push('Validation or purchase may be required');
  if (row.lot_rules) rules.push(row.lot_rules);

  const assumptions = [
    'PodPaiGo verified community-submitted free parking.',
    'Check signs before leaving your car.',
    row.validation_required
      ? 'Customer-only parking may require shopping or validation.'
      : null,
    row.overnight_allowed === true
      ? 'Overnight parking is marked verified for this submission.'
      : 'Do not assume overnight parking unless signs clearly allow it.',
    row.notes,
  ].filter((value): value is string => Boolean(value));

  return {
    id: `community-free-${row.id}`,
    name: row.name,
    serviceAirportCode:
      context.destinationKind === 'airport' ? context.airportCode : undefined,
    distanceToAirport: context.destinationKind === 'airport' ? distanceMiles : undefined,
    type: 'off-airport',
    price: 0,
    priceDisplay: 'estimated',
    priceUnit: 'total',
    priceNote: 'Free community-submitted parking. Not live inventory.',
    priceSource: 'estimated',
    priceConfidence: 'medium',
    pricingConfidence: 'recent',
    distance: walkMinutes,
    availability: 50,
    availabilityStatus: 'unknown',
    isAvailable: true,
    trustStatus: 'verified-source',
    sourceName: 'PodPaiGo verified free parking',
    sourceLink: row.evidence_url ?? undefined,
    mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.address)}`,
    lastUpdated: row.verified_at ?? row.updated_at,
    assumptions,
    address: row.address,
    normalizedAddress: row.address,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    routeDestination: row.address,
    parkingBufferMinutes: 6,
    transferToTerminalMinutes: walkMinutes,
    transferType: 'walk',
    walkingMinutes: walkMinutes,
    bestFor: ['Free', 'Verified by PodPaiGo', parkingTypeLabel(row.parking_type)],
    validationStatus: 'free',
    validationNotes: rules.join(' · ') || undefined,
    validationSourceUrl: row.evidence_url ?? undefined,
    validationLastCheckedAt: row.verified_at ?? undefined,
    validationConfidence: 'high',
    freeParkingMinutes: row.time_limit_minutes ?? undefined,
    freeParkingNotes: row.notes ?? row.lot_rules ?? undefined,
    accessType: accessTypeForParkingType(row.parking_type),
    accessNotes: row.business_name
      ? `${row.business_name}${row.validation_required ? ' validation may be required' : ''}`
      : undefined,
    accessConfidence: 'high',
    providerSource: 'community-free',
    fetchedAt: new Date().toISOString(),
    priceFreshness: 'recent',
  };
}

export async function getCommunityFreeParkingOptions(context: ParkingSearchContext): Promise<ParkingOption[]> {
  const lat = context.destinationKind === 'airport'
    ? context.airportCoordinates?.lat
    : context.destinationLat;
  const lng = context.destinationKind === 'airport'
    ? context.airportCoordinates?.lng
    : context.destinationLng;

  if (typeof lat !== 'number' || typeof lng !== 'number') return [];

  const rows = await getVerifiedUserParkingNear({
    lat,
    lng,
    radiusMeters: context.destinationKind === 'airport' ? 6400 : 2400,
    limit: 8,
  });

  return rows
    .filter((row) =>
      context.destinationKind === 'airport'
        ? isAirportPlausible(row, context)
        : true,
    )
    .map((row) => userParkingSpaceToParkingOption(row, context))
    .map((option) =>
      tagParkingFreshness(
        option,
        'community-free',
        'recent',
        option.fetchedAt ?? option.lastUpdated,
      ),
    );
}

export class CommunityFreeParkingProvider implements ParkingProvider {
  id = 'community-free';

  enabled(): boolean {
    return process.env.DISABLE_COMMUNITY_FREE_PARKING !== 'true';
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return {
        status: 'offline',
        message: 'Community free parking disabled',
        checkedAt,
      };
    }
    return { status: 'healthy', checkedAt };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    return getCommunityFreeParkingOptions(context);
  }
}

export const communityFreeParkingProvider = new CommunityFreeParkingProvider();
