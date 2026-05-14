/// <reference types="google.maps" />
'use client';

import { useEffect, useRef } from 'react';
import { ParkingOption } from '../../lib/types';
import { getAirportById } from '../../lib/airports/catalog';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';

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

async function geocodeParkingLot(
    lot: ParkingOption,
    airportLabel: string
): Promise<google.maps.LatLngLiteral | null> {
    if (typeof lot.lat === 'number' && typeof lot.lng === 'number') {
        return { lat: lot.lat, lng: lot.lng };
    }

    const geocoder = new google.maps.Geocoder();

    const query =
        lot.address ||
        lot.normalizedAddress ||
        lot.routeDestination ||
        `${lot.name} near ${airportLabel}`;

    const result = await geocoder.geocode({ address: query });

    const location = result.results?.[0]?.geometry?.location;
    if (!location) return null;

    return {
        lat: location.lat(),
        lng: location.lng(),
    };
}
export default function ParkingLotsMap({
    airportCode = 'SEA',
    parkingOptions,
    selectedParkingId,
    onSelectParking,
}: {
    airportCode?: string;
    parkingOptions: ParkingOption[];
    selectedParkingId?: string | null;
    onSelectParking?: (id: string) => void;
}) {
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        async function initMap() {
            const airport = getAirportById(airportCode) || getAirportById('SEA');
            if (!airport || !mapRef.current) return;

            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
            if (!apiKey) return;

            await loadGoogleMaps(apiKey);

            const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
            const { AdvancedMarkerElement, PinElement } =
                (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;


            const map = new Map(mapRef.current, {
                center: airport.geoLocation,
                zoom: 12,
                mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
                mapTypeId: 'roadmap',
            });

            const bounds = new google.maps.LatLngBounds();
            bounds.extend(airport.geoLocation);

            const lotsWithPositions = await Promise.all(
                parkingOptions.slice(0, 20).map(async (lot) => {
                    const position = await geocodeParkingLot(lot, airport.label);
                    return position ? { lot, position } : null;
                })
            );

            const validLots = lotsWithPositions.filter(
                (x): x is { lot: ParkingOption; position: google.maps.LatLngLiteral } => x !== null
            );

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

                const transferText =
                    lot.transferType === 'shuttle'
                        ? `Shuttle ${lot.shuttleMinutes ?? lot.transferToTerminalMinutes ?? 12} min`
                        : lot.transferType === 'airport-garage'
                            ? 'Airport garage'
                            : `Walk ${lot.walkingMinutes ?? lot.transferToTerminalMinutes ?? 5} min`;
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
      Check / book
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
            });

            if (validLots.length > 0) {
                map.fitBounds(bounds);

                google.maps.event.addListenerOnce(map, 'idle', () => {
                    if ((map.getZoom() ?? 12) > 14) map.setZoom(14);
                });
            } else {
                map.setCenter(airport.geoLocation);
                map.setZoom(12);
            }
        }

        initMap().catch((error) => {
            console.error('Failed to initialize parking map:', error);
        });
    }, [airportCode, parkingOptions, onSelectParking]);

    return <div ref={mapRef} className="h-full min-h-[520px] w-full" />;
}
