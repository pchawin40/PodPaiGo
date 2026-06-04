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
  type QuickGoDestinationSelection,
  type QuickGoOriginSelection,
} from '../../lib/trip/quickGo';
import {
  getRecentDestinations,
  readSavedDestinations,
  rememberRecentDestination,
} from '../../lib/trip/savedDestinations';
import { trackEvent } from '../../lib/analytics/trackEvent';
import PrimaryButton from './ui/PrimaryButton';
import StatusPill from './ui/StatusPill';

type QuickGoPanelProps = {
  className?: string;
};

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
  const [showOriginEditor, setShowOriginEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAirportCode, setPendingAirportCode] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [geolocationSupported, setGeolocationSupported] = useState(false);
  const destinationInputRef = useRef<HTMLInputElement>(null);

  const recentOrigins = useMemo(() => getRecentOrigins(), []);
  const savedDestinations = useMemo(() => readSavedDestinations(), []);
  const recentDestinations = useMemo(() => getRecentDestinations(), []);
  const canUseGeo = geolocationSupported;
  const originSummary = compactOriginLabel(originInputText, originSelection);

  const detectedAirportCode = useMemo(
    () => resolveAirportCode(destinationSelection, destinationText),
    [destinationSelection, destinationText],
  );

  useEffect(() => {
    if (!canUseGeolocationNow()) return;

    setGeolocationSupported(true);
    setOriginSelection((current) => current ?? buildPendingGeolocationOriginSelection());
  }, []);

  useEffect(() => {
    const query = destinationText.trim();
    if (query.length < 3) {
      setDestinationSuggestions([]);
      setDestinationSearchLoading(false);
      setDestinationSearchError(null);
      return;
    }

    setDestinationSearchLoading(true);
    setDestinationSearchError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
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

    if (typedOrigin) {
      return buildManualOriginSelection(typedOrigin);
    }

    if (originSelection?.originSource === 'saved') {
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
        destination,
        origin,
        continueAsQuickGo,
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
          <p className="mt-0.5 text-sm font-medium text-foreground">Fast point A to point B</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Just going somewhere now? Enter a destination for drive time and parking expectations.
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
                  <div className="px-4 py-3 text-sm text-destructive">{destinationSearchError}</div>
                ) : null}

                {!destinationSearchLoading &&
                  destinationSuggestions.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      role="option"
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
              <label className="block min-w-0 flex-1">
                <span className="text-xs font-medium text-muted-foreground">Type a starting point</span>
                <input
                  type="text"
                  value={originInputText}
                  onChange={(event) => {
                    setOriginInputText(event.target.value);
                    setOriginSelection(null);
                    setLocateError(null);
                    setError(null);
                  }}
                  placeholder="Type an address or place"
                  className={`${inputClassName} mt-1.5`}
                />
              </label>

              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={!canUseGeo || isLocating}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-muted disabled:opacity-50"
              >
                {isLocating ? 'Detecting…' : 'Use current location'}
              </button>
            </div>

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
