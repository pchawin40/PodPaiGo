'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type AddressSuggestion = {
  displayName: string;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

async function reverseGeocode(lat: number, lon: number, signal: AbortSignal): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      signal,
      headers: {
        // Nominatim requires an identifying header.
        // (In a real production app, proxy through your own backend.)
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name || null;
  } catch {
    return null;
  }
}

async function searchAddresses(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{ display_name?: string }>;
    return data
      .map((d) => d.display_name)
      .filter(Boolean)
      .map((displayName) => ({ displayName: displayName as string }));
  } catch {
    return [];
  }
}

export function AddressInput({
  label,
  value,
  onChange,
  placeholder,
  autoDetectOnMount = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoDetectOnMount?: boolean;
}) {
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const [query, setQuery] = useState(value);
  const debouncedQuery = useDebouncedValue(query, 250);

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  // Keep internal query in sync with external value changes.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const canUseGeo = useMemo(() => typeof navigator !== 'undefined' && !!navigator.geolocation, []);

  const detectLocation = async () => {
    if (!canUseGeo) {
      setLocateError('Geolocation not supported in this browser');
      return;
    }

    setLocateError(null);
    setIsLocating(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 60_000,
        });
      });

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const readable = await reverseGeocode(lat, lon, abortRef.current.signal);

      onChange(readable || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      setIsOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to get location';
      setLocateError(message);
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    // Auto-detect on first mount if requested and the field is blank.
    if (!autoDetectOnMount) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    if (!value) {
      // Fire and forget.
      detectLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetectOnMount]);

  useEffect(() => {
    abortRef.current?.abort();

    if (debouncedQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    searchAddresses(debouncedQuery, controller.signal).then((res) => {
      setSuggestions(res);
    });

    return () => controller.abort();
  }, [debouncedQuery]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <label className="block text-sm font-medium text-zinc-800">
          {label}
        </label>

        <button
          type="button"
          onClick={detectLocation}
          disabled={isLocating || !canUseGeo}
          className="text-sm text-blue-700 hover:text-blue-800 disabled:opacity-50"
        >
          {isLocating ? 'Detecting…' : 'Use current location'}
        </button>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            onChange(next);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Allow click selection.
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none ring-0 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        {isOpen && suggestions.length > 0 && (
          <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.displayName}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.displayName);
                  setQuery(s.displayName);
                  setIsOpen(false);
                }}
                className="block w-full px-4 py-3 text-left text-sm text-zinc-800 hover:bg-zinc-50"
              >
                {s.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {locateError && (
        <p className="text-xs text-zinc-500">
          {locateError}
        </p>
      )}

      <p className="text-xs text-zinc-500">
        Tip: start typing an address, or use your current location.
      </p>
    </div>
  );
}
