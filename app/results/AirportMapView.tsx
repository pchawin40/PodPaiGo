'use client';

import { useMemo, useState } from 'react';
import { getAirportById } from '../../lib/airports/catalog';
import { ParkingOption, TripData } from '../../lib/types';

type MapMode = 'parking' | 'inside';

export default function AirportMapView({
  airportCode = 'SEA',
  parkingOptions,
  tripData,
}: {
  airportCode?: string;
  parkingOptions: ParkingOption[];
  tripData: TripData | null;
}) {
  const [mode, setMode] = useState<MapMode>('parking');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const airport = getAirportById(airportCode) || getAirportById('SEA');
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;

  const topLots = useMemo(() => parkingOptions.slice(0, 6), [parkingOptions]);
  const selected = topLots.find(p => p.id === selectedId) || topLots[0];

  if (!airport) return null;

  const origin = tripData?.origin || airport.routingAddress;

  const build = () => {
    if (!key) return null;

    if (mode === 'inside') {
      return `https://www.google.com/maps/embed/v1/search?key=${key}&q=${airport.id}+airport+tsa+checkin+lounges`;
    }

    if (selected) {
      return `https://www.google.com/maps/embed/v1/directions?key=${key}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(selected.routeDestination || selected.name)}`;
    }

    return `https://www.google.com/maps/embed/v1/search?key=${key}&q=${airport.id}+airport+parking`;
  };

  const fallback =
    mode === 'inside'
      ? `https://www.google.com/maps/search/?api=1&query=${airport.id}+airport+tsa+checkin+lounges`
      : selected
        ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(selected.routeDestination || selected.name)}`
        : `https://www.google.com/maps/search/?api=1&query=${airport.id}+airport+parking`;

  return (
    <div className="rounded-2xl border p-4 bg-white">
      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('parking')}
          className={mode === 'parking' ? 'bg-blue-600 text-white px-3 py-1 rounded' : 'px-3 py-1'}
        >
          Parking
        </button>
        <button
          onClick={() => setMode('inside')}
          className={mode === 'inside' ? 'bg-blue-600 text-white px-3 py-1 rounded' : 'px-3 py-1'}
        >
          Airport
        </button>
      </div>

      {/* Parking selector */}
      {mode === 'parking' && (
        <div className="flex gap-2 overflow-x-auto mb-3">
          {topLots.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`min-w-[180px] border rounded p-2 text-left ${
                selected?.id === p.id ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <div className="font-semibold text-sm">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.price ? `$${p.price}/day` : 'Check price'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      {build() ? (
        <iframe
          src={build()!}
          width="100%"
          height="400"
          loading="lazy"
          className="rounded-xl"
        />
      ) : (
        <a href={fallback} target="_blank" className="text-blue-600">
          Open map
        </a>
      )}
    </div>
  );
}