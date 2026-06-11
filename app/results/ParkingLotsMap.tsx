/// <reference types="google.maps" />
'use client';

import { useEffect, useRef, useState } from 'react';
import { ParkingOption } from '../../lib/types';
import { getAirportById } from '../../lib/airports/catalog';
import { loadGoogleMaps, onGoogleMapsLoadFailure } from '../../lib/googleMapsLoader';
import { googleMapsSearchLink } from '../../lib/maps';

const MAP_FALLBACK_MESSAGE = 'Map could not load. Open in Google Maps instead.';

type ParkingMapDiagnosticReason =
    | 'missing-browser-key'
    | 'missing-map-center'
    | 'google-maps-auth-failed'
    | 'google-maps-load-failed';

type ParkingMapTarget = {
    href: string;
    label: string;
};

const warnedMapIssues = new Set<ParkingMapDiagnosticReason>();

function warnParkingMapIssue(reason: ParkingMapDiagnosticReason, error?: unknown) {
    if (process.env.NODE_ENV === 'test' || warnedMapIssues.has(reason)) return;

    warnedMapIssues.add(reason);
    const message = error instanceof Error ? error.message : undefined;

    console.warn('[parking-map]', {
        reason,
        envVar: reason === 'missing-browser-key' ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' : undefined,
        message,
    });
}

function isFiniteCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function coordinateQuery(position: google.maps.LatLngLiteral): string {
    return `${position.lat},${position.lng}`;
}

function parkingLotCoordinates(lot: ParkingOption): google.maps.LatLngLiteral | null {
    if (isFiniteCoordinate(lot.canonicalLat) && isFiniteCoordinate(lot.canonicalLng)) {
        return { lat: lot.canonicalLat, lng: lot.canonicalLng };
    }

    if (isFiniteCoordinate(lot.lat) && isFiniteCoordinate(lot.lng)) {
        return { lat: lot.lat, lng: lot.lng };
    }

    if (isFiniteCoordinate(lot.routeTargetLat) && isFiniteCoordinate(lot.routeTargetLng)) {
        return { lat: lot.routeTargetLat, lng: lot.routeTargetLng };
    }

    return null;
}

function mapTargetFromQuery(label: string, query: string): ParkingMapTarget {
    return {
        label,
        href: googleMapsSearchLink(query),
    };
}

function parkingLotMapTarget(lot: ParkingOption): ParkingMapTarget | null {
    const coordinates = parkingLotCoordinates(lot);
    if (coordinates) return mapTargetFromQuery(lot.name, coordinateQuery(coordinates));

    const query =
        lot.canonicalAddress ||
        lot.address ||
        lot.normalizedAddress ||
        lot.routeDestination ||
        lot.name;

    if (!query.trim()) return null;

    return mapTargetFromQuery(lot.name, query);
}

function waitForMapContainerPaint(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            globalThis.setTimeout(resolve, 0);
            return;
        }

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

function trustedParkingSourceLink(lot: ParkingOption): string | null {
    const provider = `${lot.bookingProvider || ''} ${lot.sourceName || ''}`.toLowerCase();
    const link = lot.sourceLink || null;
    const url = String(link || '').toLowerCase();

    if (provider.includes('way.com') || /\bway\b/.test(provider)) return null;

    if (provider.includes('parkwhiz')) {
        if (!link) return null;
        if (
            url === 'https://www.parkwhiz.com' ||
            url === 'https://parkwhiz.com' ||
            url.includes('/airport-parking') ||
            url.includes('/search')
        ) {
            return null;
        }
        if (lot.trustStatus !== 'live' && lot.trustStatus !== 'verified-source') return null;
    }

    return link;
}

function parkingLotTransferText(lot: ParkingOption): string {
    if (lot.transferType === 'shuttle') {
        const minutes = lot.shuttleMinutes ?? lot.transferToTerminalMinutes;
        return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
            ? `Shuttle ${minutes} min`
            : 'Shuttle time not confirmed';
    }

    if (lot.transferType === 'airport-garage') return 'Airport garage';

    const minutes = lot.walkingMinutes ?? lot.transferToTerminalMinutes;
    return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
        ? `Walk ${minutes} min`
        : 'Walk time not confirmed';
}

