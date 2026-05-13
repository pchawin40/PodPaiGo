import type { ParkingProvider } from '../types';
import { getAirportById } from '@/lib/airports/catalog';

export const airportOfficialProvider: ParkingProvider = async ({ airportId }) => {
  const airport = getAirportById(airportId);
  if (!airport) return { provider: 'Official airport', options: [] };

  return {
    provider: 'Official airport',
    options: [
      {
        id: `${airportId.toLowerCase()}-official-garage`,
        airportId,
        name: `${airport.id} Official Garage Parking`,
        providerName: airport.label,
        bookingUrl: airport.officialParkingUrl,
        sourceUrl: airport.officialParkingUrl,
        category: 'airport-garage',
        pricePerDay: airportId === 'SEA' ? 37 : undefined,
        priceConfidence: 'estimated',
        walkMinutes: 5,
        covered: true,
        open24Hours: true,
        tags: ['Official airport parking', 'Covered', '24/7'],
      },
    ],
  };
};
