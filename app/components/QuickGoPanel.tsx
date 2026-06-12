'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildTypedDestinationFallback,
  destinationSearchResultToSelection,
  formatDestinationSearchCategory,
  formatDestinationSearchSource,
  searchDestinations,
  type DestinationSearchResult,
} from '../../lib/search/destinationSearch';
import {
  QUICK_GO_EXAMPLE_DESTINATIONS,
  buildFullAirportPlannerPath,
  buildQuickGoResultsPath,
  detectAirportFromDestination,
  getRecentOrigins,
  rememberRecentOrigin,
  resolveGeolocationOrigin,
  type QuickGoPreference,
  type QuickGoDestinationSelection,
  type QuickGoOriginSelection,
  type QuickGoOriginSource,
  type QuickGoPurpose,
} from '../../lib/trip/quickGo';
import {
  getRecentDestinations,
  readSavedDestinations,
  rememberRecentDestination,
} from '../../lib/trip/savedDestinations';
import { trackEvent } from '../../lib/analytics/trackEvent';
import type { TransportAvailability } from '../../lib/types';
import PrimaryButton from './ui/PrimaryButton';
import StatusPill from './ui/StatusPill';
import ExpandableSection from './ui/ExpandableSection';

type QuickGoPanelProps = {
  className?: string;
};

const quickGoPurposes: Array<{ key: QuickGoPurpose; label: string }> = [
  { key: 'general-destination', label: 'Going somewhere' },
  { key: 'flying-out', label: 'Flying out' },
  { key: 'picking-up', label: 'Picking up' },
  { key: 'dropping-off', label: 'Dropping off' },
  { key: 'parking-trip', label: 'Parking trip' },
];

const quickGoPreferences: Array<{ key: QuickGoPreference; label: string }> = [
  { key: 'easiest', label: 'Easiest' },
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'fastest', label: 'Fastest' },
];

function buildManualOriginSelection(originText: string): QuickGoOriginSelection {
  const trimmed = originText.trim();
  return {
    origin: trimmed,
    originLabel: trimmed,
    originSource: 'manual',
  };
}

function buildSavedOriginSelection(originText: string): QuickGoOriginSelection {
  const trimmed = originText.trim();
  return {
    origin: trimmed,
    originLabel: trimmed,
    originSource: 'saved',
  };
}

function searchResultPlaceId(result: DestinationSearchResult): string | undefined {
  if (result.placeId) return result.placeId;
  const separatorIndex = result.id.indexOf(':');
  if (separatorIndex < 0) return undefined;
  const source = result.id.slice(0, separatorIndex);
  if (source !== 'google' && source !== 'geocoder') return undefined;
  return result.id.slice(separatorIndex + 1) || undefined;
}

function originSourceFromSearchResult(result: DestinationSearchResult): QuickGoOriginSource {
  if (result.source === 'typed') return 'manual';
  return result.source;
}

function destinationSearchResultToOriginSelection(
  result: DestinationSearchResult,
): QuickGoOriginSelection {
  const origin = (result.address || result.label).trim();
  const originLabel = result.label.trim() || origin;

  return {
    origin,
    originLabel,
    originSource: originSourceFromSearchResult(result),
    originLat: result.lat,
    originLng: result.lng,
    originPlaceId: searchResultPlaceId(result),
    originConfidence: result.confidence,
  };
}

function selectedOriginMatchesInput(
  originInputText: string,
  originSelection: QuickGoOriginSelection,
): boolean {
  const input = originInputText.trim().toLowerCase();
  if (!input) return true;
  return (
    input === originSelection.origin.trim().toLowerCase() ||
    input === originSelection.originLabel.trim().toLowerCase()
  );
}

function formatOriginSearchSource(source: DestinationSearchResult['source']): string {
  if (source === 'recent') return 'Recent origin';
  if (source === 'saved') return 'Saved place';
  return formatDestinationSearchSource(source);
}

