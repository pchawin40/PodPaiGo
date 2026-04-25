'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

type AddressSuggestion = {
  displayName: string;
};

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

const LOCAL_STORAGE_KEY = 'podpaigo-recent-origins';
const MAX_RECENTS = 5;

function getRecentOrigins(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentOrigin(origin: string) {
  if (typeof window === 'undefined') return;
  if (!origin || origin.trim().length < 5) return;
  try {
    const recents = getRecentOrigins();
    const newRecents = [origin.trim(), ...recents.filter((r) => r !== origin.trim())];
    if (newRecents.length > MAX_RECENTS) newRecents.splice(MAX_RECENTS);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newRecents));
  } catch {
    // ignore
  }
}

export function AddressInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Initialize query directly from prop
  const [query, setQuery] = useState(value || '');

  // recent origins initialized lazily
  const [recentOrigins, setRecentOrigins] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : getRecentOrigins()
  );

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // keyboard navigation index, -1 means no selection
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);

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
      // Save to recent origins
      if (readable) {
        saveRecentOrigin(readable);
        setRecentOrigins(getRecentOrigins());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to get location';
      setLocateError(message);
    } finally {
      setIsLocating(false);
    }
  };

  // Debounced query effect for address suggestions
  useEffect(() => {
    abortRef.current?.abort();

    if (query.trim().length < 3) {
      // Instead of clearing synchronously, clear in next tick
      const handle = setTimeout(() => {
        setSuggestions([]);
      }, 0);
      return () => clearTimeout(handle);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchSuggestions() {
      const res = await searchAddresses(query, controller.signal);
      setSuggestions(res);
      setIsOpen(true);
      setHighlightedIndex(-1);
    }

    fetchSuggestions();

    return () => controller.abort();
  }, [query]);

  // Keyboard navigation handler
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((hi) => Math.min(hi + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((hi) => Math.max(hi - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        const selected = suggestions[highlightedIndex];
        onChange(selected.displayName);
        setQuery(selected.displayName);
        setIsOpen(false);
        saveRecentOrigin(selected.displayName);
        setRecentOrigins(getRecentOrigins());
        setHighlightedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  // Click recent origin entry
  const onRecentClick = (value: string) => {
    onChange(value);
    setQuery(value);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <label className="block text-sm font-medium text-zinc-800">{label}</label>

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
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Allow click selection.
            window.setTimeout(() => setIsOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="address-suggestion-list"
          role="combobox"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        {isOpen && suggestions.length > 0 && (
          <ul
            id="address-suggestion-list"
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
          >
            {suggestions.map((s, idx) => {
              const selected = idx === highlightedIndex;
              return (
                <li
                  key={s.displayName}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(s.displayName);
                    setQuery(s.displayName);
                    setIsOpen(false);
                    saveRecentOrigin(s.displayName);
                    setRecentOrigins(getRecentOrigins());
                    setHighlightedIndex(-1);
                  }}
                  className={`cursor-pointer px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-100 ${
                    selected ? 'bg-blue-600 text-white' : ''
                  }`}
                  tabIndex={-1}
                >
                  {s.displayName}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {recentOrigins.length > 0 && !isOpen && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium text-zinc-700 mb-2">Recent origins</div>
          <ul className="flex flex-wrap gap-2">
            {recentOrigins.map((origin) => (
              <li key={origin}>
                <button
                  type="button"
                  onClick={() => onRecentClick(origin)}
                  className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs text-zinc-800 hover:bg-zinc-200"
                >
                  {origin}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {locateError && <p className="text-xs text-zinc-500">{locateError}</p>}

      <p className="text-xs text-zinc-500">
        Tip: start typing an address, or use your current location.
      </p>
    </div>
  );
}