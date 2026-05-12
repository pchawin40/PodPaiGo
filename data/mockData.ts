import { LocationInfo, FlightInfo, ParkingOption, RideshareOption, TrafficEstimate, TransitOption } from '../lib/types';
import { PROVIDER_LINKS } from '../lib/providerCatalog';
import { googleMapsSearchLink } from '../lib/maps';


export const mockParkingOptions: ParkingOption[] = [
  {
    id: 'sea-reserved',
    name: 'SEA Reserved Parking (Official)',
    type: 'official',
    parkingBufferMinutes: 5,
    transferToTerminalMinutes: 3,
    transferType: 'walk',
    // example official reserved daily rate (estimate)
    price: 47,
    priceDisplay: 'from-per-day' as const,
    priceUnit: 'per-day' as const,
    priceNote: 'Official daily rate (check live info)',
    priceSource: 'official-rate',
    priceConfidence: 'high',
    distance: 5,
    availability: 80,
    trustStatus: 'verified-source',
    routeUnavailable: false,
    sourceName: PROVIDER_LINKS.seatacOfficialParking.sourceName,
    sourceLink: PROVIDER_LINKS.seatacOfficialParking.url,
    mapLink: googleMapsSearchLink('SEA reserved parking'),
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Daily rate is a baseline estimate; verify during booking',
      'Availability is historical/illustrative (not live)'
    ],
    walkingMinutes: 3,
    shuttleMinutes: 0,
    covered: true,
    reviewScore: 4.2,
    reviewCount: 1800,
    availabilityScore: 78,
    bookingProvider: 'Port of Seattle',
    bestFor: ['Closest Walk', 'Lowest Stress', 'Best if Running Late'],
  },
  {
    id: 'sea-general',
    name: 'SEA General Parking (Official)',
    type: 'official',
    parkingBufferMinutes: 8,
    transferToTerminalMinutes: 5,
    transferType: 'walk',
    price: 37,
    priceDisplay: 'from-per-day' as const,
    priceUnit: 'per-day' as const,
    priceNote: 'Official daily rate (check live info)',
    priceSource: 'official-rate',
    priceConfidence: 'high',
    distance: 3,
    availability: 60,
    trustStatus: 'verified-source',
    routeUnavailable: false,
    sourceName: PROVIDER_LINKS.seatacOfficialParking.sourceName,
    sourceLink: PROVIDER_LINKS.seatacOfficialParking.url,
    mapLink: googleMapsSearchLink('SEA general parking'),
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Daily rate is a baseline estimate; verify during booking',
      'Availability is historical/illustrative (not live)'
    ],
    walkingMinutes: 5,
    shuttleMinutes: 0,
    covered: true,
    reviewScore: 4.1,
    reviewCount: 2600,
    availabilityScore: 62,
    bookingProvider: 'Port of Seattle',
    bestFor: ['Covered', 'Official parking'],
  },
  {
    id: 'off-airport-wallypark',
    name: 'WallyPark (off-airport shuttle lot)',
    type: 'off-airport',
    parkingBufferMinutes: 10,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    // Rough daily-rate placeholder for ranking only.
    price: 32,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Open provider to see live prices. Prices may be lower than this estimate.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    distance: 12,
    availability: 90,
    trustStatus: 'estimated',
    routeUnavailable: false,
    sourceName: PROVIDER_LINKS.wallyparkSea.sourceName,
    sourceLink: PROVIDER_LINKS.wallyparkSea.url,
    mapLink: googleMapsSearchLink('WallyPark SeaTac'),
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Pricing varies by date/time and promos',
      'Shuttle service included',
      'Check live price before booking'
    ],
    walkingMinutes: 2,
    shuttleMinutes: 12,
    covered: true,
    reviewScore: 4.4,
    reviewCount: 2100,
    availabilityScore: 88,
    bookingProvider: 'WallyPark',
    bestFor: ['Best value', 'Best Weather', 'Best Reviews'],
  },
  {
    id: 'off-airport-masterpark',
    name: 'MasterPark (off-airport shuttle lot)',
    type: 'off-airport',
    parkingBufferMinutes: 10,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    price: 34,
    priceDisplay: 'from-per-day' as const,
    priceUnit: 'per-day' as const,
    priceNote: 'Estimated daily rate — check live price',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    distance: 15,
    availability: 85,
    trustStatus: 'estimated',
    routeUnavailable: false,
    sourceName: PROVIDER_LINKS.masterparkSea.sourceName,
    sourceLink: PROVIDER_LINKS.masterparkSea.url,
    mapLink: googleMapsSearchLink('MasterPark SeaTac'),
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Pricing varies by date/time and promos',
      'Shuttle service included',
      'Check live price before booking'
    ],
    walkingMinutes: 2,
    shuttleMinutes: 12,
    covered: true,
    reviewScore: 4.5,
    reviewCount: 3100,
    availabilityScore: 88,
    bookingProvider: 'MasterPark',
    bestFor: ['Best Reviews', 'Best for Families', 'Best Value'],
  },
];

