import type { ParkingOption, ParkingRateRule } from '../types';
import { withAvailabilityScore } from '../providers/parking/shared/availability';
import { googleMapsSearchUrl } from '../providers/parking/shared/urls';

export const SEA_GENERAL_PARKING_INFO_URL =
  'https://www.portseattle.org/sea/parking/parking-information';
export const SEA_PARKING_OVERVIEW_URL = 'https://www.portseattle.org/sea/parking';
export const SEA_RESERVED_BOOKING_URL =
  'https://reservesea.portseattle.org/book/SEA/Parking';
export const SEA_RESERVED_INFO_URL =
  'https://www.portseattle.org/page/reserved-parking-sea-airport';

/** @deprecated Broken path — kept only so tests can assert it is never emitted. */
export const BROKEN_SEA_OFFICIAL_SOURCE_URL =
  'https://www.flysea.org/sea-tac/parking/parking-information';

export const SEA_OFFICIAL_GARAGE_DISPLAY_NAME = 'Official SEA Airport Garage';

const SEA_GARAGE_ADDRESS = 'SEA Airport Parking Garage, 17801 International Blvd, SeaTac, WA 98158';
const SEA_GARAGE_LAT = 47.4439;
const SEA_GARAGE_LNG = -122.3022;

function parseLocalDateTime(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
}

function resolveDurationMinutes(args: {
  checkInAt?: string;
  checkOutAt?: string;
}): number {
  const start = parseLocalDateTime(args.checkInAt);
  const end = parseLocalDateTime(args.checkOutAt);
  if (!start || !end) return 24 * 60;

  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return minutes > 0 ? minutes : 24 * 60;
}

function seaGeneralTotal(durationMinutes: number): number {
  const hours = Math.max(1, Math.ceil(durationMinutes / 60));
  const days = Math.max(1, Math.ceil(durationMinutes / (24 * 60)));

  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    const remainderDays = days % 7;
    return weeks * 222 + Math.min(remainderDays * 37, 222);
  }

  return Math.min(hours * 8, days * 37);
}

function seaReservedTotal(durationMinutes: number): number {
  const days = Math.max(1, Math.ceil(durationMinutes / (24 * 60)));
  return days * 47;
}

function seaGeneralRateRules(): ParkingRateRule[] {
  return [
    {
      id: 'sea-general-hourly',
      label: 'SEA General hourly',
      kind: 'hourly',
      amount: 8,
      hourlyRate: 8,
      dailyMax: 37,
      sourceName: 'Port of Seattle',
      sourceUrl: SEA_GENERAL_PARKING_INFO_URL,
      confidence: 'high',
    },
    {
      id: 'sea-general-daily',
      label: 'SEA General daily maximum',
      kind: 'daily_max',
      amount: 37,
      sourceName: 'Port of Seattle',
      sourceUrl: SEA_GENERAL_PARKING_INFO_URL,
      confidence: 'high',
    },
    {
      id: 'sea-general-weekly',
      label: 'SEA General weekly maximum',
      kind: 'flat',
      amount: 222,
      minDurationMinutes: 7 * 24 * 60,
      sourceName: 'Port of Seattle',
      sourceUrl: SEA_GENERAL_PARKING_INFO_URL,
      confidence: 'high',
      notes: ['Weekly pricing is estimated from published SEA General Parking weekly maximum.'],
    },
  ];
}

function seaReservedRateRules(): ParkingRateRule[] {
  return [
    {
      id: 'sea-reserved-daily',
      label: 'SEA Reserved / Terminal Direct daily',
      kind: 'daily_max',
      amount: 47,
      sourceName: 'Port of Seattle',
      sourceUrl: SEA_RESERVED_INFO_URL,
      confidence: 'high',
      notes: ['Reserved Parking is on Floor 4, formerly Terminal Direct.'],
    },
    {
      id: 'sea-reserved-overstay',
      label: 'SEA Reserved overstay hourly',
      kind: 'hourly',
      amount: 10,
      hourlyRate: 10,
      dailyMax: 47,
      sourceName: 'Port of Seattle',
      sourceUrl: SEA_RESERVED_INFO_URL,
      confidence: 'high',
      notes: ['Overstay hourly rate applies up to the daily maximum.'],
    },
  ];
}

