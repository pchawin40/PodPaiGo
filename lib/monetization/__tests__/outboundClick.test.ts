/**
 * @jest-environment jsdom
 */

import { openTrackedUrl, trackOutboundClick } from '../trackOutboundClick';

describe('outbound click tracking client', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, stored: true }),
    }) as jest.Mock;
  });

  test('does not block navigation when logging succeeds', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    openTrackedUrl('https://provider.example/book', {
      eventType: 'reserve_parking',
      provider: 'ParkWhiz',
      destinationUrl: 'https://provider.example/book',
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      'https://provider.example/book',
      '_blank',
      'noopener,noreferrer',
    );
  });

  test('still opens destination when logging fails', () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    expect(() =>
      trackOutboundClick({
        eventType: 'view_provider',
        destinationUrl: 'https://provider.example',
      }),
    ).not.toThrow();

    openTrackedUrl('https://provider.example', {
      eventType: 'view_provider',
      destinationUrl: 'https://provider.example',
    });

    expect(openSpy).toHaveBeenCalled();
  });
});
