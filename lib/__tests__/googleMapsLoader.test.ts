/**
 * @jest-environment jsdom
 */
import {
  loadGoogleMaps,
  onGoogleMapsLoadFailure,
  resetGoogleMapsLoaderForTests,
} from '../googleMapsLoader';

describe('googleMapsLoader', () => {
  beforeEach(() => {
    resetGoogleMapsLoaderForTests();
    document.head.innerHTML = '';
    delete (globalThis as typeof globalThis & { google?: unknown }).google;
    delete window.initGoogleMaps;
    delete window.gm_authFailure;
  });

  afterEach(() => {
    resetGoogleMapsLoaderForTests();
    document.head.innerHTML = '';
    delete window.initGoogleMaps;
    delete window.gm_authFailure;
  });

  test('rejects before appending a script when the browser API key is missing', async () => {
    await expect(loadGoogleMaps('')).rejects.toThrow('Google Maps browser API key is not configured.');
    expect(document.getElementById('google-maps-script')).not.toBeInTheDocument();
  });

  test('rejects and notifies listeners when the Google Maps script fails to load', async () => {
    const listener = jest.fn();
    onGoogleMapsLoadFailure(listener);

    const promise = loadGoogleMaps('browser-key');
    const script = document.getElementById('google-maps-script');
    expect(script).toBeInTheDocument();

    script?.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow('Google Maps script failed to load.');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Google Maps script failed to load.',
    }));
  });

  test('rejects and notifies listeners when Google reports an auth or referrer failure', async () => {
    const listener = jest.fn();
    onGoogleMapsLoadFailure(listener);

    const promise = loadGoogleMaps('browser-key');
    expect(window.gm_authFailure).toBeInstanceOf(Function);

    window.gm_authFailure?.();

    await expect(promise).rejects.toThrow('Google Maps authentication failed.');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('HTTP referrer restrictions'),
    }));
  });
});
