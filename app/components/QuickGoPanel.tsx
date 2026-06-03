'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QUICK_GO_EXAMPLE_DESTINATIONS,
  buildFullAirportPlannerPath,
  buildQuickGoResultsPath,
  detectAirportFromDestination,
  getRecentOrigins,
  rememberRecentOrigin,
  resolveGeolocationOrigin,
  type QuickGoOriginSelection,
} from '../../lib/trip/quickGo';
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

export default function QuickGoPanel({ className = '' }: QuickGoPanelProps) {
  const router = useRouter();
  const [destinationText, setDestinationText] = useState('');
  const [originInputText, setOriginInputText] = useState('');
  const [originSelection, setOriginSelection] = useState<QuickGoOriginSelection | null>(null);
  const [showOriginEditor, setShowOriginEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAirportCode, setPendingAirportCode] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const recentOrigins = useMemo(() => getRecentOrigins(), []);
  const canUseGeo = typeof navigator !== 'undefined' && !!navigator.geolocation;
  const originSummary = compactOriginLabel(originInputText, originSelection);

  const detectedAirport = useMemo(
    () => (destinationText.trim() ? detectAirportFromDestination(destinationText) : null),
    [destinationText],
  );

  const resolveOriginForSubmit = (): QuickGoOriginSelection | null => {
    const typedOrigin = originInputText.trim();

    if (typedOrigin) {
      return buildManualOriginSelection(typedOrigin);
    }

    if (originSelection?.originSource === 'geolocation' || originSelection?.originSource === 'saved') {
      return originSelection;
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

  const submitQuickGo = (continueAsQuickGo = false) => {
    const destination = destinationText.trim();
    const origin = resolveOriginForSubmit();

    if (!destination) {
      setError('Enter where you are going.');
      return;
    }

    if (!origin) {
      setShowOriginEditor(true);
      setError('Add a starting point to compare routes.');
      return;
    }

    rememberSubmittedOrigin(origin);
    setError(null);

    router.push(
      buildQuickGoResultsPath({
        destinationText: destination,
        origin,
        continueAsQuickGo,
      }),
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (detectedAirport && !pendingAirportCode) {
      setPendingAirportCode(detectedAirport.id);
      return;
    }

    submitQuickGo(Boolean(pendingAirportCode));
  };

  const handleExampleClick = (example: string) => {
    setDestinationText(example);
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

  const handleUseFullPlanner = () => {
    const origin = resolveOriginForSubmit();
    const airportCode = pendingAirportCode || detectedAirport?.id;

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
          <label className="block min-w-0 flex-1">
            <span className="sr-only">Where are you going?</span>
            <input
              type="text"
              value={destinationText}
              onChange={(event) => {
                setDestinationText(event.target.value);
                setPendingAirportCode(null);
                setError(null);
              }}
              placeholder="Where are you going?"
              className={inputClassName}
            />
          </label>

          {!pendingAirportCode ? (
            <PrimaryButton type="submit" className="w-full shrink-0 md:w-auto md:self-stretch md:px-6">
              Quick Go
            </PrimaryButton>
          ) : null}
        </div>

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
                onClick={() => submitQuickGo(true)}
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
