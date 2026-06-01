import {
  estimateDriveMinutesFromStraightLineMiles,
  haversineMiles,
  resolveParkingDriveMinutes,
} from '../lib/parking/routeMinutes';

describe('routeMinutes', () => {
  it('estimates realistic drive minutes from straight-line distance', () => {
    const minutes = estimateDriveMinutesFromStraightLineMiles(45);
    expect(minutes).toBeGreaterThanOrEqual(60);
  });

  it('prefers originToParkingMinutes over placeholder distance', () => {
    const minutes = resolveParkingDriveMinutes({
      id: 'test',
      name: 'Test lot',
      type: 'off-airport',
      price: 10,
      availability: 50,
      distance: 5,
      originToParkingMinutes: 68,
      assumptions: [],
    });

    expect(minutes).toBe(68);
  });

  it('computes haversine distance between two coordinates', () => {
    const monroeLat = 47.8554;
    const monroeLng = -121.9709;
    const seatacLat = 47.4502;
    const seatacLng = -122.3088;

    const miles = haversineMiles(monroeLat, monroeLng, seatacLat, seatacLng);
    expect(miles).toBeGreaterThan(30);
    expect(miles).toBeLessThan(55);
  });
});
