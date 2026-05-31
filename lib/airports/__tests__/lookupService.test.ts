import {
  AirportLookupService,
  mapOurAirportsCsvRow,
  recordToAirportInfo,
} from '../lookupService';
import type { NationalAirportRecord } from '../records';

const FIXTURE: NationalAirportRecord[] = [
  {
    airportCode: 'SEA',
    iata: 'SEA',
    icao: 'KSEA',
    name: 'Seattle-Tacoma International Airport',
    city: 'Seattle',
    state: 'WA',
    country: 'US',
    latitude: 47.4502,
    longitude: -122.3088,
    timezone: null,
    airportType: 'large_airport',
    keywords: 'SeaTac',
  },
  {
    airportCode: 'PAE',
    iata: 'PAE',
    icao: 'KPAE',
    name: 'Snohomish County (Paine Field)',
    city: 'Everett',
    state: 'WA',
    country: 'US',
    latitude: 47.9063,
    longitude: -122.2816,
    timezone: null,
    airportType: 'medium_airport',
    keywords: 'Paine Field',
  },
  {
    airportCode: 'LAX',
    iata: 'LAX',
    icao: 'KLAX',
    name: 'Los Angeles International Airport',
    city: 'Los Angeles',
    state: 'CA',
    country: 'US',
    latitude: 33.9425,
    longitude: -118.4081,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'JFK',
    iata: 'JFK',
    icao: 'KJFK',
    name: 'John F Kennedy International Airport',
    city: 'New York',
    state: 'NY',
    country: 'US',
    latitude: 40.6413,
    longitude: -73.7781,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'ORD',
    iata: 'ORD',
    icao: 'KORD',
    name: "Chicago O'Hare International Airport",
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    latitude: 41.9742,
    longitude: -87.9073,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'ATL',
    iata: 'ATL',
    icao: 'KATL',
    name: 'Hartsfield Jackson Atlanta International Airport',
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    latitude: 33.6407,
    longitude: -84.4277,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'DFW',
    iata: 'DFW',
    icao: 'KDFW',
    name: 'Dallas Fort Worth International Airport',
    city: 'Dallas-Fort Worth',
    state: 'TX',
    country: 'US',
    latitude: 32.8998,
    longitude: -97.0403,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'SFO',
    iata: 'SFO',
    icao: 'KSFO',
    name: 'San Francisco International Airport',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    latitude: 37.6213,
    longitude: -122.379,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'MDW',
    iata: 'MDW',
    icao: 'KMDW',
    name: 'Chicago Midway International Airport',
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    latitude: 41.7868,
    longitude: -87.7522,
    timezone: null,
    airportType: 'large_airport',
  },
  {
    airportCode: 'EWR',
    iata: 'EWR',
    icao: 'KEWR',
    name: 'Newark Liberty International Airport',
    city: 'Newark',
    state: 'NJ',
    country: 'US',
    latitude: 40.6895,
    longitude: -74.1745,
    timezone: null,
    airportType: 'large_airport',
  },
];

function createService(): AirportLookupService {
  const service = new AirportLookupService();
  service.loadRecords(FIXTURE);
  return service;
}

describe('AirportLookupService', () => {
  const service = createService();

  it.each(['SEA', 'PAE', 'LAX', 'JFK', 'ORD', 'ATL', 'DFW'])(
    'resolves %s by IATA code',
    (code) => {
      const airport = service.getAirportByIata(code);
      expect(airport).not.toBeNull();
      expect(airport?.id).toBe(code);
      expect(airport?.geoLocation.lat).not.toBe(0);
    },
  );

  it('resolves SEA by ICAO', () => {
    expect(service.getAirportByIcao('KSEA')?.id).toBe('SEA');
  });

  it('searches by city name', () => {
    const results = service.searchAirports('Seattle', 5);
    expect(results.some((a) => a.id === 'SEA')).toBe(true);
  });

  it('searches by alias SeaTac', () => {
    const results = service.searchAirports('SeaTac', 5);
    expect(results[0]?.id).toBe('SEA');
  });

  it('searches by alias Kennedy', () => {
    const results = service.searchAirports('Kennedy', 5);
    expect(results.some((a) => a.id === 'JFK')).toBe(true);
  });

  it('searches by alias OHare', () => {
    const results = service.searchAirports('ohare', 5);
    expect(results.some((a) => a.id === 'ORD')).toBe(true);
  });

  it('returns nearest airport to downtown Seattle', () => {
    const nearest = service.nearestAirport(47.6062, -122.3321, 3);
    expect(nearest[0]?.id).toBe('SEA');
  });

  it('maps OurAirports CSV rows for US large airports', () => {
    const record = mapOurAirportsCsvRow({
      id: '3630',
      ident: 'KSEA',
      type: 'large_airport',
      name: 'Seattle-Tacoma International Airport',
      latitude_deg: '47.4490',
      longitude_deg: '-122.3090',
      elevation_ft: '433',
      continent: 'NA',
      iso_country: 'US',
      iso_region: 'US-WA',
      municipality: 'Seattle',
      scheduled_service: 'yes',
      gps_code: 'KSEA',
      iata_code: 'SEA',
      local_code: 'SEA',
      home_link: '',
      wikipedia_link: '',
      keywords: 'SeaTac',
    });

    expect(record?.airportCode).toBe('SEA');
    expect(record?.state).toBe('WA');
  });

  it('merges WA enrichment metadata for SEA', () => {
    const airport = recordToAirportInfo(FIXTURE[0]);
    expect(airport.officialParkingUrl).toContain('portseattle.org');
    expect(airport.routingAddress).toContain('17801 International Blvd');
  });
});
