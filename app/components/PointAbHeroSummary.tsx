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
    case 'drive':
      return 'Drive';
    case 'destination-customer':
      return 'Customer parking';
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
  highlight = false,
  tag,
}: {
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
  tag?: string;
}) {
  return (
    <div
      className={
        'min-w-0 overflow-hidden rounded-xl border p-3 shadow-sm ' +
        (highlight
          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/15'
          : 'border-border bg-card/80')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="line-clamp-2 break-words text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {tag ? (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            {tag}
          </span>
        ) : null}
      </div>
      <div className="mt-1 line-clamp-2 break-words text-sm font-semibold text-foreground">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{detail}</div>
      ) : null}
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
  const bestOverallKey =
    ranking.canonicalWinners.bestOverallWinner ?? ranking.displayRecommendationMode;
  const bestMode = ranking.modes.find((mode) => mode.key === bestOverallKey);
  const cheapest = ranking.cheapestMode;
  const fastest = ranking.fastestMode;

  const bestModeHasSpecificTime =
    bestMode?.time &&
    bestMode.time !== 'Check route' &&
    bestMode.time !== 'Check app' &&
    bestMode.time !== 'Open app';

  const bestDetail = bestMode
    ? `${bestMode.cost}${bestModeHasSpecificTime ? ` · ${bestMode.time}` : ''}`
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

  const bestLabel = bestMode ? modeLabel(bestMode.key) : null;

  return (
    <div className={className}>
      {bestLabel ? (
        <p className="mb-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Our pick: {bestLabel}.</span> Compare the
          cheapest and fastest options below.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard
          label="Best overall"
          value={bestMode ? modeLabel(bestMode.key) : 'Compare options'}
          detail={bestDetail}
          highlight={Boolean(bestMode)}
          tag={bestMode ? 'Our pick' : undefined}
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
