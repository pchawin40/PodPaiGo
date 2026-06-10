/// <reference types="google.maps" />

declare global {
    interface Window {
        initGoogleMaps?: () => void;
        gm_authFailure?: () => void;
    }
}

let googleMapsPromise: Promise<void> | null = null;
let googleMapsLoadFailure: Error | null = null;
let installedAuthFailureHandler: (() => void) | null = null;
let previousAuthFailureHandler: (() => void) | undefined;

const googleMapsFailureListeners = new Set<(error: Error) => void>();

function googleMapsLoadError(message: string): Error {
    const error = new Error(message);
    error.name = 'GoogleMapsLoadError';
    return error;
}

function notifyGoogleMapsLoadFailure(error: Error) {
    googleMapsLoadFailure = error;
    googleMapsPromise = null;
    googleMapsFailureListeners.forEach((listener) => listener(error));
}

function installAuthFailureHandler() {
    if (typeof window === 'undefined') return;
    if (window.gm_authFailure === installedAuthFailureHandler) return;

    previousAuthFailureHandler = window.gm_authFailure;
    installedAuthFailureHandler = () => {
        if (
            previousAuthFailureHandler &&
            previousAuthFailureHandler !== installedAuthFailureHandler
        ) {
            previousAuthFailureHandler();
        }

        notifyGoogleMapsLoadFailure(
            googleMapsLoadError(
                'Google Maps authentication failed. Check the browser key, Maps JavaScript API, and HTTP referrer restrictions.'
            )
        );
    };
    window.gm_authFailure = installedAuthFailureHandler;
}

export function onGoogleMapsLoadFailure(listener: (error: Error) => void): () => void {
    googleMapsFailureListeners.add(listener);
    return () => {
        googleMapsFailureListeners.delete(listener);
    };
}

export function resetGoogleMapsLoaderForTests() {
    googleMapsPromise = null;
    googleMapsLoadFailure = null;
    googleMapsFailureListeners.clear();
    installedAuthFailureHandler = null;
    previousAuthFailureHandler = undefined;
}

export async function loadGoogleMaps(apiKey: string): Promise<void> {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
        throw googleMapsLoadError('Google Maps browser API key is not configured.');
    }

    installAuthFailureHandler();

    if (googleMapsLoadFailure) throw googleMapsLoadFailure;

    if (globalThis.google?.maps) return;

    if (googleMapsPromise) return googleMapsPromise;

    googleMapsPromise = new Promise<void>((resolve, reject) => {
        let settled = false;
        const unsubscribe = onGoogleMapsLoadFailure((error) => rejectOnce(error));

        const resolveOnce = () => {
            if (settled) return;
            settled = true;
            unsubscribe();
            resolve();
        };

        const rejectOnce = (error: Error) => {
            if (settled) return;
            settled = true;
            unsubscribe();
            googleMapsPromise = null;
            reject(error);
        };

        const existing = document.getElementById('google-maps-script') as HTMLScriptElement | null;

        if (existing) {
            existing.addEventListener(
                'load',
                () => {
                    window.setTimeout(() => {
                        if (googleMapsLoadFailure) {
                            rejectOnce(googleMapsLoadFailure);
                        } else {
                            resolveOnce();
                        }
                    }, 0);
                },
                { once: true }
            );
            existing.addEventListener(
                'error',
                () => {
                    const error = googleMapsLoadError('Google Maps script failed to load.');
                    notifyGoogleMapsLoadFailure(error);
                    rejectOnce(error);
                },
                { once: true }
            );
            return;
        }

        window.initGoogleMaps = () => {
            window.setTimeout(() => {
                if (googleMapsLoadFailure) {
                    rejectOnce(googleMapsLoadFailure);
                } else {
                    resolveOnce();
                }
            }, 0);
        };

        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(trimmedApiKey)}&v=weekly&libraries=marker&loading=async&callback=initGoogleMaps`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            const error = googleMapsLoadError('Google Maps script failed to load.');
            notifyGoogleMapsLoadFailure(error);
            rejectOnce(error);
        };

        document.head.appendChild(script);
    });

    return googleMapsPromise;
}
