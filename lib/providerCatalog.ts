export const PROVIDER_LINKS = {
  seatacOfficialParking: {
    label: 'Official parking info / reservation page',
    url: 'https://www.portseattle.org/sea/parking',
    sourceName: 'Port of Seattle',
  },
  wallyparkSea: {
    label: 'WallyPark SEA',
    url: 'https://www.wallypark.com/seattle-airport-parking',
    sourceName: 'WallyPark',
  },
  masterparkSea: {
    label: 'MasterPark SEA',
    url: 'https://masterparking.com/locations/seattle-airport-parking',
    sourceName: 'MasterPark',
  },
  airportParkingReservationsSea: {
    label: 'AirportParkingReservations (SEA)',
    url: 'https://www.airportparkingreservations.com/airportparking/seattle_tacoma_international_airport_parking.html',
    sourceName: 'AirportParkingReservations',
  },
  uberDeepLink: {
    label: 'Uber (open app)',
    url: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
    sourceName: 'Uber',
  },
  lyftDeepLink: {
    label: 'Lyft (open app)',
    url: 'https://lyft.com/ride',
    sourceName: 'Lyft',
  },
  soundTransitPlanner: {
    label: 'Sound Transit trip planner',
    url: 'https://www.soundtransit.org/tripplanner',
    sourceName: 'Sound Transit',
  },
  googleMaps: {
    label: 'Google Maps',
    url: 'https://www.google.com/maps',
    sourceName: 'Google Maps',
  },
};

export function googleMapsSearchLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
