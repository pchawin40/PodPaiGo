import type { ParkingProvider } from '../types';

export const staticFallbackProvider: ParkingProvider = async ({ airportId }) => {
  if (airportId !== 'SEA') {
    return { provider: 'Static fallback', options: [] };
  }

  return {
    provider: 'Static fallback',
    options: [
      {
        id: 'sea-northgate-park-ride',
        airportId,
        name: 'Northgate Park & Ride',
        providerName: 'King County Metro',
        bookingUrl: 'https://kingcounty.gov/en/dept/metro',
        sourceUrl: 'https://www.cheapestairportparking.com',
        category: 'park-and-ride',
        priceConfidence: 'unavailable',
        driveMinutes: 20,
        shuttleMinutes: 40,
        imageAlt: 'Park & Ride + transit connection',
        tags: ['Park & Ride', 'Transit connection'],
        notes: ['Park & Ride + transit connection', 'Check live price and transit schedule'],
      },
    ],
  };
};
