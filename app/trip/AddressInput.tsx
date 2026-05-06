'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

type Prediction = {
  description: string;
  place_id: string;
};

type GeocoderResult = {
  formatted_address: string;
};

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

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface GoogleMapsWindow {
  google?: {
    maps?: {
      places?: {
        AutocompleteService: new () => {
          getPlacePredictions: (
            request: { input: string },
            callback: (results: Prediction[] | null) => void
          ) => void;
        };
      };
      Geocoder: new () => {
        geocode: (
          request: { location: { lat: number; lng: number } },
          callback: (results: GeocoderResult[], status: string) => void
        ) => void;
      };
    };
  };
}

declare const window: Window & GoogleMapsWindow;

export function AddressInput({ label, value, onChange, placeholder }: Props) {
  const [inputValue, setInputValue] = useState(value || '');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [hasTouchedInput, setHasTouchedInput] = useState(false);

  const [recentOrigins, setRecentOrigins] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : getRecentOrigins()
  );

  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  type AutocompleteServiceType = {
    getPlacePredictions: (
      request: { input: string },
      callback: (results: Prediction[] | null) => void
    ) => void;
  };

  const autocompleteService = useRef<AutocompleteServiceType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUseGeo = typeof navigator !== 'undefined' && !!navigator.geolocation;
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY;
  const apiKeyPresent = Boolean(apiKey);

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Load Google Maps JS Places Library if not loaded and apiKey present
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!apiKey) return;

    let cancelled = false;

    async function initPlaces() {
      await loadGoogleMaps(apiKey!);

      if (cancelled) return;

      const places = window.google?.maps?.places as any;

      if (places && !autocompleteService.current) {
        autocompleteService.current =
          places.AutocompleteSuggestion
            ? new places.AutocompleteSuggestion()
            : new places.AutocompleteService();
      }
    }

    initPlaces().catch(() => {
      console.error('Failed to load Google Maps Places');
    });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Fetch predictions based on input value, debounce to avoid setState in effect
  useEffect(() => {
    if (!hasTouchedInput) return;

    if (!autocompleteService.current || !apiKeyPresent || inputValue.trim().length < 3) {
      setLoadingPredictions(false);
      // Delay clearing suggestions in next tick to avoid hook conflicts
      const t = setTimeout(() => setPredictions([]), 0);
      return () => clearTimeout(t);
    }

    setLoadingPredictions(true);
    const request = {
      input: inputValue,
      // No types restrictions, Google deprecated types: ['address', etc.]
    };

    // Wrap callback in async timeout to avoid setState in effect directly
    const timeoutId = setTimeout(() => {
      autocompleteService.current?.getPlacePredictions(request, (results: Prediction[] | null) => {
        setLoadingPredictions(false);
        if (!results) {
          setPredictions([]);
          return;
        }
        setPredictions(results);
        setIsOpen(true);
        setHighlightedIndex(-1);
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [inputValue, apiKeyPresent, hasTouchedInput]);

  const onSelectPrediction = (prediction: Prediction) => {
    setInputValue(prediction.description);
    setIsOpen(false);
    onChange(prediction.description);
    saveRecentOrigin(prediction.description);
    setRecentOrigins(getRecentOrigins());
    setHighlightedIndex(-1);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasTouchedInput(true);
    setInputValue(e.target.value);
    onChange(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || predictions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((idx) => (idx < predictions.length - 1 ? idx + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((idx) => (idx > 0 ? idx - 1 : predictions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < predictions.length) {
        e.preventDefault();
        onSelectPrediction(predictions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

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

      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng: lon } }, (results: GeocoderResult[], status: string) => {
          if (status === 'OK' && results[0]) {
            onChange(results[0].formatted_address);
            setInputValue(results[0].formatted_address);
            saveRecentOrigin(results[0].formatted_address);
            setRecentOrigins(getRecentOrigins());
          } else {
            onChange(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            setInputValue(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
          }
          setIsLocating(false);
          setIsOpen(false);
        });
      } else {
        onChange(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        setInputValue(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        saveRecentOrigin(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        setRecentOrigins(getRecentOrigins());
        setIsLocating(false);
        setIsOpen(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to get location';
      setLocateError(message);
      setIsLocating(false);
    }
  };

  // Click recent origin entry
  const onRecentClick = (value: string) => {
    onChange(value);
    setInputValue(value);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2 relative">
      <div className="flex items-end justify-between gap-3">
        <label className="block text-sm font-medium text-zinc-800">{label}</label>
        <button
          type="button"
          onClick={detectLocation}
          disabled={isLocating}
          className="text-sm text-blue-700 hover:text-blue-800 disabled:opacity-50"
        >
          {isLocating ? 'Detecting…' : 'Use current location'}
        </button>
      </div>

      <input
        type="text"
        ref={inputRef}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="address-suggestion-list"
        aria-autocomplete="list"
        aria-activedescendant={
          highlightedIndex >= 0 ? `prediction-${predictions[highlightedIndex].place_id}` : undefined
        }
        value={inputValue}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setHasTouchedInput(true);
          setIsOpen(true);
        }}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />

      {isOpen && inputValue.trim().length >= 3 && (
        <div
          id="address-suggestion-list"
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
        >
          {loadingPredictions && (
            <div className="px-4 py-3 text-sm text-zinc-600">Searching…</div>
          )}

          {!loadingPredictions && predictions.length === 0 && inputValue.trim().length >= 3 && (
            <div className="px-4 py-3 text-sm text-zinc-600">No matches found</div>
          )}

          {!loadingPredictions && predictions.map((prediction, idx) => {
            const selected = idx === highlightedIndex;
            return (
              <div
                aria-selected={selected}
                id={`prediction-${prediction.place_id}`}
                key={prediction.place_id}
                role="option"
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => onSelectPrediction(prediction)}
                tabIndex={-1}
                className={`cursor-pointer px-4 py-3 text-sm ${selected ? 'bg-blue-600 text-white' : 'text-zinc-900 hover:bg-zinc-100'
                  }`}
              >
                {prediction.description}
              </div>
            );
          })}
        </div>
      )}

      {hasMounted && recentOrigins.length > 0 && !isOpen && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 mt-2">
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

      {locateError && <p className="text-xs text-red-600 mt-1">{locateError}</p>}

      <p className="text-xs text-zinc-500 mt-1">Tip: start typing an address, or use your current location.</p>
    </div>
  );
}