import type { ParkingOption, TripData } from '../types';
import {
  sortParkingOptionsForMode,
  type ParkingSortMode,
} from './sortParkingOptions';
import {
  SEA_GENERAL_PARKING_INFO_URL,
  SEA_OFFICIAL_GARAGE_DISPLAY_NAME,
  SEA_RESERVED_BOOKING_URL,
} from './seaOfficialParking';

export const SEA_OFFICIAL_GARAGE_GROUP_ID = 'sea-official-garage';

export type OfficialGarageSubOption = {
  id: string;
  label: string;
  detail: string;
  dailyRate: number;
  bookable: boolean;
  bookingUrl: string | null;
  infoUrl: string | null;
  sourceName: string;
};

function normalizeGarageText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isSeaOfficialGarageCandidate(
  option: ParkingOption,
  airportCode?: string | null,
): boolean {
  const code = (airportCode || option.serviceAirportCode || '').toUpperCase();
  if (code && code !== 'SEA') return false;

  const id = String(option.id || '').toLowerCase();
  const name = String(option.name || '').toLowerCase();

  if (option.officialGarageGroupId === SEA_OFFICIAL_GARAGE_GROUP_ID) return true;
  if (option.providerSource === 'official-sea') return true;
  if (id === 'sea-general' || id === 'sea-reserved') return true;

  const normalizedName = normalizeGarageText(name);
  const looksLikeSeaGarage =
    (normalizedName.includes('parking garage') || normalizedName.includes('airport garage')) &&
    (normalizedName.includes('sea') ||
      normalizedName.includes('seatac') ||
      normalizedName.includes('seattle tacoma'));

  if (looksLikeSeaGarage) return true;

  if (
    normalizedName.includes('seattle tacoma international airport') &&
    normalizedName.includes('parking')
  ) {
    return true;
  }

  return false;
}

function officialSubOptionFromParking(option: ParkingOption): OfficialGarageSubOption {
  const id = String(option.id || '').toLowerCase();
  const isReserved = id === 'sea-reserved' || option.name.toLowerCase().includes('reserved');

  if (isReserved) {
    return {
      id: option.id,
      label: 'Reserved Parking / Terminal Direct — official $47/day, reservation required',
      detail: 'Floor 4 / formerly Terminal Direct. Advance reservation required.',
      dailyRate: 47,
      bookable: true,
      bookingUrl: SEA_RESERVED_BOOKING_URL,
      infoUrl: option.sourceLink || null,
      sourceName: 'Port of Seattle',
    };
  }

  if (id === 'sea-general' || option.name.toLowerCase().includes('general')) {
    return {
      id: option.id,
      label: 'General Parking — official $37/day',
      detail: 'Official drive-up rate. No reservation required.',
      dailyRate: 37,
      bookable: false,
      bookingUrl: null,
      infoUrl: SEA_GENERAL_PARKING_INFO_URL,
      sourceName: 'Port of Seattle',
    };
  }

  return {
    id: option.id,
    label: option.name,
    detail: 'Official SEA airport garage product.',
    dailyRate: option.priceUnit === 'total' ? option.price : option.price || 37,
    bookable: Boolean(option.bookingProvider),
    bookingUrl: option.bookingProvider ? option.sourceLink || null : null,
    infoUrl: option.sourceLink || SEA_GENERAL_PARKING_INFO_URL,
    sourceName: option.sourceName || 'Port of Seattle',
  };
}

function mergeOfficialGarageSubOptions(
  members: ParkingOption[],
): OfficialGarageSubOption[] {
  const officialProducts = members.filter(
    (member) =>
      member.providerSource === 'official-sea' ||
      member.id === 'sea-general' ||
      member.id === 'sea-reserved',
  );

  const byKey = new Map<string, OfficialGarageSubOption>();

  for (const member of officialProducts) {
    const id = String(member.id || '').toLowerCase();
    const key =
      id === 'sea-general'
        ? 'sea-general'
        : id === 'sea-reserved'
          ? 'sea-reserved'
          : member.providerSource === 'official-sea' && member.name.toLowerCase().includes('general')
            ? 'sea-general'
            : member.providerSource === 'official-sea' && member.name.toLowerCase().includes('reserved')
              ? 'sea-reserved'
              : id || normalizeGarageText(member.name);

    const next = officialSubOptionFromParking(member);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, next);
      continue;
    }

    if (next.bookable && !existing.bookable) {
      byKey.set(key, next);
    }
  }

  const orderedKeys = ['sea-general', 'sea-reserved'];
  const ordered = orderedKeys
    .map((key) => byKey.get(key))
    .filter((entry): entry is OfficialGarageSubOption => Boolean(entry));

  for (const [key, value] of byKey.entries()) {
    if (!orderedKeys.includes(key)) {
      ordered.push(value);
    }
  }

  return ordered;
}