export const mockRideshareOptions: RideshareOption[] = [
  {
    id: 'uber',
    name: 'Uber',
    // Placeholder used for ranking only — NOT a live quote.
    price: 85,
    priceMin: 70,
    priceMax: 105,
    priceRangeLabel: '$70-$105',
    priceDisplay: 'estimated',
    priceNote: 'Baseline estimate only. Check final price in the Uber app.',
    rideshareEstimateConfidence: 'baseline-estimate',
    duration: 25,
    availability: 85,
    trustStatus: 'estimated',
    sourceName: 'Mock rideshare model',
    sourceLink: PROVIDER_LINKS.uberDeepLink.url,
    mapLink: googleMapsSearchLink('Seattle-Tacoma International Airport'),
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Not a live Uber quote',
      'Surge pricing may apply',
      'Check the app for real-time pricing'
    ]
  },
  {
    id: 'lyft',
    name: 'Lyft',
    price: 80,
    priceMin: 66,
    priceMax: 100,
    priceRangeLabel: '$66-$100',
    priceDisplay: 'estimated',
    priceNote: 'Baseline estimate only. Check final price in the Lyft app.',
    rideshareEstimateConfidence: 'baseline-estimate',
    duration: 28,
    availability: 80,
    trustStatus: 'estimated',
    sourceName: 'Mock rideshare model',
    sourceLink: PROVIDER_LINKS.lyftDeepLink.url,
    mapLink: googleMapsSearchLink('Seattle-Tacoma International Airport'),
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Not a live Lyft quote',
      'Pricing varies heavily by time and demand',
      'Check the app for real-time pricing'
    ]
  },
  {
    id: 'taxi',
    name: 'Taxi (estimate)',
    price: 95,
    priceMin: 82,
    priceMax: 110,
    priceRangeLabel: '$82-$110',
    priceDisplay: 'estimated',
    priceNote: 'Baseline taxi fare estimate — request separately',
    rideshareEstimateConfidence: 'baseline-estimate',
    duration: 20,
    availability: 70,
    trustStatus: 'estimated',
    sourceName: 'Estimated taxi fare model',
    sourceLink: undefined,
    mapLink: googleMapsSearchLink('Taxi SeaTac'),
    lastUpdated: new Date().toISOString(),
    assumptions: ['Not a live quote', 'Metered fare plus airport fees']
  },
];

export const mockTransitOptions: TransitOption[] = [
  {
    id: 'light-rail',
    name: 'Light Rail',
    price: 3.00,
    priceDisplay: 'estimated',
    priceNote: '$3 one-way fare estimate',
    duration: 40,
    frequency: 10,
    availability: 90,
    trustStatus: 'verified-source',
    sourceName: 'Sound Transit',
    sourceLink: 'https://www.soundtransit.org',
    mapLink: googleMapsSearchLink('SeaTac light rail station'),
    lastUpdated: new Date().toISOString(),
    assumptions: ['Fare may change; verify before travel', 'Frequency may vary during peak hours']
  },
  {
    id: 'bus-174',
    name: 'Bus Route 174',
    price: 3.00,
    priceDisplay: 'estimated',
    priceNote: '$3 one-way fare estimate',
    duration: 45,
    frequency: 15,
    availability: 75,
    trustStatus: 'verified-source',
    sourceName: 'King County Metro',
    sourceLink: 'https://kingcounty.gov/en/dept/metro',
    mapLink: googleMapsSearchLink('King County Metro Route 174 SeaTac'),
    lastUpdated: new Date().toISOString(),
    assumptions: ['Fare may change; verify before travel', 'Frequency may vary during peak hours']
  },
];

export const tsaEstimates: Record<string, number> = {
  'Central Terminal': 20,
  'North Satellite': 25,
  'South Satellite': 22,
};

export const mockTrafficEstimates: Record<string, TrafficEstimate> = {
  'home-airport': {
    route: 'home-airport',
    duration: 28,
    congestion: 'medium',
    trustStatus: 'estimated',
    sourceName: 'Historical averages',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Not live traffic', 'May vary by time of day and weather']
  },
  'airport-home': {
    route: 'airport-home',
    duration: 24,
    congestion: 'low',
    trustStatus: 'estimated',
    sourceName: 'Historical averages',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Not live traffic', 'May vary by time of day and weather']
  },
};

export const mockFlightInfo: Record<string, FlightInfo> = {
  'Central Terminal': {
    destination: 'Central Terminal',
    status: 'On time',
    gate: 'A1',
    scheduledTime: '2024-01-01T10:00',
    trustStatus: 'verified-source',
    sourceName: 'FlightAware',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Flight status subject to change', 'Gate assignments may change']
  },
  'North Satellite': {
    destination: 'North Satellite',
    status: 'On time',
    gate: 'N2',
    scheduledTime: '2024-01-01T14:00',
    trustStatus: 'verified-source',
    sourceName: 'FlightAware',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Flight status subject to change', 'Gate assignments may change']
  },
  'South Satellite': {
    destination: 'South Satellite',
    status: 'On time',
    gate: 'S3',
    scheduledTime: '2024-01-01T16:00',
    trustStatus: 'verified-source',
    sourceName: 'FlightAware',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Flight status subject to change', 'Gate assignments may change']
  },
};

export const mockLocationInfo: Record<string, LocationInfo> = {
  'Central Terminal': {
    destination: 'Central Terminal',
    name: 'SeaTac Central Terminal',
    services: ['Parking', 'Shuttles', 'Lounges'],
    trustStatus: 'verified-source',
    sourceName: 'Port of Seattle',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Services available 24/7', 'Subject to seasonal changes']
  },
  'North Satellite': {
    destination: 'North Satellite',
    name: 'SeaTac North Satellite',
    services: ['Shuttles', 'Security', 'Customer Service'],
    trustStatus: 'verified-source',
    sourceName: 'Port of Seattle',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Services available 24/7', 'Subject to seasonal changes']
  },
  'South Satellite': {
    destination: 'South Satellite',
    name: 'SeaTac South Satellite',
    services: ['Shuttles', 'Airport Dining', 'Restrooms'],
    trustStatus: 'verified-source',
    sourceName: 'Port of Seattle',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Services available 24/7', 'Subject to seasonal changes']
  },
};
