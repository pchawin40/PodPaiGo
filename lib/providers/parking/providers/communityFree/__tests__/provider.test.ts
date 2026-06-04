import { getVerifiedUserParkingNear } from '../../../../../parking/userParkingSpacesServer';
import {
  getCommunityFreeParkingOptions,
  userParkingSpaceToParkingOption,
} from '../provider';
import type { VerifiedUserParkingResult } from '../../../../../parking/userParkingSpacesServer';

jest.mock('../../../../../parking/userParkingSpacesServer', () => ({
  getVerifiedUserParkingNear: jest.fn(async () => []),
}));

function row(overrides: Partial<VerifiedUserParkingResult> = {}): VerifiedUserParkingResult {
  return {
    id: 'space-1',
    user_id: 'user-1',
    name: 'Verified Free Lot',
    address: '100 Free St, Seattle, WA',
    lat: 47.61,
    lng: -122.33,
    google_place_id: null,
    parking_type: 'street_free',
    price: 0,
    is_free: true,
    time_limit_minutes: null,
    overnight_allowed: null,
    validation_required: false,
    business_name: null,
    lot_rules: null,
    notes: null,
    evidence_url: null,
    source: 'user-submitted',
    status: 'verified',
    verified_by: 'admin-1',
    verified_at: '2026-06-01T00:00:00.000Z',
    rejection_reason: null,
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    distanceMeters: 300,
    ...overrides,
  };
}

describe('community free parking provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps verified free parking to a trustworthy $0 parking option with warnings', () => {
    const option = userParkingSpaceToParkingOption(row({
      time_limit_minutes: 120,
      lot_rules: 'Two-hour street parking 8 AM to 6 PM.',
    }), {
      airportCode: 'GENERAL',
      destinationKind: 'general',
    });

    expect(option.price).toBe(0);
    expect(option.validationStatus).toBe('free');
    expect(option.sourceName).toBe('PodPaiGo verified free parking');
    expect(option.bestFor).toEqual(expect.arrayContaining(['Free', 'Verified by PodPaiGo']));
    expect(option.assumptions.join(' ')).toMatch(/Check signs/i);
    expect(option.validationNotes).toMatch(/Time limit: 120 min/);
  });

  test('filters airport overnight trips to verified overnight-plausible free parking', async () => {
    (getVerifiedUserParkingNear as jest.Mock).mockResolvedValueOnce([
      row({
        id: 'retail-no-overnight',
        name: 'Retail Lot Without Overnight',
        parking_type: 'retail_free',
        overnight_allowed: false,
      }),
      row({
        id: 'verified-overnight',
        name: 'Verified Overnight Free Lot',
        parking_type: 'street_free',
        overnight_allowed: true,
      }),
    ]);

    const options = await getCommunityFreeParkingOptions({
      airportCode: 'SEA',
      airportCoordinates: { lat: 47.45, lng: -122.31 },
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-03',
    });

    expect(options.map((option) => option.name)).toEqual(['Verified Overnight Free Lot']);
  });
});
