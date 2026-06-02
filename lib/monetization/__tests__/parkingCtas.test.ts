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
    expect(ctas.directionsLabel).toBe('Get directions');
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
});
