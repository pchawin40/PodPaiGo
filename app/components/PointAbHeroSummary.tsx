'use client';

import type { PointAbRankingResult } from '../../lib/parking/pointAbRanking';
import type { ParkingOutlookPresentation } from '../../lib/parking/parkingOutlook';

type PointAbHeroSummaryProps = {
  ranking: PointAbRankingResult;
  parkingOutlook: ParkingOutlookPresentation;
  className?: string;
};

function modeLabel(key: string): string {
  switch (key) {
    case 'parking':
      return 'Drive + park';
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
  className = '',
}: PointAbHeroSummaryProps) {
  const bestMode = ranking.modes.find((mode) => mode.key === ranking.recommendationMode);
  const cheapest = ranking.cheapestMode;
  const fastest = ranking.fastestMode;

  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${className}`}>
      <SummaryCard
        label="Best"
        value={bestMode ? modeLabel(bestMode.key) : 'Compare options'}
        detail={
          bestMode
            ? `${bestMode.cost} · ${bestMode.time}`
            : 'Open details below to compare modes'
        }
      />
      <SummaryCard
        label="Cheapest"
        value={cheapest ? modeLabel(cheapest.key) : 'Check options'}
        detail={cheapest ? `$${Math.round(cheapest.cost)} est.` : undefined}
      />
      <SummaryCard
        label="Fastest"
        value={fastest ? modeLabel(fastest.key) : 'Check options'}
        detail={
          fastest
            ? fastest.minutes < 60
              ? `${Math.round(fastest.minutes)} min`
              : `${Math.floor(fastest.minutes / 60)}h ${Math.round(fastest.minutes % 60)}m`
            : undefined
        }
      />
      <SummaryCard
        label="Parking outlook"
        value={parkingOutlook.title}
        detail={parkingOutlook.hints[0] || parkingOutlook.verifyNotice}
      />
    </div>
  );
}