function canUseGeolocationNow(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

function buildPendingGeolocationOriginSelection(): QuickGoOriginSelection {
  return {
    origin: 'Current location',
    originLabel: 'Current location',
    originSource: 'geolocation',
  };
}

function compactOriginLabel(
  originInputText: string,
  originSelection: QuickGoOriginSelection | null,
): string {
  const typedOrigin = originInputText.trim();
  if (typedOrigin) return typedOrigin;
  if (originSelection?.originSource === 'geolocation') return 'Current location';
  if (originSelection?.originSource === 'saved') return originSelection.originLabel;
  return 'Choose starting point';
}

function resolveAirportCode(
  destinationSelection: QuickGoDestinationSelection | null,
  destinationText: string,
): string | null {
  if (destinationSelection?.detectedAirportCode) {
    return destinationSelection.detectedAirportCode;
  }

  return detectAirportFromDestination(destinationText)?.id ?? null;
}

function localDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateFromLocalDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasFiniteDestinationCoords(selection: QuickGoDestinationSelection): boolean {
  return (
    typeof selection.destinationLat === 'number' &&
    Number.isFinite(selection.destinationLat) &&
    typeof selection.destinationLng === 'number' &&
    Number.isFinite(selection.destinationLng)
  );
}

/**
 * Autocomplete predictions carry a place_id but no coordinates. Resolve them to
 * a confirmed location before navigating so route timing and weather have
 * destination coordinates immediately, instead of relying on a server-side
 * geocode fallback. Returns the selection unchanged on any failure (the engine
 * still resolves coordinates from the propagated place_id as a backstop).
 */
async function ensureDestinationCoordinates(
  selection: QuickGoDestinationSelection,
): Promise<QuickGoDestinationSelection> {
  if (hasFiniteDestinationCoords(selection)) return selection;

  const placeId = selection.destinationPlaceId?.trim();
  if (!placeId) return selection;

  try {
    const response = await fetch(
      `/api/geocode/place?placeId=${encodeURIComponent(placeId)}`,
    );
    if (!response.ok) return selection;

    const data = (await response.json()) as {
      location?: { lat?: number; lng?: number } | null;
    };
    const lat = data.location?.lat;
    const lng = data.location?.lng;

    if (
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      typeof lng === 'number' &&
      Number.isFinite(lng)
    ) {
      return { ...selection, destinationLat: lat, destinationLng: lng };
    }
  } catch {
    // Ignore; fall back to the propagated place_id / server geocode.
  }

  return selection;
}

export default function QuickGoPanel({ className = '' }: QuickGoPanelProps) {
  const router = useRouter();
  const quickGoStartedTracked = useRef(false);

  useEffect(() => {
    if (quickGoStartedTracked.current) return;
    quickGoStartedTracked.current = true;
    trackEvent('quick_go_started');
  }, []);
  const [destinationText, setDestinationText] = useState('');
  const [destinationSelection, setDestinationSelection] =
    useState<QuickGoDestinationSelection | null>(null);
  const [destinationSuggestions, setDestinationSuggestions] = useState<DestinationSearchResult[]>(
    [],
  );
  const [destinationSearchOpen, setDestinationSearchOpen] = useState(false);
  const [destinationSearchLoading, setDestinationSearchLoading] = useState(false);
  const [destinationSearchError, setDestinationSearchError] = useState<string | null>(null);
  const [originInputText, setOriginInputText] = useState('');
  const [originSelection, setOriginSelection] = useState<QuickGoOriginSelection | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<DestinationSearchResult[]>([]);
  const [originSearchOpen, setOriginSearchOpen] = useState(false);
  const [originSearchLoading, setOriginSearchLoading] = useState(false);
  const [originSearchError, setOriginSearchError] = useState<string | null>(null);
  const [originActiveIndex, setOriginActiveIndex] = useState(-1);
  const [showOriginEditor, setShowOriginEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAirportCode, setPendingAirportCode] = useState<string | null>(null);
  const [transportAvailability, setTransportAvailability] = useState<TransportAvailability>('all');
  const [tripPurpose, setTripPurpose] = useState<QuickGoPurpose>('general-destination');
  const [quickGoPreference, setQuickGoPreference] = useState<QuickGoPreference>('easiest');
  const [timingMode, setTimingMode] = useState<'now' | 'later'>('now');
  const [plannedDateTime, setPlannedDateTime] = useState(() =>
    localDateTimeInputValue(new Date()),
  );
  const [parkingDurationHours, setParkingDurationHours] = useState('2');
  const [calculateLeaveTime, setCalculateLeaveTime] = useState(true);
  const [familyLuggageFriendly, setFamilyLuggageFriendly] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [geolocationSupported, setGeolocationSupported] = useState(false);
  const destinationInputRef = useRef<HTMLInputElement>(null);
  const originInputRef = useRef<HTMLInputElement>(null);

  const recentOrigins = useMemo(() => getRecentOrigins(), []);
  const savedDestinations = useMemo(() => readSavedDestinations(), []);
  const recentDestinations = useMemo(() => getRecentDestinations(), []);
  const canUseGeo = geolocationSupported;
  const originSummary = compactOriginLabel(originInputText, originSelection);
  const preferenceLabel =
    quickGoPreferences.find((option) => option.key === quickGoPreference)?.label ?? 'Easiest';
  const customizeSummary = `${preferenceLabel} · ${timingMode === 'now' ? 'leaving now' : 'leaving later'}`;

  const detectedAirportCode = useMemo(
    () => resolveAirportCode(destinationSelection, destinationText),
    [destinationSelection, destinationText],
  );

  useEffect(() => {
    if (!canUseGeolocationNow()) return;

    const timeoutId = window.setTimeout(() => {
      setGeolocationSupported(true);
      setOriginSelection((current) => current ?? buildPendingGeolocationOriginSelection());
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const query = destinationText.trim();
    const controller = new AbortController();

    if (query.length < 3) {
      const resetId = window.setTimeout(() => {
        setDestinationSuggestions([]);
        setDestinationSearchLoading(false);
        setDestinationSearchError(null);
      }, 0);

      return () => {
        window.clearTimeout(resetId);
        controller.abort();
      };
    }

    const timeoutId = window.setTimeout(() => {
      setDestinationSearchLoading(true);
      setDestinationSearchError(null);

      void searchDestinations(
        {
          query,
          savedDestinations,
          recentDestinations,
          originLat: originSelection?.originLat,
          originLng: originSelection?.originLng,
          originSource: originSelection?.originSource,
          signal: controller.signal,
        },
        {},
      )
        .then((results) => {
          if (controller.signal.aborted) return;
          setDestinationSuggestions(results);
          setDestinationSearchOpen(true);
          setDestinationSearchLoading(false);
        })
        .catch((searchError) => {
          if (controller.signal.aborted) return;
          console.warn('Destination search failed', searchError);
          setDestinationSuggestions([]);
          setDestinationSearchOpen(true);
          setDestinationSearchLoading(false);
          setDestinationSearchError('Unable to load destination suggestions.');
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    destinationText,
    savedDestinations,
    recentDestinations,
    originSelection?.originLat,
    originSelection?.originLng,
    originSelection?.originSource,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    if (!showOriginEditor) {
      const resetId = window.setTimeout(() => {
        setOriginSuggestions([]);
        setOriginSearchLoading(false);
        setOriginSearchError(null);
        setOriginActiveIndex(-1);
      }, 0);

      return () => {
        window.clearTimeout(resetId);
        controller.abort();
      };
    }

    const query = originInputText.trim();
    if (query.length < 3) {
      const resetId = window.setTimeout(() => {
        setOriginSuggestions([]);
        setOriginSearchLoading(false);
        setOriginSearchError(null);
        setOriginActiveIndex(-1);
      }, 0);

      return () => {
        window.clearTimeout(resetId);
        controller.abort();
      };
    }

    const timeoutId = window.setTimeout(() => {
      setOriginSearchLoading(true);
      setOriginSearchError(null);

      void searchDestinations(
        {
          query,
          savedDestinations,
          recentDestinations: recentOrigins,
          signal: controller.signal,
        },
        {},
      )
        .then((results) => {
          if (controller.signal.aborted) return;
          setOriginSuggestions(results);
          setOriginSearchOpen(true);
          setOriginSearchLoading(false);
          setOriginActiveIndex(results.length > 0 ? 0 : -1);
        })
        .catch((searchError) => {
          if (controller.signal.aborted) return;
          console.warn('Origin search failed', searchError);
          setOriginSuggestions([]);
          setOriginSearchOpen(true);
          setOriginSearchLoading(false);
          setOriginActiveIndex(-1);
          setOriginSearchError('Unable to load starting point suggestions.');
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [originInputText, recentOrigins, savedDestinations, showOriginEditor]);

  useEffect(() => {
    if (!canUseGeo || originSelection?.originSource !== 'geolocation') return;
    if (typeof originSelection.originLat === 'number' && typeof originSelection.originLng === 'number') {
      return;
    }

    const permissions = navigator.permissions;
    if (!permissions?.query) return;

    let cancelled = false;

    permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== 'granted') return;

        setIsLocating(true);
        setLocateError(null);
        void resolveGeolocationOrigin()
          .then((selection) => {
            if (cancelled) return;
            setOriginSelection(selection);
            setOriginInputText('');
          })
          .catch(() => {
            if (!cancelled) {
              setOriginSelection(buildPendingGeolocationOriginSelection());
            }
          })
          .finally(() => {
            if (!cancelled) setIsLocating(false);
          });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    canUseGeo,
    originSelection?.originLat,
    originSelection?.originLng,
    originSelection?.originSource,
  ]);

  const resolveOriginForSubmit = async (): Promise<QuickGoOriginSelection | null> => {
    const typedOrigin = originInputText.trim();

    if (
      originSelection &&
      originSelection.originSource !== 'geolocation' &&
      selectedOriginMatchesInput(originInputText, originSelection)
    ) {
      return originSelection;
    }

    if (typedOrigin) {
      return buildManualOriginSelection(typedOrigin);
    }

    if (originSelection && originSelection.originSource !== 'geolocation') {
      return originSelection;
    }

    if (originSelection?.originSource === 'geolocation') {
      if (typeof originSelection.originLat === 'number' && typeof originSelection.originLng === 'number') {
        return originSelection;
      }

      if (!canUseGeo) {
        setShowOriginEditor(true);
        setLocateError('Geolocation not supported in this browser');
        return null;
      }

      try {
        setIsLocating(true);
        setLocateError(null);
        const selection = await resolveGeolocationOrigin();
        setOriginSelection(selection);
        setOriginInputText('');
        return selection;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to get current location';
        setLocateError(message);
        setShowOriginEditor(true);
        setError('Current location is unavailable. Type a starting point.');
        return null;
      } finally {
        setIsLocating(false);
      }
    }

    return null;
  };

  const rememberSubmittedOrigin = (origin: QuickGoOriginSelection) => {
    if (origin.originSource === 'geolocation') {
      if (origin.originLabel !== 'Current location') {
        rememberRecentOrigin(origin.origin);
      }
      return;
    }

    rememberRecentOrigin(origin.origin);
  };

  const submitQuickGo = async (continueAsQuickGo = false, forcedDestination?: QuickGoDestinationSelection) => {
    const destination = forcedDestination ?? destinationSelection;
    const trimmedText = destinationText.trim();

    if (!trimmedText) {
      setError('Enter where you are going.');
      return;
    }

    if (!destination) {
      if (destinationSuggestions.length > 1) {
        setDestinationSearchOpen(true);
        setError('Choose a destination from the suggestions.');
        return;
      }

      if (destinationSuggestions.length === 1) {
        const selected = destinationSearchResultToSelection(destinationSuggestions[0]!);
        setDestinationSelection(selected);
        void submitQuickGo(continueAsQuickGo, selected);
        return;
      }

      const typedFallback = destinationSearchResultToSelection(buildTypedDestinationFallback(trimmedText));
      setDestinationSelection(typedFallback);
      void submitQuickGo(continueAsQuickGo, typedFallback);
      return;
    }

    const origin = await resolveOriginForSubmit();

    if (!origin) {
      setShowOriginEditor(true);
      setError('Add a starting point to compare routes.');
      return;
    }

    rememberSubmittedOrigin(origin);
    rememberRecentDestination(destination.destination);
    setError(null);

    const destinationForRoute = await ensureDestinationCoordinates(destination);

    trackEvent('quick_go_submitted', {
      eventProperties: {
        airportCode: destination.detectedAirportCode ?? detectedAirportCode ?? undefined,
        mode: continueAsQuickGo ? 'quick_go' : 'planner_handoff',
        originSource: origin.originSource,
        destinationSource: destination.destinationSource,
        destinationConfidence: destination.destinationConfidence,
      },
    });

    router.push(
      buildQuickGoResultsPath({
        destination: destinationForRoute,
        origin,
        continueAsQuickGo,
        transportAvailability,
        purpose: tripPurpose,
        preference: quickGoPreference,
        calculateLeaveTime,
        familyLuggageFriendly,
        parkingDurationMinutes: Math.max(
          30,
          Math.round((Number(parkingDurationHours) || 2) * 60),
        ),
        now:
          timingMode === 'later'
            ? dateFromLocalDateTimeInput(plannedDateTime) || new Date()
            : new Date(),
      }),
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const airportCode = pendingAirportCode || detectedAirportCode;
    if (airportCode && !pendingAirportCode) {
      setPendingAirportCode(airportCode);
      return;
    }

    void submitQuickGo(Boolean(pendingAirportCode));
  };

  const handleDestinationSelect = (result: DestinationSearchResult) => {
    const selection = destinationSearchResultToSelection(result);
    setDestinationSelection(selection);
    setDestinationText(result.label);
    setDestinationSearchOpen(false);
    setDestinationSearchError(null);
    setPendingAirportCode(null);
    setError(null);
  };

  const handleOriginSelect = (result: DestinationSearchResult) => {
    const selection = destinationSearchResultToOriginSelection(result);
    setOriginSelection(selection);
    setOriginInputText(selection.originLabel);
    setOriginSearchOpen(false);
    setOriginSearchError(null);
    setOriginActiveIndex(-1);
    setLocateError(null);
    setError(null);
  };

  const handleOriginInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (originSearchOpen) {
        event.preventDefault();
        setOriginSearchOpen(false);
        setOriginActiveIndex(-1);
      }
      return;
    }

    if (!originSearchOpen || originSuggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOriginActiveIndex((current) => (current + 1) % originSuggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOriginActiveIndex((current) =>
        current <= 0 ? originSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === 'Enter') {
      const selected = originSuggestions[
        originActiveIndex >= 0 ? originActiveIndex : 0
      ];
      if (!selected) return;
      event.preventDefault();
      handleOriginSelect(selected);
    }
  };

  const handleUseTypedDestination = () => {
    const trimmedText = destinationText.trim();
    if (!trimmedText) return;

    const selection = destinationSearchResultToSelection(buildTypedDestinationFallback(trimmedText));
    setDestinationSelection(selection);
    setDestinationSearchOpen(false);
    setError(null);
    setPendingAirportCode(null);
  };

  const handleExampleClick = (example: string) => {
    setDestinationText(example);
    setDestinationSelection(null);
    setPendingAirportCode(null);
    setError(null);
  };

  const handleUseCurrentLocation = async () => {
    if (!canUseGeo) {
      setLocateError('Geolocation not supported in this browser');
      return;
    }

    setLocateError(null);
    setError(null);
    setIsLocating(true);

    try {
      const selection = await resolveGeolocationOrigin();
      setOriginSelection(selection);
      setOriginInputText('');
      setShowOriginEditor(false);
      setOriginSearchOpen(false);
      setOriginSuggestions([]);
      setOriginActiveIndex(-1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to get location';
      setLocateError(message);
    } finally {
      setIsLocating(false);
    }
  };

  const handleSavedOriginClick = (savedOrigin: string) => {
    setOriginSelection(buildSavedOriginSelection(savedOrigin));
    setOriginInputText('');
    setLocateError(null);
    setError(null);
    setShowOriginEditor(false);
    setOriginSearchOpen(false);
    setOriginSuggestions([]);
    setOriginActiveIndex(-1);
  };

  const handleUseFullPlanner = async () => {
    const origin = await resolveOriginForSubmit();
    const airportCode = pendingAirportCode || detectedAirportCode;

    if (!airportCode) return;

    if (!origin) {
      setShowOriginEditor(true);
      setError('Add a starting point to open the airport planner.');
      return;
    }

    rememberSubmittedOrigin(origin);
    router.push(
      buildFullAirportPlannerPath({
        origin: origin.origin,
        airportCode,
      }),
    );
  };

  const inputClassName =
    'w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15';

  const showTypedDestinationFallback =
    destinationSearchOpen &&
    destinationText.trim().length >= 3 &&
    !destinationSearchLoading &&
    destinationSuggestions.length === 0;

  return (
    <section
      className={
        'relative overflow-hidden rounded-2xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-5 dark:bg-card/75 ' +
        className
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-travel-sky/8 blur-3xl dark:bg-travel-sky/12"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Quick Go</h2>
            <StatusPill tone="accent" className="text-[11px]">
              Now
            </StatusPill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Type where you&apos;re going — we&apos;ll show drive time, parking, and the best way there.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative mt-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div className="relative min-w-0 flex-1">
            <label className="block">
              <span className="sr-only">Where are you going?</span>
              <input
                ref={destinationInputRef}
                type="text"
                value={destinationText}
                onChange={(event) => {
                  setDestinationText(event.target.value);
                  setDestinationSelection(null);
                  setPendingAirportCode(null);
                  setError(null);
                  setDestinationSearchOpen(true);
                }}
                onFocus={() => setDestinationSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setDestinationSearchOpen(false), 150)}
                placeholder="Where are you going?"
                className={inputClassName}
                role="combobox"
                aria-expanded={destinationSearchOpen}
                aria-controls="quick-go-destination-suggestions"
                aria-autocomplete="list"
              />
            </label>

            {destinationSearchOpen && destinationText.trim().length >= 3 ? (
              <div
                id="quick-go-destination-suggestions"
                role="listbox"
                className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-xl"
              >
                {destinationSearchLoading ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">Searching destinations…</div>
                ) : null}

                {!destinationSearchLoading && destinationSearchError ? (
                  <div className="px-4 py-3 text-sm text-danger">{destinationSearchError}</div>
                ) : null}

                {!destinationSearchLoading &&
                  destinationSuggestions.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleDestinationSelect(result)}
                      className="block w-full border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="text-sm font-medium text-foreground">{result.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{result.address}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span>{formatDestinationSearchCategory(result.category)}</span>
                        <span>·</span>
                        <span>{formatDestinationSearchSource(result.source)}</span>
                      </div>
                    </button>
                  ))}

                {showTypedDestinationFallback ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={handleUseTypedDestination}
                    className="block w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50"
                  >
                    Use typed destination: <span className="font-medium">{destinationText.trim()}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Lower confidence · no address match found
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {!pendingAirportCode ? (
            <PrimaryButton type="submit" className="w-full shrink-0 md:w-auto md:self-stretch md:px-6">
              Quick Go
            </PrimaryButton>
          ) : null}
        </div>

        {destinationSelection ? (
          <p className="text-xs text-muted-foreground">
            Selected: {destinationSelection.destinationLabel}
            {destinationSelection.destinationConfidence === 'low' ? ' · lower confidence' : ''}
          </p>
        ) : null}

        <ExpandableSection
          title="Customize trip"
          summary={customizeSummary}
          contentClassName="space-y-3"
        >
          <div className="grid gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trip purpose
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {quickGoPurposes.map((purpose) => {
                const selected = tripPurpose === purpose.key;
                return (
                  <button
                    key={purpose.key}
                    type="button"
                    onClick={() => setTripPurpose(purpose.key)}
                    className={
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ' +
                      (selected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground')
                    }
                  >
                    {purpose.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Timing
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
                {(['now', 'later'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTimingMode(mode)}
                    className={
                      'rounded-md px-2 py-2 text-xs font-semibold transition ' +
                      (timingMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                    }
                  >
                    {mode === 'now' ? 'Now' : 'Later'}
                  </button>
                ))}
              </div>
              {timingMode === 'later' ? (
                <input
                  type="datetime-local"
                  value={plannedDateTime}
                  onChange={(event) => setPlannedDateTime(event.target.value)}
                  className={`${inputClassName} mt-2`}
                  aria-label="Quick Go date and time"
                />
              ) : null}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What matters most?
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1">
                {quickGoPreferences.map((preference) => (
                  <button
                    key={preference.key}
                    type="button"
                    onClick={() => setQuickGoPreference(preference.key)}
                    className={
                      'rounded-md px-2 py-2 text-xs font-semibold transition ' +
                      (quickGoPreference === preference.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                    }
                  >
                    {preference.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                We compare every option — this just picks which one we highlight.
              </p>
            </div>
          </div>

          {(tripPurpose === 'parking-trip' || tripPurpose === 'flying-out') ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Parking duration
              </span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={parkingDurationHours}
                  onChange={(event) => setParkingDurationHours(event.target.value)}
                  className={`${inputClassName} max-w-28`}
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCalculateLeaveTime((current) => !current)}
              className={
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition ' +
                (calculateLeaveTime
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground')
              }
            >
              Leave-time help {calculateLeaveTime ? 'on' : 'off'}
            </button>
            <button
              type="button"
              onClick={() => setFamilyLuggageFriendly((current) => !current)}
              className={
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition ' +
                (familyLuggageFriendly
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground')
              }
            >
              Family/luggage friendly
            </button>
          </div>
        </div>

        <div>
          <div className="pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How will you get around?
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { key: 'car' as const, label: 'I have a car' },
                { key: 'rideshare' as const, label: 'No car' },
                { key: 'all' as const, label: 'Compare all' },
              ] as Array<{ key: TransportAvailability; label: string }>
            ).map((option) => {
              const selected = transportAvailability === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setTransportAvailability(option.key)}
                  className={
                    'rounded-lg px-2 py-2 text-xs font-semibold transition ' +
                    (selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-muted')
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        </ExpandableSection>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">Starting from:</span>
          <span
            className={
              originSummary === 'Choose starting point'
                ? 'text-muted-foreground'
                : 'font-medium text-foreground'
            }
          >
            {originSummary}
          </span>
          <button
            type="button"
            onClick={() => setShowOriginEditor((current) => !current)}
            className="font-semibold text-primary hover:underline"
          >
            {showOriginEditor ? 'Done' : 'Change'}
          </button>
        </div>

        {showOriginEditor ? (
          <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="relative min-w-0 flex-1">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Type a starting point</span>
                  <input
                    ref={originInputRef}
                    type="text"
                    value={originInputText}
                    onChange={(event) => {
                      setOriginInputText(event.target.value);
                      setOriginSelection(null);
                      setLocateError(null);
                      setError(null);
                      setOriginSearchOpen(true);
                    }}
                    onFocus={() => setOriginSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setOriginSearchOpen(false), 150)}
                    onKeyDown={handleOriginInputKeyDown}
                    placeholder="Type an address or place"
                    className={`${inputClassName} mt-1.5`}
                    role="combobox"
                    aria-expanded={originSearchOpen}
                    aria-controls="quick-go-origin-suggestions"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      originActiveIndex >= 0
                        ? `quick-go-origin-option-${originActiveIndex}`
                        : undefined
                    }
                  />
                </label>

                {originSearchOpen && originInputText.trim().length >= 3 ? (
                  <div
                    id="quick-go-origin-suggestions"
                    role="listbox"
                    className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-xl"
                  >
                    {originSearchLoading ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Searching starting points…
                      </div>
                    ) : null}

                    {!originSearchLoading && originSearchError ? (
                      <div className="px-4 py-3 text-sm text-danger">{originSearchError}</div>
                    ) : null}

                    {!originSearchLoading &&
                      originSuggestions.map((result, index) => {
                        const active = index === originActiveIndex;
                        return (
                          <button
                            key={result.id}
                            id={`quick-go-origin-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setOriginActiveIndex(index)}
                            onClick={() => handleOriginSelect(result)}
                            className={
                              'block w-full border-b border-border/60 px-4 py-3 text-left last:border-b-0 ' +
                              (active ? 'bg-muted/70' : 'hover:bg-muted/50')
                            }
                          >
                            <div className="text-sm font-medium text-foreground">{result.label}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{result.address}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                              <span>{formatDestinationSearchCategory(result.category)}</span>
                              <span>·</span>
                              <span>{formatOriginSearchSource(result.source)}</span>
                            </div>
                          </button>
                        );
                      })}

                    {!originSearchLoading && !originSearchError && originSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        No suggestions found. You can still use the typed starting point.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={!canUseGeo || isLocating}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-muted disabled:opacity-50"
              >
                {isLocating ? 'Detecting…' : 'Use current location'}
              </button>
            </div>

            {originSelection && originSelection.originSource !== 'geolocation' ? (
              <p className="text-xs text-muted-foreground">
                Selected starting point: {originSelection.originLabel}
                {originSelection.originConfidence === 'low' ? ' · lower confidence' : ''}
              </p>
            ) : null}

            {recentOrigins.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Saved recent origins</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recentOrigins.map((savedOrigin) => (
                    <button
                      key={savedOrigin}
                      type="button"
                      onClick={() => handleSavedOriginClick(savedOrigin)}
                      className="rounded-full border border-border/70 bg-card/80 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/20 hover:bg-muted/50 hover:text-foreground"
                    >
                      Use saved: {savedOrigin}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {locateError ? <p className="text-sm text-destructive">{locateError}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_GO_EXAMPLE_DESTINATIONS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExampleClick(example)}
              className="rounded-full border border-border/60 bg-muted/15 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/20 hover:bg-muted/35 hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {pendingAirportCode ? (
          <div className="rounded-xl border border-warning/25 bg-warning/10 p-4">
            <p className="text-sm font-medium text-foreground">
              This looks like an airport trip. Want to use the full airport planner?
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <PrimaryButton type="button" onClick={handleUseFullPlanner}>
                Use full airport planner
              </PrimaryButton>
              <PrimaryButton
                type="button"
                variant="secondary"
                onClick={() => {
                  void submitQuickGo(true);
                }}
              >
                Continue Quick Go
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}
