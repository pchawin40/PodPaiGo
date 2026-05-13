import type { ParkingProvider } from '../types';

export const cheapestAirportParkingProvider: ParkingProvider = async ({ airportId }) => {
  if (airportId !== 'SEA') {
    return { provider: 'CheapestAirportParking', options: [] };
  }

  return {
    provider: 'CheapestAirportParking',
    options: [
      {
        id: 'sea-seatac-international-airport-parking',
        airportId,
        name: 'Seatac International Airport Parking',
        providerName: 'CheapestAirportParking.com',
        bookingUrl: 'https://www.cheapestairportparking.com',
        sourceUrl: 'https://www.cheapestairportparking.com',
        category: 'marketplace',
        pricePerDay: 14.99,
        priceConfidence: 'estimated',
        shuttleMinutes: 12,
        tags: ['Marketplace', 'Check live price'],
        notes: ['Estimated listing from CAP-style data, not live pricing.'],
      },
    ],
  };
};
