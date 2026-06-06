'use client';

import type { RankedRecommendation } from '../../lib/domain';
import { googleMapsDirectionsLink } from '../../lib/maps';
import type { DestinationParkingClassification } from '../../lib/parking/destinationParkingClassifier';
import { parkingTimeBreakdown } from '../../lib/parking/routeDisplay';
import { buildParkingDriveContextFromOption } from '../../lib/parking/routeMinutes';
import { isParkingRouteUnavailable } from '../../lib/parking/routeStatus';
import { resolveTripParkingContext } from '../../lib/trip/tripContext';
import {
  quickGoClassificationForTrip,
  quickGoParkingConfidenceLabel,
  quickGoParkingExpectationLabel,
  quickGoParkingHeadline,
  quickGoStressLabel,
} from '../../lib/trip/quickGo';
import type { ParkingOption, TripData, TrustStatus } from '../../lib/types';
import type { WeatherImpact } from '../../lib/weather/types';
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
  leaveByTime?: string | null;
  preference?: 'easiest' | 'cheapest' | 'fastest';
  quickGoPurpose?: string;
  weatherImpact?: WeatherImpact | null;
  driveTimeTrustStatus?: TrustStatus | string | null;
  driveTimeSourceName?: string | null;
  driveTimeUnavailable?: boolean;
  fullDetailsHref?: string;
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

function purposeGuidance(purpose: string): string | null {
  if (purpose === 'picking-up') {
    return 'Pickup tip: use the cell phone lot until the passenger is curbside, then start toward arrivals. Airport-specific rules can change, so follow posted signs.';
  }
  if (purpose === 'dropping-off') {
    return 'Drop-off tip: aim for departures unless signs or congestion point you to an alternate level. Confirm terminal or airline details before you leave.';
  }
  if (purpose === 'flying-out') {
    return 'Airport trip: leave-time and parking transfer matter more than the map route alone.';
  }
  return null;
}

function formatLeaveTimeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;

  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatDriveTimeLabel(
  minutes: number | null,
  trustStatus?: TrustStatus | string | null,
  sourceName?: string | null,
): string {
  const formatted = formatMinutesLabel(minutes);
  if (sourceName?.startsWith('Cached route snapshot')) {
    return `Cached drive time: ${formatted}`;
  }
  if (sourceName === 'Mapbox Directions') {
    return `Estimated drive time: ~${formatted}`;
  }
  if (sourceName === 'Estimated from coordinates') {
    return `Straight-line fallback estimate: ~${formatted}`;
  }
  const isLive =
    trustStatus === 'live' &&
    sourceName !== 'Estimated from coordinates' &&
    sourceName !== 'Mapbox Directions';
  return isLive ? `Live drive time: ${formatted}` : `Estimated drive time: ~${formatted}`;
}

function driveTimeHelperText(
  trustStatus?: TrustStatus | string | null,
  sourceName?: string | null,
): string | null {
  if (sourceName === 'Mapbox Directions') {
    return 'Backup routing source used. Open directions to confirm.';
  }
  if (sourceName === 'Estimated from coordinates') {
    return 'Open directions to confirm.';
  }
  if (sourceName?.startsWith('Cached route snapshot')) {
    return 'Matched cached route for this origin, destination, and time bucket.';
  }
  if (trustStatus === 'fallback') {
    return 'Fallback route estimate; open directions to confirm.';
  }
  return null;
}

function parkingTotalBreakdown(
  option: ParkingOption | null,
  tripData: TripData,
): { total: number; detail: string } | null {
  if (!option || isParkingRouteUnavailable(option)) return null;

  const breakdown = parkingTimeBreakdown(
    option,
    buildParkingDriveContextFromOption(option),
    resolveTripParkingContext(tripData),
  );
  const drivePart = breakdown.parts.find((part) => part.label === 'Drive to lot');
  const driveMinutes = drivePart?.minutes ?? 0;
  const extraMinutes = Math.max(0, breakdown.totalMinutes - driveMinutes);

  if (breakdown.totalMinutes <= 0 || extraMinutes <= 0) return null;

  const tripContext = resolveTripParkingContext(tripData);
  const extraLabel =
    tripContext === 'city_destination_trip'
      ? 'parking/walk buffer'
      : 'parking/terminal buffer';

  return {
    total: breakdown.totalMinutes,
    detail: `${formatMinutesLabel(driveMinutes)} drive + ${formatMinutesLabel(extraMinutes)} ${extraLabel}`,
  };
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
  leaveByTime = null,
  quickGoPurpose = 'general-destination',
  weatherImpact = null,
  driveTimeTrustStatus,
  driveTimeSourceName,
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
  const formattedLeaveBy = formatLeaveTimeLabel(leaveByTime);
  const weatherText = weatherImpact
    ? weatherImpact.riskLevel === 'low'
      ? 'Low weather risk.'
      : `${weatherImpact.summary}. Long uncovered walking is penalized.`
    : null;
  const guidance = purposeGuidance(quickGoPurpose);
  const bestParkingOption =
    bestOption?.type === 'parking' ? (bestOption.option as ParkingOption) : null;
  const totalBreakdown = parkingTotalBreakdown(bestParkingOption, tripData);
  const driveHelperText = driveTimeHelperText(driveTimeTrustStatus, driveTimeSourceName);
  const showTotalBreakdown = Boolean(
    totalBreakdown &&
    driveMinutes != null &&
    Number.isFinite(driveMinutes) &&
    totalBreakdown.total > driveMinutes + 1,
  );

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

      {(weatherText || guidance || formattedLeaveBy) ? (
        <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {formattedLeaveBy ? (
            <p className="font-medium text-foreground">Leave by {formattedLeaveBy}.</p>
          ) : null}
          {weatherText ? <p className="mt-1">{weatherText}</p> : null}
          {guidance ? <p className="mt-1">{guidance}</p> : null}
        </div>
      ) : null}

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Best way to go
          </dt>
          <dd className="mt-2 text-lg font-semibold text-foreground">{bestWayLabel}</dd>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Drive time
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
            <>
              <dd className="mt-2 text-lg font-semibold text-foreground">
                {formatDriveTimeLabel(driveMinutes, driveTimeTrustStatus, driveTimeSourceName)}
              </dd>
              {driveHelperText ? (
                <dd className="mt-1 text-sm text-muted-foreground">{driveHelperText}</dd>
              ) : null}
            </>
          )}
        </div>

        {showTotalBreakdown && totalBreakdown ? (
          <div className="rounded-2xl border border-border bg-card/80 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total trip time
            </dt>
            <dd className="mt-2 text-lg font-semibold text-foreground">
              {formatMinutesLabel(totalBreakdown.total)}
            </dd>
            <dd className="mt-1 text-sm text-muted-foreground">
              {totalBreakdown.detail}
            </dd>
          </div>
        ) : null}

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
