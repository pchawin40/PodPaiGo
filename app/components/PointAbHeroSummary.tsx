'use client';

import type { PointAbRankingResult } from '../../lib/parking/pointAbRanking';
import type { ParkingOutlookPresentation } from '../../lib/parking/parkingOutlook';

type PointAbHeroSummaryProps = {
  ranking: PointAbRankingResult;
  parkingOutlook: ParkingOutlookPresentation;
  driveTimeLabel?: string | null;
  backupRoutingUsed?: boolean;
  className?: string;
};

function modeLabel(key: string): string {
  switch (key) {
    case 'parking':
      return 'Drive + park';
    case 'street-meter':
      return 'Street / meter';
    case 'rideshare':
      return 'Rideshare';
    case 'transit':
      return 'Transit';
    case 'park-ride':
      return 'Park & Ride';
    default:
      return 'Compare';
  }
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export default function PointAbHeroSummary({
  ranking,
  parkingOutlook,
  driveTimeLabel,
  backupRoutingUsed = false,
  className = '',
}: PointAbHeroSummaryProps) {
  const bestMode = ranking.modes.find((mode) => mode.key === ranking.recommendationMode);
  const cheapest = ranking.cheapestMode;
  const fastest = ranking.fastestMode;

  const bestDetail = bestMode
    ? `${bestMode.cost}${bestMode.time !== 'Check route' && bestMode.time !== 'Check app' ? ` · ${bestMode.time}` : ''}`
    : driveTimeLabel
      ? `Compare modes · drive ~${driveTimeLabel}`
      : 'Open details below to compare modes';

  const cheapestDetail = cheapest
    ? cheapest.key === 'transit' && typeof cheapest.minutes === 'number'
      ? `$${Math.round(cheapest.cost)} est.`
      : `$${Math.round(cheapest.cost)} est.`
    : undefined;

  const fastestDetail =
    fastest && fastest.minutes > 0
      ? fastest.minutes < 60
        ? `${Math.round(fastest.minutes)} min`
        : `${Math.floor(fastest.minutes / 60)}h ${Math.round(fastest.minutes % 60)}m`
      : driveTimeLabel && !fastest
        ? `Drive ~${driveTimeLabel}`
        : undefined;

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard
          label="Best overall"
          value={bestMode ? modeLabel(bestMode.key) : 'Compare options'}
          detail={bestDetail}
        />
        <SummaryCard
          label="Cheapest"
          value={cheapest ? modeLabel(cheapest.key) : 'Check options'}
          detail={cheapestDetail}
        />
        <SummaryCard
          label="Fastest"
          value={fastest ? modeLabel(fastest.key) : driveTimeLabel ? 'Drive' : 'Check options'}
          detail={fastestDetail}
        />
        <SummaryCard
          label="Parking outlook"
          value={parkingOutlook.headline}
          detail={parkingOutlook.reason}
        />
      </div>

      {ranking.cheapestVsBestNote ? (
        <p className="mt-2 text-sm text-muted-foreground">{ranking.cheapestVsBestNote}</p>
      ) : null}

      {backupRoutingUsed ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Backup routing source used. Open directions to confirm.
        </p>
      ) : null}
    </div>
  );
}