async function geocodeAddress(query: string): Promise<google.maps.LatLngLiteral | null> {
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({ address: query });
    const location = result.results?.[0]?.geometry?.location;
    if (!location) return null;

    return {
        lat: location.lat(),
        lng: location.lng(),
    };
}

async function geocodeParkingLot(
    lot: ParkingOption,
    airportLabel: string
): Promise<google.maps.LatLngLiteral | null> {
    const coordinates = parkingLotCoordinates(lot);
    if (coordinates) return coordinates;

    const query =
        lot.address ||
        lot.normalizedAddress ||
        lot.routeDestination ||
        `${lot.name} near ${airportLabel}`;

    return geocodeAddress(query);
}

function buildPrimaryMapTarget({
    airport,
    destinationLatLng,
    destinationLabel,
    parkingOptions,
    selectedParkingId,
}: {
    airport: ReturnType<typeof getAirportById> | null;
    destinationLatLng?: google.maps.LatLngLiteral | null;
    destinationLabel?: string | null;
    parkingOptions: ParkingOption[];
    selectedParkingId?: string | null;
}): ParkingMapTarget {
    const selectedLot = selectedParkingId
        ? parkingOptions.find((lot) => lot.id === selectedParkingId)
        : null;
    const selectedTarget = selectedLot ? parkingLotMapTarget(selectedLot) : null;
    if (selectedTarget) return selectedTarget;

    if (destinationLatLng) {
        return mapTargetFromQuery(destinationLabel || 'Destination', coordinateQuery(destinationLatLng));
    }

    if (destinationLabel?.trim()) {
        return mapTargetFromQuery(destinationLabel.trim(), destinationLabel.trim());
    }

    if (airport?.geoLocation) {
        return mapTargetFromQuery(airport.label || `${airport.id} airport`, coordinateQuery(airport.geoLocation));
    }

    const firstLotTarget = parkingOptions.map(parkingLotMapTarget).find(
        (target): target is ParkingMapTarget => Boolean(target)
    );
    if (firstLotTarget) return firstLotTarget;

    return mapTargetFromQuery('Parking nearby', 'parking nearby');
}

