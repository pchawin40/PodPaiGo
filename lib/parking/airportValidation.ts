import type { ParkingOption } from '../types';
import type { AirportCoordinates } from '../providers/parking/types';

const EARTH_RADIUS_MILES = 3958.8;

export function milesBetween(
  a: AirportCoordinates,
  b: AirportCoordinates,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function getParkingMaxDistanceMiles(): number {
  return Number(process.env.PARKING_MAX_DISTANCE_MILES || 25);
}

const AIRPORT_SPECIFIC_MAX_DISTANCE_MILES: Record<string, number> = {
  PAE: 8,
};

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAirportParkingMaxDistanceMiles(airportCode?: string | null): number {
  const code = airportCode?.toUpperCase() || '';
  const airportDefault = AIRPORT_SPECIFIC_MAX_DISTANCE_MILES[code];
  const globalDefault = getParkingMaxDistanceMiles();
  const fallback = airportDefault ?? globalDefault;

  return readPositiveNumber(
    process.env[`PARKING_MAX_DISTANCE_MILES_${code}`],
    fallback,
  );
}

export function computeDistanceToAirport(
  option: Pick<ParkingOption, 'lat' | 'lng'>,
  airportCoordinates?: AirportCoordinates,
): number | undefined {
  if (
    airportCoordinates &&
    typeof option.lat === 'number' &&
    typeof option.lng === 'number'
  ) {
    return Number(
      milesBetween(airportCoordinates, { lat: option.lat, lng: option.lng }).toFixed(2),
    );
  }

  return undefined;
}

export function filterParkingByAirport(
  options: ParkingOption[],
  airportCode: string,
  airportCoordinates?: AirportCoordinates,
): ParkingOption[] {
  const selected = airportCode.toUpperCase();
  const maxDistanceMiles = getAirportParkingMaxDistanceMiles(selected);

  return options.filter((option) => {
    const serviceCode = option.serviceAirportCode?.toUpperCase();
    if (!serviceCode || serviceCode !== selected) {
      return false;
    }

    if (airportCoordinates && typeof option.lat === 'number' && typeof option.lng === 'number') {
      const distance = computeDistanceToAirport(option, airportCoordinates);
      if (distance != null && distance > maxDistanceMiles) {
        return false;
      }
    }

    return true;
  });
}

export function annotateParkingForAirport(
  option: ParkingOption,
  airportCode: string,
  airportCoordinates?: AirportCoordinates,
): ParkingOption {
  const serviceAirportCode = airportCode.toUpperCase();
  const distanceToAirport = computeDistanceToAirport(option, airportCoordinates);

  return {
    ...option,
    serviceAirportCode: option.serviceAirportCode?.toUpperCase() ?? serviceAirportCode,
    ...(distanceToAirport != null ? { distanceToAirport } : {}),
  };
}
