export type ParkingPriceSourceConfig = {
  lotKey: string;
  label: string;
  urls: string[];
  fallbackPrice?: number;
  fallbackUnit?: 'per-day' | 'total';
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
  },
  {
    lotKey: 'masterpark',
    label: 'MasterPark SEA',
    urls: [
      'https://masterparking.com/locations/seattle-airport-parking',
    ],
    fallbackPrice: 34,
    fallbackUnit: 'per-day',
  },
  {
    lotKey: 'airportparkingreservations',
    label: 'AirportParkingReservations SEA',
    urls: [
      'https://www.airportparkingreservations.com/airportparking/seattle_tacoma_international_airport_parking.html',
    ],
  },
];