export function buildSeaOfficialParkingOptions(args: {
  airportCode: string;
  checkInAt?: string;
  checkOutAt?: string;
}): ParkingOption[] {
  if (args.airportCode.toUpperCase() !== 'SEA') return [];

  const durationMinutes = resolveDurationMinutes(args);
  const now = new Date().toISOString();
  const generalTotal = seaGeneralTotal(durationMinutes);
  const reservedTotal = seaReservedTotal(durationMinutes);

  return [
    withAvailabilityScore({
      id: 'sea-general',
      name: 'SEA General Parking',
      serviceAirportCode: 'SEA',
      type: 'official',
      price: generalTotal,
      priceMin: generalTotal,
      priceMax: generalTotal,
      priceDisplay: 'estimated',
      priceUnit: 'total',
      pricingConfidence: 'official',
      priceSource: 'official-rate',
      priceConfidence: 'high',
      priceNote:
        'General Parking — official $37/day. Estimated total based on selected duration; confirm current airport rates before parking.',
      rateRules: seaGeneralRateRules(),
      activeRate: {
        total: generalTotal,
        label: `Official published rate: $${generalTotal}`,
        rateType: 'daily_max',
        confidence: 'high',
        sourceName: 'Port of Seattle',
        sourceUrl: SEA_GENERAL_PARKING_INFO_URL,
        ruleId: 'sea-general-rate',
        warnings: ['Airport garage is fastest but costs more than many off-site lots.'],
      },
      distance: 5,
      distanceToAirport: 0.1,
      availability: 65,
      availabilityStatus: 'unknown',
      isAvailable: true,
      trustStatus: 'verified-source',
      sourceName: 'Port of Seattle',
      sourceLink: SEA_GENERAL_PARKING_INFO_URL,
      mapLink: googleMapsSearchUrl(SEA_GARAGE_ADDRESS),
      routeDestination: SEA_GARAGE_ADDRESS,
      address: SEA_GARAGE_ADDRESS,
      normalizedAddress: SEA_GARAGE_ADDRESS,
      lat: SEA_GARAGE_LAT,
      lng: SEA_GARAGE_LNG,
      parkingBufferMinutes: 8,
      transferToTerminalMinutes: 5,
      transferType: 'airport-garage',
      walkingMinutes: 5,
      covered: true,
      lastUpdated: now,
      assumptions: [
        'Official SEA airport garage product.',
        'Published airport rate; not a live occupancy or booking quote.',
        'Estimated total based on selected parking duration.',
        'Off-site parking can save money but adds shuttle time.',
      ],
      bestFor: ['Fastest terminal access', 'Official garage', 'Covered'],
      providerSource: 'official-sea',
      fetchedAt: now,
      priceFreshness: 'estimated',
    }),
    withAvailabilityScore({
      id: 'sea-reserved',
      name: 'SEA Reserved Parking / Terminal Direct',
      serviceAirportCode: 'SEA',
      type: 'official',
      price: reservedTotal,
      priceMin: reservedTotal,
      priceMax: reservedTotal,
      priceDisplay: 'estimated',
      priceUnit: 'total',
      pricingConfidence: 'official',
      priceSource: 'official-rate',
      priceConfidence: 'high',
      priceNote:
        'Reserved Parking / Terminal Direct — official $47/day, reservation required. Floor 4 was formerly Terminal Direct.',
      bookingProvider: 'SEA Airport',
      rateRules: seaReservedRateRules(),
      activeRate: {
        total: reservedTotal,
        label: `Official published rate: $${reservedTotal}`,
        rateType: 'daily_max',
        confidence: 'high',
        sourceName: 'Port of Seattle',
        sourceUrl: SEA_RESERVED_INFO_URL,
        ruleId: 'sea-reserved-rate',
        warnings: [
          'Airport garage is fastest but costs more than many off-site lots.',
          'Reserved Parking requires advance reservation.',
        ],
      },
      distance: 3,
      distanceToAirport: 0.05,
      availability: 70,
      availabilityStatus: 'unknown',
      isAvailable: true,
      trustStatus: 'verified-source',
      sourceName: 'Port of Seattle',
      sourceLink: SEA_RESERVED_BOOKING_URL,
      mapLink: googleMapsSearchUrl(SEA_GARAGE_ADDRESS),
      routeDestination: SEA_GARAGE_ADDRESS,
      address: SEA_GARAGE_ADDRESS,
      normalizedAddress: SEA_GARAGE_ADDRESS,
      lat: SEA_GARAGE_LAT,
      lng: SEA_GARAGE_LNG,
      parkingBufferMinutes: 5,
      transferToTerminalMinutes: 3,
      transferType: 'airport-garage',
      walkingMinutes: 3,
      covered: true,
      lastUpdated: now,
      assumptions: [
        'Official SEA Reserved Parking product.',
        'Reserved Parking is on Floor 4, formerly Terminal Direct.',
        'Published airport rate; not a live occupancy quote.',
        'Estimated total based on selected parking duration.',
        'Advance reservation is required for Reserved Parking.',
      ],
      bestFor: ['Fastest terminal access', 'Terminal Direct floor', 'Official garage'],
      providerSource: 'official-sea',
      fetchedAt: now,
      priceFreshness: 'estimated',
    }),
  ];
}
