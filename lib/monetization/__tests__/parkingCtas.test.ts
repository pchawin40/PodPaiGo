import {
  AFFILIATE_DISCLOSURE,
  buildParkingMonetizationCtas,
} from '../outboundClickTypes';

describe('parking monetization CTAs', () => {
  test('uses reserve/view/directions labels when URLs exist', () => {
    const ctas = buildParkingMonetizationCtas({
      bookingUrl: 'https://provider.example/book',
      providerUrl: 'https://provider.example/book',
      directionsUrl: 'https://maps.example/dir',
    });

    expect(ctas.reserveLabel).toBe('Reserve parking');
    expect(ctas.viewProviderLabel).toBe('View provider');
    expect(ctas.directionsLabel).toBe('Route to parking');
    expect(ctas.reserveEnabled).toBe(true);
  });

  test('shows booking unavailable when no booking URL exists', () => {
    const ctas = buildParkingMonetizationCtas({
      bookingUrl: null,
      directionsUrl: null,
    });

    expect(ctas.reserveLabel).toBe('Booking unavailable');
    expect(ctas.reserveEnabled).toBe(false);
  });

  test('includes affiliate disclosure copy', () => {
    expect(AFFILIATE_DISCLOSURE).toContain('partner links');
  });

  test('supports official info-only CTA labels', () => {
    const ctas = buildParkingMonetizationCtas({
      bookingUrl: 'https://www.portseattle.org/sea/parking/parking-information',
      providerUrl: 'https://www.portseattle.org/sea/parking/parking-information',
      reserveLabel: 'Check official parking',
      infoOnlyBooking: true,
    });

    expect(ctas.reserveLabel).toBe('Check official parking');
    expect(ctas.reserveEnabled).toBe(true);
  });

  test('supports official ReserveSEA booking CTA labels', () => {
    const ctas = buildParkingMonetizationCtas({
      bookingUrl: 'https://reservesea.portseattle.org/book/SEA/Parking',
      providerUrl: 'https://reservesea.portseattle.org/book/SEA/Parking',
      reserveLabel: 'Reserve official parking',
    });

    expect(ctas.reserveLabel).toBe('Reserve official parking');
    expect(ctas.reserveEnabled).toBe(true);
  });
});
