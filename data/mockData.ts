import { LocationInfo, FlightInfo, ParkingOption, RideshareOption, TrafficEstimate, TransitOption } from '../lib/types';

export const mockParkingOptions: ParkingOption[] = [
  {
    id: 'official-1',
    name: 'SeaTac Official Parking Garage',
    type: 'official',
    price: 25,
    distance: 5,
    availability: 80,
    trustStatus: 'verified-source',
    sourceName: 'SeaTac Airport',
    sourceLink: 'https://www.portseattle.org/sea-tac',
    mapLink: 'https://maps.google.com/?q=SeaTac+Official+Parking+Garage',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Daily rate applies for full trip duration', 'Availability based on historical data']
  },
  {
    id: 'official-2',
    name: 'Central Terminal Parking',
    type: 'official',
    price: 30,
    distance: 3,
    availability: 60,
    trustStatus: 'verified-source',
    sourceName: 'SeaTac Airport',
    sourceLink: 'https://www.portseattle.org/sea-tac',
    mapLink: 'https://maps.google.com/?q=SeaTac+Central+Terminal+Parking',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Daily rate applies for full trip duration', 'Availability based on historical data']
  },
  {
    id: 'off-airport-1',
    name: 'Park & Fly Lot A',
    type: 'off-airport',
    price: 15,
    distance: 10,
    availability: 90,
    trustStatus: 'estimated',
    sourceName: 'Third-party parking aggregator',
    sourceLink: 'https://example.com/parking',
    mapLink: 'https://maps.google.com/?q=Park+Fly+Lot+A+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Pricing may vary by season', 'Shuttle service included', 'Advance booking recommended']
  },
  {
    id: 'off-airport-2',
    name: 'Budget Airport Parking',
    type: 'off-airport',
    price: 12,
    distance: 15,
    availability: 95,
    trustStatus: 'estimated',
    sourceName: 'Third-party parking aggregator',
    sourceLink: 'https://example.com/parking',
    mapLink: 'https://maps.google.com/?q=Budget+Airport+Parking+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Pricing may vary by season', 'Shuttle service included', 'Advance booking recommended']
  },
];

export const mockRideshareOptions: RideshareOption[] = [
  {
    id: 'uber',
    name: 'Uber',
    price: 45,
    duration: 25,
    availability: 85,
    trustStatus: 'live',
    sourceName: 'Uber API',
    sourceLink: 'https://www.uber.com',
    mapLink: 'https://maps.google.com/?q=Uber+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Surge pricing may apply', 'Wait time for pickup included', 'Traffic conditions considered']
  },
  {
    id: 'lyft',
    name: 'Lyft',
    price: 42,
    duration: 28,
    availability: 80,
    trustStatus: 'live',
    sourceName: 'Lyft API',
    sourceLink: 'https://www.lyft.com',
    mapLink: 'https://maps.google.com/?q=Lyft+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Prime Time pricing may apply', 'Wait time for pickup included', 'Traffic conditions considered']
  },
  {
    id: 'taxi',
    name: 'Taxi',
    price: 50,
    duration: 20,
    availability: 70,
    trustStatus: 'estimated',
    sourceName: 'Local taxi dispatch',
    sourceLink: 'https://example.com/taxi',
    mapLink: 'https://maps.google.com/?q=Taxi+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Metered fare plus airport surcharge', 'Availability may vary by time of day']
  },
];

export const mockTransitOptions: TransitOption[] = [
  {
    id: 'light-rail',
    name: 'Light Rail',
    price: 3.25,
    duration: 40,
    frequency: 10,
    availability: 90,
    trustStatus: 'verified-source',
    sourceName: 'Sound Transit',
    sourceLink: 'https://www.soundtransit.org',
    mapLink: 'https://maps.google.com/?q=SeaTac+Light+Rail',
    lastUpdated: new Date().toISOString(),
    assumptions: ['ORCA card required for discounted fare', 'Frequency may vary during peak hours']
  },
  {
    id: 'bus-174',
    name: 'Bus Route 174',
    price: 2.75,
    duration: 45,
    frequency: 15,
    availability: 75,
    trustStatus: 'verified-source',
    sourceName: 'King County Metro',
    sourceLink: 'https://www.kingcounty.gov/metro',
    mapLink: 'https://maps.google.com/?q=Bus+Route+174+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['ORCA card required for discounted fare', 'Frequency may vary during peak hours']
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
    trustStatus: 'live',
    sourceName: 'Google Maps',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Based on current traffic conditions', 'May vary by time of day and weather']
  },
  'airport-home': {
    route: 'airport-home',
    duration: 24,
    congestion: 'low',
    trustStatus: 'live',
    sourceName: 'Google Maps',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Based on current traffic conditions', 'May vary by time of day and weather']
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