export default function ParkingLotsMap({
    airportCode,
    originAddress,
    destinationLatLng,
    destinationLabel,
    parkingOptions,
    selectedParkingId,
    onSelectParking,
}: {
    airportCode?: string;
    originAddress?: string | null;
    destinationLatLng?: google.maps.LatLngLiteral | null;
    destinationLabel?: string | null;
    parkingOptions: ParkingOption[];
    selectedParkingId?: string | null;
    onSelectParking?: (id: string) => void;
}) {
    const mapRef = useRef<HTMLDivElement | null>(null);
    const [mapErrorReason, setMapErrorReason] = useState<ParkingMapDiagnosticReason | null>(null);
    const airport = airportCode ? getAirportById(airportCode) || getAirportById('SEA') : null;
    const primaryMapTarget = buildPrimaryMapTarget({
        airport,
        destinationLatLng,
        destinationLabel,
        parkingOptions,
        selectedParkingId,
    });

    useEffect(() => {
        let cancelled = false;
        let resizeObserver: ResizeObserver | null = null;
        const unsubscribeLoadFailure = onGoogleMapsLoadFailure((error) => {
            if (cancelled) return;
            warnParkingMapIssue('google-maps-auth-failed', error);
            setMapErrorReason('google-maps-auth-failed');
        });

        async function initMap() {
            setMapErrorReason(null);
            const fallbackCenter =
                parkingOptions.map(parkingLotCoordinates).find(
                    (coordinates): coordinates is google.maps.LatLngLiteral => coordinates !== null
                );
            const mapCenter = airport?.geoLocation ??
                destinationLatLng ??
                fallbackCenter ??
                null;
            if (!mapCenter || !mapRef.current) {
                warnParkingMapIssue('missing-map-center');
                setMapErrorReason('missing-map-center');
                return;
            }

            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
            if (!apiKey) {
                warnParkingMapIssue('missing-browser-key');
                setMapErrorReason('missing-browser-key');
                return;
            }

            await waitForMapContainerPaint();
            if (cancelled || !mapRef.current) return;

            await loadGoogleMaps(apiKey);
            if (cancelled || !mapRef.current) return;

            const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
            const { AdvancedMarkerElement, PinElement } =
                (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;

            const map = new Map(mapRef.current, {
                center: mapCenter,
                zoom: 11,
                mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
                mapTypeId: 'roadmap',
                gestureHandling: 'greedy',
            });

            const bounds = new google.maps.LatLngBounds();
            bounds.extend(mapCenter);

            if (airport) {
                const airportPin = new PinElement({
                    glyphText: 'A',
                    background: '#2563eb',
                    borderColor: '#1e3a8a',
                    glyphColor: '#ffffff',
                });

                new AdvancedMarkerElement({
                    map,
                    position: airport.geoLocation,
                    title: `${airport.id} airport`,
                    content: airportPin,
                });
            } else if (destinationLatLng) {
                const destinationPin = new PinElement({
                    glyphText: 'D',
                    background: '#2563eb',
                    borderColor: '#1e3a8a',
                    glyphColor: '#ffffff',
                });

                new AdvancedMarkerElement({
                    map,
                    position: destinationLatLng,
                    title: destinationLabel || 'Destination',
                    content: destinationPin,
                });
            }

            if (originAddress?.trim()) {
                const originPosition = await geocodeAddress(originAddress.trim());
                if (originPosition) {
                    bounds.extend(originPosition);

                    const originPin = new PinElement({
                        glyphText: '●',
                        background: '#0f766e',
                        borderColor: '#134e4a',
                        glyphColor: '#ffffff',
                    });

                    new AdvancedMarkerElement({
                        map,
                        position: originPosition,
                        title: `Your origin: ${originAddress}`,
                        content: originPin,
                    });
                }
            }

            const mapLotLimit = Number(process.env.NEXT_PUBLIC_PARKING_MAP_MAX_LOTS || 50);

            const lotsWithPositions = await Promise.all(
                parkingOptions.slice(0, mapLotLimit).map(async (lot) => {
                    const position = await geocodeParkingLot(lot, airport?.label || 'destination');
                    return position ? { lot, position } : null;
                })
            );

            const validLots = lotsWithPositions.filter(
                (x): x is { lot: ParkingOption; position: google.maps.LatLngLiteral } => x !== null
            );

            const fitMapToContent = () => {
                if (validLots.length > 0) {
                    map.fitBounds(bounds, 56);

                    google.maps.event.addListenerOnce(map, 'idle', () => {
                        const zoom = map.getZoom() ?? 11;
                        if (zoom > 13) map.setZoom(13);
                        if (zoom < 9) map.setZoom(9);
                    });
                } else {
                    map.setCenter(mapCenter);
                    map.setZoom(11);
                }
            };

            validLots.forEach(({ lot, position }, index) => {
                bounds.extend(position);

                const pin = new PinElement({
                    glyphText: String(index + 1),
                    background:
                        lot.availabilityStatus === 'available'
                            ? '#16a34a'
                            : lot.availabilityStatus === 'unavailable'
                                ? '#dc2626'
                                : '#f59e0b',
                    borderColor: '#18181b',
                    glyphColor: '#ffffff',
                });

                const marker = new AdvancedMarkerElement({
                    map,
                    position,
                    title: lot.name,
                    content: pin,
                });

                const availabilityLabel =
                    lot.availabilityStatus === 'available'
                        ? 'Available'
                        : lot.availabilityStatus === 'unavailable'
                            ? 'Unavailable'
                            : null;

                const transferText = parkingLotTransferText(lot);
                const trustedSourceLink = trustedParkingSourceLink(lot);

                const info = new google.maps.InfoWindow({
                    content: `
            <div style="
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              width: 220px;
              margin-top: -6px;
              padding: 8px 0 4px;
              color: #18181b;
              text-align: center;
            ">
              <div style="
                font-size: 14px;
                font-weight: 700;
                line-height: 1.25;
                margin: 0 0 6px 0;
              ">
                ${lot.name}
              </div>

              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; justify-content: center;">
        <span style="
          background: #f4f4f5;
          color: #3f3f46;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 600;
        ">
          ${transferText}
        </span>

        ${availabilityLabel
                            ? `<span style="
                background: ${lot.availabilityStatus === 'available' ? '#ecfdf5' : '#fef2f2'};
                color: ${lot.availabilityStatus === 'available' ? '#047857' : '#b91c1c'};
                border-radius: 999px;
                padding: 4px 8px;
                font-size: 12px;
                font-weight: 600;
              ">${availabilityLabel}</span>`
                            : ''
                        }
      </div>

      ${trustedSourceLink
                            ? `<a
      href="${trustedSourceLink}"
      target="_blank"
      rel="noopener noreferrer"
      style="
        display: block;
        margin-top: 8px;
        text-align: center;
        background: #2563eb;
        color: white;
        text-decoration: none;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        font-weight: 700;
      "
    >
      View listing
    </a>`
                            : ''
                        }
    </div>
  `,
                });

                marker.addListener('gmp-click', () => {
                    info.open({ map, anchor: marker });
                    onSelectParking?.(lot.id);

                    document.getElementById(`parking-card-${lot.id}`)?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                });

                if (selectedParkingId === lot.id) {
                    info.open({ map, anchor: marker });
                }
            });

            fitMapToContent();

            const resizeAndRecenter = () => {
                if (cancelled) return;
                google.maps.event.trigger(map, 'resize');
                fitMapToContent();
            };

            window.setTimeout(resizeAndRecenter, 0);
            window.requestAnimationFrame?.(() => resizeAndRecenter());

            if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
                resizeObserver = new ResizeObserver(() => resizeAndRecenter());
                resizeObserver.observe(mapRef.current);
            }
        }

        initMap().catch((error) => {
            if (cancelled) return;
            const reason =
                error instanceof Error && /authentication|referrer/i.test(error.message)
                    ? 'google-maps-auth-failed'
                    : 'google-maps-load-failed';
            warnParkingMapIssue(reason, error);
            setMapErrorReason(reason);
        });

        return () => {
            cancelled = true;
            unsubscribeLoadFailure();
            resizeObserver?.disconnect();
        };
    }, [airport, destinationLatLng, originAddress, parkingOptions, onSelectParking, selectedParkingId]);

    if (mapErrorReason) {
        const visibleParkingOptions = parkingOptions.slice(0, 20);

        return (
            <div
                data-testid="parking-lots-map-fallback"
                className="flex h-[min(68dvh,620px)] min-h-[360px] w-full flex-col bg-zinc-50 p-5 sm:h-full sm:min-h-[520px]"
            >
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <div className="font-semibold">{MAP_FALLBACK_MESSAGE}</div>
                    <div className="mt-1">
                        Your parking list still works below — tap any lot to open it in Google Maps.
                    </div>
                    <a
                        href={primaryMapTarget.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center justify-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    >
                        Open in Google Maps
                    </a>
                </div>
                <div className="mt-4 flex-1 overflow-auto">
                    <div className="space-y-2">
                        {visibleParkingOptions.map((lot, index) => {
                            const lotTarget = parkingLotMapTarget(lot);

                            return (
                            <div
                                key={lot.id || `${lot.name}-${index}`}
                                className="flex gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-sm"
                            >
                                <button
                                    type="button"
                                    onClick={() => onSelectParking?.(lot.id)}
                                    className="min-w-0 flex-1 text-left hover:text-zinc-700"
                                >
                                    <div className="font-semibold text-zinc-900">{index + 1}. {lot.name}</div>
                                    <div className="mt-1 text-xs text-zinc-600">
                                        {lot.address || lot.normalizedAddress || lot.routeDestination || 'Address unavailable'}
                                    </div>
                                </button>
                                {lotTarget ? (
                                    <a
                                        href={lotTarget.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 self-center rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                    >
                                        Open
                                    </a>
                                ) : null}
                            </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            data-testid="parking-lots-map-shell"
            className="relative h-[min(68dvh,620px)] min-h-[360px] w-full sm:h-full sm:min-h-[520px]"
        >
            <div
                ref={mapRef}
                data-testid="parking-lots-map-container"
                className="h-full min-h-[360px] w-full sm:min-h-[520px]"
            />
            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-zinc-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">
                {airportCode ? 'Airport · ' : destinationLatLng ? 'Destination · ' : ''}Origin · numbered lots
            </div>
        </div>
    );
}
