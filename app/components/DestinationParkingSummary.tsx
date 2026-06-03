'use client';

import { useEffect, useMemo, useState } from 'react';
import { googleMapsDirectionsLink } from '../../lib/maps';
import {
  classifyDestinationParking,
  destinationParkingHeadline,
  destinationParkingSubcopy,
  formatParkingAccessLabel,
  readDestinationAccessConfirmed,
  writeDestinationAccessConfirmed,
  type DestinationParkingClassification,
} from '../../lib/parking/destinationParkingClassifier';
import { accessBadgeLabel } from './ParkingAccessBadge';
import ParkingInfoReportModal from './ParkingInfoReportModal';

type DestinationParkingSummaryProps = {
  destination: string;
  origin?: string | null;
  destinationKind?: string | null;
  airportCode?: string | null;
  onCheckNearbyParking?: () => void;
  className?: string;
};

function confidenceLabel(confidence: DestinationParkingClassification['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
    default:
      return 'Unknown confidence';
  }
}

export default function DestinationParkingSummary({
  destination,
  origin = null,
  destinationKind = null,
  airportCode = null,
  onCheckNearbyParking,
  className = '',
}: DestinationParkingSummaryProps) {
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const classification = useMemo(
    () =>
      classifyDestinationParking({
        destination,
        destinationKind,
        airportCode,
      }),
    [destination, destinationKind, airportCode],
  );

  useEffect(() => {
    setAccessConfirmed(readDestinationAccessConfirmed(destination));
  }, [destination]);

  if (classification.mode === 'airport') {
    return null;
  }

  const directionsUrl =
    origin?.trim() && destination.trim()
      ? googleMapsDirectionsLink(origin.trim(), destination.trim())
      : null;

  const headline = destinationParkingHeadline(classification.mode);
  const subcopy = destinationParkingSubcopy(classification.mode);
  const isRestricted = classification.mode === 'restricted_possible';

  const handleConfirmAccess = () => {
    writeDestinationAccessConfirmed(destination);
    setAccessConfirmed(true);
  };

  return (
    <>
      <section
        className={`rounded-2xl border border-sky-100 bg-white p-4 shadow-sm ${className}`}
        aria-label="Destination parking outlook"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Parking outlook
        </div>
        <h3 className="mt-1 text-lg font-semibold text-zinc-900">{headline}</h3>
        <p className="mt-1 text-sm text-zinc-600">{subcopy}</p>

        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-zinc-500">Access type</dt>
            <dd className="font-medium text-zinc-900">
              {formatParkingAccessLabel(classification.accessType)}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-zinc-500">Confidence</dt>
            <dd className="font-medium text-zinc-900">{confidenceLabel(classification.confidence)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Reason</dt>
            <dd className="mt-0.5 text-zinc-800">{classification.reason}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Recommended action</dt>
            <dd className="mt-0.5 text-zinc-800">{classification.recommendedAction}</dd>
          </div>
        </dl>

        {isRestricted && accessConfirmed ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Access confirmed for this trip. This preference is saved locally for this destination only.
          </div>
        ) : null}

        {isRestricted && !accessConfirmed ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Restricted parking may apply. {classification.recommendedAction}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Open directions
            </a>
          ) : null}

          {!classification.shouldSearchPaidParking && onCheckNearbyParking ? (
            <button
              type="button"
              onClick={onCheckNearbyParking}
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Check nearby parking anyway
            </button>
          ) : null}

          {isRestricted && !accessConfirmed ? (
            <>
              <button
                type="button"
                onClick={handleConfirmAccess}
                className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
              >
                I have access
              </button>
              {onCheckNearbyParking ? (
                <button
                  type="button"
                  onClick={onCheckNearbyParking}
                  className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Find public parking nearby
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Report parking rules
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Report parking info
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Access badge: {accessBadgeLabel(classification.accessType)}. Confirm rules with the garage or
          business before relying on this.
        </p>
      </section>

      <ParkingInfoReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        context={{ destinationText: destination }}
      />
    </>
  );
}