function pickRepresentativeMember(
  members: ParkingOption[],
  mode: ParkingSortMode,
  tripData?: TripData | null,
): ParkingOption {
  const officialMembers = members.filter(
    (member) =>
      member.providerSource === 'official-sea' ||
      member.id === 'sea-general' ||
      member.id === 'sea-reserved',
  );

  const pool = officialMembers.length > 0 ? officialMembers : members;

  if (mode === 'cheapest') {
    return sortParkingOptionsForMode(pool, 'cheapest', { tripData })[0] || pool[0];
  }

  if (mode === 'fastest') {
    const reserved = pool.find((member) => member.id === 'sea-reserved');
    if (reserved) return reserved;
    return sortParkingOptionsForMode(pool, 'fastest', { tripData })[0] || pool[0];
  }

  if (mode === 'easiest') {
    const reserved = pool.find((member) => member.id === 'sea-reserved');
    if (reserved) return reserved;
    const general = pool.find((member) => member.id === 'sea-general');
    return general || pool[0];
  }

  return sortParkingOptionsForMode(pool, 'best', { tripData })[0] || pool[0];
}

function buildGroupedGarageOption(args: {
  members: ParkingOption[];
  representative: ParkingOption;
  subOptions: OfficialGarageSubOption[];
}): ParkingOption {
  const { members, representative, subOptions } = args;
  const reservedSub = subOptions.find((sub) => sub.id === 'sea-reserved');
  const generalSub = subOptions.find((sub) => sub.id === 'sea-general');
  const photoSource =
    members.find((member) => member.googlePhotoName || member.googlePhotoNames?.length) ||
    representative;

  const bookableSub = reservedSub?.bookable ? reservedSub : null;
  const infoSub = generalSub || subOptions[0];

  return {
    ...representative,
    ...photoSource,
    id: SEA_OFFICIAL_GARAGE_GROUP_ID,
    name: SEA_OFFICIAL_GARAGE_DISPLAY_NAME,
    type: 'official',
    serviceAirportCode: 'SEA',
    providerSource: 'official-sea',
    sourceName: 'Port of Seattle',
    bookingProvider: bookableSub ? 'SEA Airport' : undefined,
    sourceLink: bookableSub?.bookingUrl || infoSub?.infoUrl || representative.sourceLink,
    priceSource: 'official-rate',
    priceConfidence: 'high',
    pricingConfidence: 'official',
    priceDisplay: 'estimated',
    trustStatus: 'verified-source',
    officialGarageGroupId: SEA_OFFICIAL_GARAGE_GROUP_ID,
    officialGarageSubOptions: subOptions,
    officialGarageMemberIds: members.map((member) => member.id),
    assumptions: [
      'Official SEA airport garage family with General and Reserved products.',
      'Published airport rates; not live occupancy or booking quotes.',
      ...(representative.assumptions || []),
    ],
    bestFor: ['Official garage', 'Covered', 'Fastest terminal access'],
  };
}

export function groupOfficialSeaGarageOptions(
  options: ParkingOption[],
  mode: ParkingSortMode = 'best',
  tripData?: TripData | null,
  airportCode?: string | null,
): ParkingOption[] {
  const code = (airportCode || 'SEA').toUpperCase();
  if (code !== 'SEA') return options;

  const garageMembers: ParkingOption[] = [];
  const others: ParkingOption[] = [];

  for (const option of options) {
    if (isSeaOfficialGarageCandidate(option, code)) {
      garageMembers.push(option);
    } else {
      others.push(option);
    }
  }

  if (garageMembers.length <= 1) {
    return options;
  }

  const representative = pickRepresentativeMember(garageMembers, mode, tripData);
  const subOptions = mergeOfficialGarageSubOptions(garageMembers);
  const grouped = buildGroupedGarageOption({
    members: garageMembers,
    representative,
    subOptions,
  });

  return [grouped, ...others];
}

export function resolveOfficialSeaGarageCtas(option: ParkingOption): {
  bookingUrl: string | null;
  providerUrl: string | null;
  reserveLabel: string;
  isInfoOnly: boolean;
} {
  const subOptions = option.officialGarageSubOptions || [];
  const reserved = subOptions.find((sub) => sub.id === 'sea-reserved');
  const general = subOptions.find((sub) => sub.id === 'sea-general');

  if (option.id === 'sea-reserved' || option.name.toLowerCase().includes('reserved')) {
    return {
      bookingUrl: SEA_RESERVED_BOOKING_URL,
      providerUrl: SEA_RESERVED_BOOKING_URL,
      reserveLabel: 'Reserve official parking',
      isInfoOnly: false,
    };
  }

  if (option.id === 'sea-general' || option.name.toLowerCase().includes('general')) {
    return {
      bookingUrl: SEA_GENERAL_PARKING_INFO_URL,
      providerUrl: SEA_GENERAL_PARKING_INFO_URL,
      reserveLabel: 'Check official parking',
      isInfoOnly: true,
    };
  }

  if (option.officialGarageGroupId === SEA_OFFICIAL_GARAGE_GROUP_ID) {
    if (reserved?.bookable) {
      return {
        bookingUrl: reserved.bookingUrl,
        providerUrl: reserved.bookingUrl,
        reserveLabel: 'Reserve official parking',
        isInfoOnly: false,
      };
    }

    return {
      bookingUrl: general?.infoUrl || SEA_GENERAL_PARKING_INFO_URL,
      providerUrl: general?.infoUrl || SEA_GENERAL_PARKING_INFO_URL,
      reserveLabel: 'Check official parking',
      isInfoOnly: true,
    };
  }

  return {
    bookingUrl: option.sourceLink || null,
    providerUrl: option.sourceLink || null,
    reserveLabel: option.sourceLink ? 'Reserve parking' : 'Booking unavailable',
    isInfoOnly: false,
  };
}
