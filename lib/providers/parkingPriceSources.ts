export type ParkingPriceSourceConfig = {
  lotKey: string;
  label: string;
  urls: string[];
  fallbackPrice?: number;
  fallbackUnit?: 'per-day' | 'total';

  // NEW:
  crawlEnabled?: boolean;
};

export const SEA_PRICE_SOURCES: ParkingPriceSourceConfig[] = [
  {
    lotKey: 'wallypark',
    label: 'WallyPark SEA',
    urls: [
      'https://www.wallypark.com/seattle-airport-parking',
    ],
    fallbackPrice: 32,
    fallbackUnit: 'per-day',

    // blocked by Incapsula
    crawlEnabled: false,
  },

  {
    lotKey: 'masterpark',
    label: 'MasterPark SEA',
    urls: [
      'https://masterparking.com/locations/seattle-airport-parking',
    ],
    fallbackPrice: 34,
    fallbackUnit: 'per-day',

    // page loads but no reliable public price
    crawlEnabled: false,
  },

  {
    lotKey: 'airportparkingreservations',
    label: 'AirportParkingReservations SEA',
    urls: [
      'https://airportparkingreservations.com/sea/airport-parking',
    ],

    // keep trying later
    crawlEnabled: true,
  },
  {
    lotKey: 'extra car',
    label: 'Extra Car SEA',
    urls: ['https://airportparkingreservations.com/lot-extra-car-sea'],
    crawlEnabled: true,
  },
];