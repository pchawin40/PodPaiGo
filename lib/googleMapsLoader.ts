/// <reference types="google.maps" />

declare global {
    interface Window {
        initGoogleMaps?: () => void;
    }
}

let googleMapsPromise: Promise<void> | null = null;

export async function loadGoogleMaps(apiKey: string): Promise<void> {
    if (globalThis.google?.maps) return;

    if (googleMapsPromise) return googleMapsPromise;

    googleMapsPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById('google-maps-script');

        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')), { once: true });
            return;
        }

        window.initGoogleMaps = () => resolve();

        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=marker&loading=async&callback=initGoogleMaps`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('Google Maps failed to load'));

        document.head.appendChild(script);
    });

    return googleMapsPromise;
}
