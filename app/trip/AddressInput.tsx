'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

type Prediction = {
  description: string;
  place_id: string;
};

type AutocompleteApiResponse = {
  predictions?: unknown;
  error?: string;
  message?: string;
};

type GeocoderResult = {
  formatted_address: string;
};

type AutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

type AutocompleteSuggestionApi = {
  fetchAutocompleteSuggestions: (request: {
    input: string;
  }) => Promise<{ suggestions?: AutocompleteSuggestion[] }>;
};

type PlacesLibrary = {
  AutocompleteSuggestion?: AutocompleteSuggestionApi;
  AutocompleteService?: new () => {
    getPlacePredictions: (
      request: {
        input: string;
        componentRestrictions?: { country: string };
      },
      callback: (predictions: Prediction[] | null, status: string) => void
    ) => void;
  };
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

function normalizePrediction(value: unknown): Prediction | null {
  if (!value || typeof value !== 'object') return null;

  const maybePrediction = value as Partial<Prediction>;
  const description =
    typeof maybePrediction.description === 'string' ? maybePrediction.description.trim() : '';
  const placeId =
    typeof maybePrediction.place_id === 'string' ? maybePrediction.place_id.trim() : description;

  if (!description) return null;

  return {
    description,
    place_id: placeId || description,
  };
}

async function fetchServerAutocomplete(
  input: string,
  signal: AbortSignal
): Promise<Prediction[]> {
  const response = await fetch(
    `/api/geocode/autocomplete?input=${encodeURIComponent(input)}`,
    { signal }
  );

  let data: AutocompleteApiResponse | null = null;

  try {
    data = (await response.json()) as AutocompleteApiResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.warn(
      'Address autocomplete API unavailable:',
      data?.error || data?.message || `HTTP ${response.status}`,
    );
    return [];
  }

  if (!Array.isArray(data?.predictions)) return [];

  return data.predictions
    .map(normalizePrediction)
    .filter((prediction): prediction is Prediction => Boolean(prediction));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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
        AutocompleteSuggestion?: AutocompleteSuggestionApi;
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
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [hasTouchedInput, setHasTouchedInput] = useState(false);

  const [recentOrigins, setRecentOrigins] = useState<string[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRecentOrigins(getRecentOrigins());
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const autocompleteSuggestion = useRef<AutocompleteSuggestionApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUseGeo = typeof navigator !== 'undefined' && !!navigator.geolocation;
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const browserApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Load Google Maps JS Places Library as an optional browser fallback.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!browserApiKey) return;

    let cancelled = false;

    async function initPlaces() {
      await loadGoogleMaps(browserApiKey!);

      if (cancelled) return;

      const places = window.google?.maps?.places as PlacesLibrary | undefined;

      if (
        places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions &&
        !autocompleteSuggestion.current
      ) {
        autocompleteSuggestion.current = places.AutocompleteSuggestion;
      }
    }

    initPlaces().catch(() => {
      console.warn('Failed to load Google Maps Places browser fallback');
    });

    return () => {
      cancelled = true;
    };
  }, [browserApiKey]);

  // Fetch predictions based on input value, debounce to avoid noisy Google requests.
  useEffect(() => {
    if (!hasTouchedInput) return;

    const query = inputValue.trim();

    if (query.length < 3) {
      setLoadingPredictions(false);
      setPredictionError(null);
      const t = setTimeout(() => setPredictions([]), 0);
      return () => clearTimeout(t);
    }

    setLoadingPredictions(true);
    setPredictionError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      const applyPredictions = (nextPredictions: Prediction[]) => {
        setPredictions(nextPredictions);
        setIsOpen(true);
        setHighlightedIndex(-1);
        setLoadingPredictions(false);
        setPredictionError(null);
      };

      const runLegacyAutocomplete = (): Promise<Prediction[]> =>
        new Promise((resolve) => {
          const places = window.google?.maps?.places as PlacesLibrary | undefined;

          if (!places?.AutocompleteService) {
            resolve([]);
            return;
          }

          const service = new places.AutocompleteService();

          service.getPlacePredictions(
            {
              input: query,
              componentRestrictions: { country: 'us' },
            },
            (results) => {
              resolve(
                (results || []).map((p) => ({
                  description: p.description,
                  place_id: p.place_id,
                }))
              );
            }
          );
        });

      const fetchBrowserAutocomplete = async (): Promise<Prediction[]> => {
        const suggestionApi = autocompleteSuggestion.current;

        if (suggestionApi) {
          try {
            const { suggestions = [] } = await suggestionApi.fetchAutocompleteSuggestions({
              input: query,
            });
            const nextPredictions = suggestions
              .map((suggestion) => {
                const prediction = suggestion.placePrediction;
                const primary = prediction?.structuredFormat?.mainText?.text;
                const secondary = prediction?.structuredFormat?.secondaryText?.text;
                const description =
                  prediction?.text?.text ||
                  [primary, secondary].filter(Boolean).join(', ');

                if (!description) return null;

                return {
                  description,
                  place_id: prediction?.placeId || description,
                };
              })
              .filter((prediction): prediction is Prediction => Boolean(prediction));

            if (nextPredictions.length > 0) return nextPredictions;
          } catch {
            // Fall through to the legacy browser autocomplete service.
          }
        }

        return runLegacyAutocomplete();
      };

      const runAutocomplete = async () => {
        let serverError: unknown = null;

        try {
          const serverPredictions = await fetchServerAutocomplete(query, controller.signal);

          if (controller.signal.aborted) return;

          if (serverPredictions.length > 0) {
            applyPredictions(serverPredictions);
            return;
          }
        } catch (error) {
          if (isAbortError(error)) return;

          serverError = error;
          console.warn('Address autocomplete API failed', error);
        }

        try {
          const browserPredictions = await fetchBrowserAutocomplete();

          if (controller.signal.aborted) return;

          if (browserPredictions.length > 0) {
            applyPredictions(browserPredictions);
            return;
          }
        } catch (error) {
          if (isAbortError(error)) return;

          console.warn('Google Maps browser autocomplete failed', error);
        }

        if (controller.signal.aborted) return;

        setPredictions([]);
        setIsOpen(true);
        setHighlightedIndex(-1);
        setLoadingPredictions(false);

        if (serverError) {
          setPredictionError('Unable to load suggestions. Try again in a moment.');
        } else {
          setPredictionError(null);
        }
      };

      runAutocomplete().catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;

        console.warn('Address autocomplete failed unexpectedly', error);
        setPredictions([]);
        setIsOpen(false);
        setLoadingPredictions(false);
        setPredictionError('Unable to load suggestions. You can keep typing your address.');
      });
    }, 250);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [inputValue, hasTouchedInput]);

  const onSelectPrediction = (prediction: Prediction) => {
    setInputValue(prediction.description);
    setIsOpen(false);
    setPredictionError(null);
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
    setPredictionError(null);
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
    setPredictionError(null);
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

      let resolvedAddress = '';

      try {
        const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lon}`);

        if (res.ok) {
          const data = await res.json();
          resolvedAddress = data.formattedAddress || '';
        }
      } catch {
        resolvedAddress = '';
      }

      const displayLabel = resolvedAddress || 'Current location';

      onChange(displayLabel);
      setInputValue(displayLabel);
      saveRecentOrigin(displayLabel);
      setRecentOrigins(getRecentOrigins());
      setIsLocating(false);
      setIsOpen(false);
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
    setPredictionError(null);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2 relative">
      <div className="flex flex-col gap-2 min-[390px]:flex-row min-[390px]:items-end min-[390px]:justify-between min-[390px]:gap-3">
        <label className="block text-sm font-semibold text-slate-800">{label}</label>
        <button
          type="button"
          onClick={detectLocation}
          disabled={isLocating}
          className="inline-flex w-fit items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-sky-100 hover:text-blue-800 disabled:opacity-50"
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
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />

      {isOpen && inputValue.trim().length >= 3 && (
        <div
          id="address-suggestion-list"
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
        >
          {loadingPredictions && (
            <div className="px-4 py-3 text-sm text-zinc-600">Searching…</div>
          )}

          {!loadingPredictions && predictionError && (
            <div className="px-4 py-3 text-sm text-red-700">{predictionError}</div>
          )}

          {!loadingPredictions && !predictionError && predictions.length === 0 && inputValue.trim().length >= 3 && (
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

      {recentOrigins.length > 0 && !isOpen && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Recent origins</div>
          <ul className="flex flex-wrap gap-2">
            {recentOrigins.map((origin) => (
              <li key={origin}>
                <button
                  type="button"
                  onClick={() => onRecentClick(origin)}
                  className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-sky-50"
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
