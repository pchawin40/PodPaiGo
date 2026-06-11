import type { ParkAndRideRuleConfidence } from '../types';
import type { ParkAndRideLotConfidence, ParkAndRideOperator } from './parkAndRideTypes';
import {
  getParkRideFacilitiesForMetro,
  type ParkRideFacility,
} from './parkRideFacilities';
import { resolveTransitFare } from '../transit/transitFareResolver';
import { VERIFY_SIGNS_WARNING } from './parkRideResolver';
import { SOUND_TRANSIT_PARKING_URL } from './parkAndRideLinks';

export { VERIFY_SIGNS_WARNING };

export type CuratedParkAndRideLotSeed = {
  id: string;
  lotName: string;
  address: string;
  lat: number;
  lng: number;
  operator: ParkAndRideOperator;
  capacity?: number;
  routesServed: string[];
  maxParkingDuration?: string;
  maxParkingHours?: number;
  permitInfo?: string;
  rulesUrl: string;
  sourceUrl: string;
  ruleConfidence: ParkAndRideRuleConfidence;
  overnightAllowed: boolean;
  confidence: ParkAndRideLotConfidence;
  baseTransitMinutes: number;
  baseWalkMinutes: number;
  baseWaitMinutes: number;
  parkingCostMin: number;
  parkingCostMax: number;
  transitFareMin: number;
  transitFareMax: number;
  warnings: string[];
  servesDestinations: RegExp[];
};

function mapAgencyToOperator(agencyName: string): ParkAndRideOperator {
  if (/sound transit/i.test(agencyName)) return 'Sound Transit';
  if (/king county metro/i.test(agencyName)) return 'King County Metro';
  if (/wsdot/i.test(agencyName)) return 'WSDOT';
  if (/capmetro/i.test(agencyName)) return 'CapMetro';
  return 'Other';
}

function facilityTransitServiceModes(facility: ParkRideFacility): string[] {
  return facility.modes.filter((mode) =>
    ['light_rail', 'commuter_rail', 'rail', 'brt'].includes(mode),
  );
}

function parkingCostRange(expectation: ParkRideFacility['parkingCostExpectation']): {
  min: number;
  max: number;
} {
  switch (expectation) {
    case 'free':
      return { min: 0, max: 0 };
    case 'permit':
      return { min: 0, max: 3 };
    case 'paid':
      return { min: 0, max: 5 };
    default:
      return { min: 0, max: 8 };
  }
}

function facilityToLegacySeed(facility: ParkRideFacility): CuratedParkAndRideLotSeed {
  const parkingRange = parkingCostRange(facility.parkingCostExpectation);
  const operator = mapAgencyToOperator(facility.agencyName);
  const serviceModes = facilityTransitServiceModes(facility);
  const fare = resolveTransitFare({
    destination: `${facility.city}, ${facility.state}`,
    agencyName: facility.agencyName,
    serviceModes: serviceModes.length > 0 ? serviceModes : ['bus'],
  });
  const transitOneWay = fare.oneWayDollars ?? 3;

  return {
    id: facility.id,
    lotName: facility.name,
    address: facility.address || `${facility.name}, ${facility.city}, ${facility.state}`,
    lat: facility.lat,
    lng: facility.lng,
    operator,
    routesServed: facility.servedRoutes ?? [],
    maxParkingDuration: facility.timeLimit,
    maxParkingHours: facility.overnightAllowed === false ? 12 : 24,
    permitInfo:
      facility.parkingCostExpectation === 'permit' ? 'Permit or validation may apply.' : undefined,
    rulesUrl: facility.sourceUrl || SOUND_TRANSIT_PARKING_URL,
    sourceUrl: facility.sourceUrl || SOUND_TRANSIT_PARKING_URL,
    ruleConfidence: facility.parkingCostExpectation === 'unknown' ? 'unknown' : 'estimated',
    overnightAllowed: facility.overnightAllowed === true,
    confidence: facility.confidence,
    baseTransitMinutes:
      facility.modes.includes('light_rail') || facility.modes.includes('commuter_rail') ? 24 : 20,
    baseWalkMinutes: 5,
    baseWaitMinutes: facility.modes.includes('light_rail') ? 6 : 8,
    parkingCostMin: parkingRange.min,
    parkingCostMax: parkingRange.max,
    transitFareMin: transitOneWay,
    transitFareMax: transitOneWay,
    warnings: [facility.timeLimit, VERIFY_SIGNS_WARNING].filter(Boolean) as string[],
    servesDestinations: [/\b(downtown|seattle|bellevue|capitol hill|pike place|airport|seatac|austin|franklin|east 11th)\b/i],
  };
}

/** @deprecated Prefer parkRideFacilities + parkRideResolver. Kept for legacy tests/adapters. */
export const SEATTLE_REGION_PARK_AND_RIDE_LOTS: CuratedParkAndRideLotSeed[] =
  getParkRideFacilitiesForMetro('seattle').map(facilityToLegacySeed);

export const AUSTIN_CAPMETRO_PARK_AND_RIDE_LOTS: CuratedParkAndRideLotSeed[] =
  getParkRideFacilitiesForMetro('austin').map(facilityToLegacySeed);

export function getSeattleRegionParkAndRideLots(): CuratedParkAndRideLotSeed[] {
  return SEATTLE_REGION_PARK_AND_RIDE_LOTS;
}

export function getAustinCapMetroParkAndRideLots(): CuratedParkAndRideLotSeed[] {
  return AUSTIN_CAPMETRO_PARK_AND_RIDE_LOTS;
}
