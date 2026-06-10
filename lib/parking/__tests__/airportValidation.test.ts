import {
  milesBetween,
  filterParkingByAirport,
  computeDistanceToAirport,
  getAirportParkingMaxDistanceMiles,
} from '../airportValidation';
import { ParkingOption } from '../../types';

function lot(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'lot-1',
    name: 'Test Lot',
    type: 'off-airport',
    price: 20,
    distance: 10,
    availability: 80,
    trustStatus: 'estimated',
    sourceName: 'Test',
    lastUpdated: new Date().toISOString(),
    assumptions: [],
    ...overrides,
  };
}

describe('airportValidation', () => {
  const originalPaeMax = process.env.PARKING_MAX_DISTANCE_MILES_PAE;

  afterEach(() => {
    if (originalPaeMax == null) {
      delete process.env.PARKING_MAX_DISTANCE_MILES_PAE;
    } else {
      process.env.PARKING_MAX_DISTANCE_MILES_PAE = originalPaeMax;
    }
  });

  it('computes milesBetween for known coordinates', () => {
    const sea = { lat: 47.4502, lng: -122.3088 };
    const pae = { lat: 47.9063, lng: -122.2816 };
    const miles = milesBetween(sea, pae);
    expect(miles).toBeGreaterThan(20);
    expect(miles).toBeLessThan(40);
  });

  it('rejects options without matching serviceAirportCode', () => {
    const options = [
      lot({ id: 'sea', serviceAirportCode: 'SEA' }),
      lot({ id: 'pae', serviceAirportCode: 'PAE' }),
    ];

    expect(filterParkingByAirport(options, 'PAE')).toEqual([options[1]]);
  });

  it('rejects options outside max distance when coordinates exist', () => {
    const airport = { lat: 47.4502, lng: -122.3088 };
    const nearby = lot({
      id: 'near',
      serviceAirportCode: 'SEA',
      lat: 47.46,
      lng: -122.31,
    });
    const far = lot({
      id: 'far',
      serviceAirportCode: 'SEA',
      lat: 47.9,
      lng: -122.28,
    });

    const filtered = filterParkingByAirport([nearby, far], 'SEA', airport);
    expect(filtered.map((o) => o.id)).toEqual(['near']);
  });

  it('uses a tighter PAE radius and excludes Tacoma-area airport parking', () => {
    const pae = { lat: 47.9063, lng: -122.2816 };
    const nearEverett = lot({
      id: 'pae-near',
      name: 'Paine Field Economy Parking',
      serviceAirportCode: 'PAE',
      lat: 47.907,
      lng: -122.28,
    });
    const tacoma = lot({
      id: 'tacoma',
      name: 'Tacoma Airport Parking',
      serviceAirportCode: 'PAE',
      lat: 47.2529,
      lng: -122.4443,
    });

    expect(getAirportParkingMaxDistanceMiles('PAE')).toBe(8);
    expect(filterParkingByAirport([nearEverett, tacoma], 'PAE', pae).map((o) => o.id)).toEqual([
      'pae-near',
    ]);
  });

  it('allows airport-specific distance env override', () => {
    process.env.PARKING_MAX_DISTANCE_MILES_PAE = '12';
    expect(getAirportParkingMaxDistanceMiles('PAE')).toBe(12);
  });

  it('computeDistanceToAirport returns undefined without lot coordinates', () => {
    expect(
      computeDistanceToAirport(lot({ serviceAirportCode: 'SEA' }), {
        lat: 47.45,
        lng: -122.31,
      }),
    ).toBeUndefined();
  });
});
