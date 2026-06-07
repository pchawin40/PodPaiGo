'use client';

import { useEffect, useMemo, useState } from 'react';
import { googleMapsDirectionsLink } from '../../lib/maps';
import {
  readDestinationAccessConfirmed,
  writeDestinationAccessConfirmed,
} from '../../lib/parking/destinationParkingClassifier';
import { buildParkingOutlook } from '../../lib/parking/parkingOutlook';
import type { GoogleParkingOptionsSignals } from '../../lib/parking/googleParkingOptionsSignals';
import ParkingInfoReportModal from './ParkingInfoReportModal';
import { trackEvent } from '../../lib/analytics/trackEvent';

type DestinationParkingSummaryProps = {
  destination: string;
  origin?: string | null;
  destinationKind?: string | null;
  airportCode?: string | null;
  googleParkingOptions?: GoogleParkingOptionsSignals | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number;
  onCheckNearbyParking?: () => void;
  className?: string;
};

export default function DestinationParkingSummary({
  destination,
  origin = null,
  destinationKind = null,
  airportCode = null,
  googleParkingOptions = null,
  arrivalDate = null,
  arrivalTime = null,
  durationMinutes,
  onCheckNearbyParking,
  className = '',
}: DestinationParkingSummaryProps) {
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const outlook = useMemo(
    () =>
      buildParkingOutlook({
        destination,
        destinationKind,
        airportCode,
        googleParkingOptions,
        arrivalDate,
        arrivalTime,
        durationMinutes,
      }),
    [
      destination,
      destinationKind,
      airportCode,
      googleParkingOptions,
      arrivalDate,
      arrivalTime,
      durationMinutes,
    ],
  );

  useEffect(() => {
    setAccessConfirmed(readDestinationAccessConfirmed(destination));
  }, [destination]);

  if (destinationKind === 'airport') {
    return null;
  }

  const directionsUrl =
    origin?.trim() && destination.trim()
      ? googleMapsDirectionsLink(origin.trim(), destination.trim())
      : null;

  const isRestricted = outlook.diagnostics.accessType === 'Employee only'
    || outlook.diagnostics.accessType === 'Tenant only'
    || outlook.diagnostics.accessType === 'Permit required';

  const handleConfirmAccess = () => {
    writeDestinationAccessConfirmed(destination);
    setAccessConfirmed(true);
  };

  return (
    <>
      <section
        className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}
        aria-label="Destination parking outlook"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          Parking outlook
        </div>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{outlook.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{outlook.body}</p>

        {outlook.hints.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {outlook.hints.map((hint) => (
              <span
                key={hint}
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {hint}
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-xs text-muted-foreground">{outlook.verifyNotice}</p>

        {isRestricted && accessConfirmed ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
            Access confirmed for this trip. This preference is saved locally for this destination only.
          </div>
        ) : null}

        {isRestricted && !accessConfirmed ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            Restricted parking may apply. {outlook.diagnostics.recommendedAction}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Open directions
            </a>
          ) : null}

          {onCheckNearbyParking ? (
            <button
              type="button"
              onClick={onCheckNearbyParking}
              className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
            >
              Search nearby parking
            </button>
          ) : null}

          {isRestricted && !accessConfirmed ? (
            <>
              <button
                type="button"
                onClick={handleConfirmAccess}
                className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-foreground hover:bg-emerald-500/20"
              >
                I have access
              </button>
              <button
                type="button"
                onClick={() => {
                  trackEvent('parking_report_started', {
                    eventProperties: {
                      airportCode: airportCode ?? undefined,
                      destinationCategory: destinationKind ?? undefined,
                    },
                  });
                  setReportOpen(true);
                }}
                className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
              >
                Report parking rules
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                trackEvent('parking_report_started', {
                  eventProperties: {
                    airportCode: airportCode ?? undefined,
                    destinationCategory: destinationKind ?? undefined,
                  },
                });
                setReportOpen(true);
              }}
              className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
            >
              Report parking info
            </button>
          )}
        </div>

      </section>

      <details className="group mt-3 rounded-xl border border-border bg-muted/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
          Details and evidence
          <span className="ml-2 text-xs text-muted-foreground transition group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <dl className="space-y-2 border-t border-border px-3 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Access type</dt>
            <dd className="font-medium text-foreground">{outlook.diagnostics.accessType}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Confidence</dt>
            <dd className="font-medium text-foreground">{outlook.diagnostics.confidence}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="mt-0.5 text-foreground">{outlook.diagnostics.reason}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Recommended action</dt>
            <dd className="mt-0.5 text-foreground">{outlook.diagnostics.recommendedAction}</dd>
          </div>
        </dl>
      </details>

      <ParkingInfoReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        context={{ destinationText: destination }}
      />
    </>
  );
}
