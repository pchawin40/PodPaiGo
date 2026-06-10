import {
  buildParkingGoogleCacheKey,
  deriveStableParkingLotIdToken,
} from '../googlePlaceMatchUtils';

describe('Google Places cache key stability', () => {
  test('1. same lot/address with different request-specific ids maps to one stable key', () => {
    const base = {
      airportCode: null,
      lotName: 'Pier 66 Surface',
      lotAddress: '2401 Alaskan Way, Seattle, WA 98105',
    };

    const keyA = buildParkingGoogleCacheKey({
      ...base,
      parkingLotId:
        'destination-parkwhiz-parkwhiz-65141-aaaaaaaa-1111-2222-3333-444444444444',
    });
    const keyB = buildParkingGoogleCacheKey({
      ...base,
      parkingLotId:
        'destination-parkwhiz-parkwhiz-65141-bbbbbbbb-5555-6666-7777-888888888888',
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toContain('id:parkwhiz-65141');
    expect(keyA).not.toMatch(/aaaaaaaa|bbbbbbbb/);
  });

  test('pure UUID provider id is dropped; key falls back to stable name + address', () => {
    const base = {
      lotName: 'Pier 66 Surface',
      lotAddress: '2401 Alaskan Way, Seattle, WA',
    };

    const keyA = buildParkingGoogleCacheKey({
      ...base,
      parkingLotId: 'aaaaaaaa-1111-2222-3333-444444444444',
    });
    const keyB = buildParkingGoogleCacheKey({
      ...base,
      parkingLotId: 'ffffffff-9999-8888-7777-666666666666',
    });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toContain('id:');
    expect(keyA).toContain('name:pier 66 surface');
  });

  test('deriveStableParkingLotIdToken keeps stable ids and drops request-specific ones', () => {
    expect(deriveStableParkingLotIdToken('65141')).toBe('65141');
    expect(
      deriveStableParkingLotIdToken('destination-parkwhiz-parkwhiz-65141-abc123'),
    ).toBe('parkwhiz-65141');
    expect(deriveStableParkingLotIdToken('aaaaaaaa-1111-2222-3333-444444444444')).toBe('');
    expect(deriveStableParkingLotIdToken('')).toBe('');
    expect(deriveStableParkingLotIdToken(null)).toBe('');
    expect(deriveStableParkingLotIdToken(undefined)).toBe('');
  });

  test('5. airport lot key keeps its stable numeric DB id and SEA namespace (unchanged)', () => {
    const args = {
      airportCode: 'SEA',
      parkingLotId: 4821,
      lotName: 'WallyPark Premier Garage',
      lotAddress: '18220 International Blvd',
    };

    const keyA = buildParkingGoogleCacheKey(args);
    const keyB = buildParkingGoogleCacheKey(args);

    expect(keyA).toBe(keyB);
    expect(keyA.startsWith('SEA|')).toBe(true);
    expect(keyA).toContain('id:4821');
  });

  test('6. city/general and airport namespaces stay separate for the same lot', () => {
    const cityKey = buildParkingGoogleCacheKey({
      airportCode: null,
      parkingLotId: 'destination-parkwhiz-parkwhiz-65141-xyz',
      lotName: 'Pier 66 Surface',
      lotAddress: '2401 Alaskan Way',
    });
    const airportKey = buildParkingGoogleCacheKey({
      airportCode: 'SEA',
      parkingLotId: 'destination-parkwhiz-parkwhiz-65141-xyz',
      lotName: 'Pier 66 Surface',
      lotAddress: '2401 Alaskan Way',
    });

    expect(cityKey.startsWith('UNKNOWN|')).toBe(true);
    expect(airportKey.startsWith('SEA|')).toBe(true);
    expect(cityKey).not.toBe(airportKey);
  });

  test('name + address key portion is preserved for lots without a stable id', () => {
    const key = buildParkingGoogleCacheKey({
      airportCode: null,
      lotName: 'Securities Building Garage',
      lotAddress: '1904 3rd Ave, Seattle, WA',
    });

    expect(key.startsWith('UNKNOWN|name:')).toBe(true);
    expect(key).toContain('|addr:');
    expect(key).not.toContain('|id:');
  });
});
