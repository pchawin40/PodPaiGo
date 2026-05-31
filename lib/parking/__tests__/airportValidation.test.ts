import {
  milesBetween,
  filterParkingByAirport,
  computeDistanceToAirport,
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

  it('computeDistanceToAirport returns undefined without lot coordinates', () => {
    expect(
      computeDistanceToAirport(lot({ serviceAirportCode: 'SEA' }), {
        lat: 47.45,
        lng: -122.31,
      }),
    ).toBeUndefined();
  });
});
