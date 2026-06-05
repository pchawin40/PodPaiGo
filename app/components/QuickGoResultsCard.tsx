'use client';

import type { RankedRecommendation } from '../../lib/domain';
import { googleMapsDirectionsLink } from '../../lib/maps';
import type { DestinationParkingClassification } from '../../lib/parking/destinationParkingClassifier';
import {
  quickGoClassificationForTrip,
  quickGoParkingConfidenceLabel,
  quickGoParkingExpectationLabel,
  quickGoParkingHeadline,
  quickGoStressLabel,
} from '../../lib/trip/quickGo';
import type { TripData } from '../../lib/types';
import PrimaryButton from './ui/PrimaryButton';
import StatusPill from './ui/StatusPill';
import TravelCard from './ui/TravelCard';

type QuickGoResultsCardProps = {
  tripData: TripData;
  originDisplayLabel: string;
  classification?: DestinationParkingClassification;
  bestWayLabel: string;
  backupWayLabel: string;
  bestOption: RankedRecommendation | null;
  backupOption: RankedRecommendation | null;
  driveMinutes: number | null;
  driveTimeUnavailable?: boolean;
  className?: string;
};

function formatBackup(option: RankedRecommendation | null, fallback: string): string {
  if (option) {
    if (option.type === 'parking') return 'Drive';
    if (option.type === 'rideshare') return 'Rideshare / taxi';
    return 'Transit';
  }
  return fallback;
}

function formatMinutesLabel(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export default function QuickGoResultsCard({
  tripData,
  originDisplayLabel,
  classification: classificationProp,
  bestWayLabel,
  backupWayLabel,
  bestOption,
  backupOption,
  driveMinutes,
  driveTimeUnavailable = false,
  className = '',
}: QuickGoResultsCardProps) {
  const destination = tripData.destinationName || tripData.destination;
  const classification =
    classificationProp ??
    quickGoClassificationForTrip({
      destination,
      destinationKind: tripData.destinationKind,
    });

  const directionsUrl =
    tripData.origin && destination
      ? googleMapsDirectionsLink(tripData.origin, destination, 'driving')
      : null;

  return (
    <TravelCard className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusPill tone="primary">Quick Go</StatusPill>
          <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
            {destination}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {originDisplayLabel} · timing set to now
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Best way to go
          </dt>
          <dd className="mt-2 text-lg font-semibold text-foreground">{bestWayLabel}</dd>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estimated drive time
          </dt>
          {driveTimeUnavailable ? (
            <>
              <dd className="mt-2 text-lg font-semibold text-foreground">
                Drive time unavailable
              </dd>
              <dd className="mt-1 text-sm text-muted-foreground">
                Open directions to confirm drive time
              </dd>
            </>
          ) : (
            <dd className="mt-2 text-lg font-semibold text-foreground">
              {formatMinutesLabel(driveMinutes)}
            </dd>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Parking expectation
          </dt>
          <dd className="mt-2 text-lg font-semibold text-foreground">
            {quickGoParkingExpectationLabel(classification)}
          </dd>
          <dd className="mt-1 text-sm text-muted-foreground">
            {quickGoParkingHeadline(classification)}
          </dd>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Parking confidence
          </dt>
          <dd className="mt-2 text-lg font-semibold text-foreground">
            {quickGoParkingConfidenceLabel(classification.confidence)}
          </dd>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stress level
          </dt>
          <dd className="mt-2 text-lg font-semibold text-foreground">
            {bestOption ? quickGoStressLabel(bestOption.stressScore) : 'Medium'}
          </dd>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Backup option
          </dt>
          <dd className="mt-2 text-lg font-semibold text-foreground">
            {formatBackup(backupOption, backupWayLabel)}
          </dd>
        </div>
      </dl>

      {directionsUrl ? (
        <div className="mt-6">
          <PrimaryButton href={directionsUrl}>Open directions</PrimaryButton>
        </div>
      ) : null}
    </TravelCard>
  );
}
