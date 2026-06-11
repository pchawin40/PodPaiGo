'use client';

import type { ReactNode } from 'react';
import RecommendationStatusBadge from './RecommendationStatusBadge';
import DestinationModeActions, {
  type DestinationModeAction,
} from '../results/DestinationModeActions';
import type { RecommendationStatus } from '../../lib/recommendationStatusBadge';
import type { PointToPointTiming } from '../../lib/types';

type TimingBreakdownLabels = {
  drive?: string;
  parkingBuffer?: string;
  walk?: string;
  pickupWait?: string;
  total?: string;
  totalFirst?: boolean;
};

function timingMinutesLabel(minutes: number | null | undefined, total = false): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  if (!total || rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function buildTimingRows(
  timing: PointToPointTiming | null | undefined,
  labels: TimingBreakdownLabels | undefined,
): Array<{ label: string; value: string }> {
  if (!timing) return [];

  const detailRows = [
    { label: labels?.drive || 'Drive route', value: timingMinutesLabel(timing.driveMinutes) },
    {
      label: labels?.parkingBuffer || 'Access / verify',
      value: timingMinutesLabel(timing.parkingBufferMinutes),
    },
    {
      label: labels?.walk || 'Walk to destination',
      value: timingMinutesLabel(timing.walkToDestinationMinutes),
    },
    { label: labels?.pickupWait || 'Pickup wait', value: timingMinutesLabel(timing.pickupWaitMinutes) },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  const total = timingMinutesLabel(timing.totalOptionMinutes, true);
  if (total) {
    const totalRow = { label: labels?.total || 'Total to destination', value: total };
    const rows = labels?.totalFirst
      ? [totalRow, ...detailRows]
      : [...detailRows, totalRow];
    return rows.length >= 2 ? rows : [];
  }

  return detailRows.length >= 2 ? detailRows : [];
}

export type OptionComparisonCardProps = {
  confidence: string;
  label: string;
  name: string;
  cost: string;
  costNote?: string;
  time: string;
  timeLabel?: string;
  timing?: PointToPointTiming | null;
  timingBreakdownLabels?: TimingBreakdownLabels;
  pros: string[];
  cons: string[];
  reason?: string;
  status?: RecommendationStatus;
  verdict?: string;
  unavailable?: boolean;
  hiddenByPreference?: boolean;
  onShowParkingAnyway?: () => void;
  sort?: 'easiest' | 'cheapest' | 'fastest';
  isCheapestMode?: boolean;
  isFastestMode?: boolean;
  selected?: boolean;
  actions?: DestinationModeAction[];
  footer?: ReactNode;
  className?: string;
};

const DETAILS_LINK_CLASS =
  'flex w-full min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-center text-sm font-semibold leading-tight whitespace-normal text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export default function OptionComparisonCard({
  label,
  name,
  cost,
  costNote,
  time,
  timeLabel = 'Time',
  timing,
  timingBreakdownLabels,
  pros,
  cons,
  reason,
  status,
  verdict,
  unavailable,
  hiddenByPreference,
  onShowParkingAnyway,
  sort,
  isCheapestMode,
  isFastestMode,
  selected,
  actions,
  footer,
  className = '',
}: OptionComparisonCardProps) {
  const shortPro = pros[0] ?? '';
  const shortCon = cons[0] ?? '';
  const isHidden = Boolean(hiddenByPreference);

  const detailsActionObj = actions?.find((a) => a.label === 'Details' || a.label === 'Why unavailable');
  const nonDetailsActions = actions?.filter((a) => a !== detailsActionObj) ?? [];
  const primaryAction = nonDetailsActions[0];
  const hasDetailsToggle = Boolean(detailsActionObj);

  const cardClassName =
    'relative flex h-full min-h-[17.5rem] flex-col rounded-2xl border p-4 pt-10 text-left shadow-sm transition ' +
    (isHidden
      ? 'border-border bg-muted/60 opacity-75'
      : unavailable
        ? 'border-border bg-muted/60 opacity-80'
        : selected
          ? 'border-primary/50 bg-primary/10'
          : 'border-border bg-card') +
    (className ? ` ${className}` : '');

  const badgeStatus = isHidden ? 'hidden_by_preference' : status;
  const badgeVerdict = isHidden ? 'Hidden by preference' : verdict;
  const timingRows = isHidden ? [] : buildTimingRows(timing, timingBreakdownLabels);

  const showInlineDetails = !hasDetailsToggle && !isHidden;
  const detailsHref = detailsActionObj?.ariaControls
    ? `#${detailsActionObj.ariaControls}`
    : detailsActionObj?.href;
  const detailsLabel = detailsActionObj?.label || 'Details';

  return (
    <div className={cardClassName} role="group" aria-label={`${label} recommendation`}>
      <div className="absolute right-3 top-3">
        <RecommendationStatusBadge
          status={badgeStatus}
          verdict={badgeVerdict}
          unavailable={unavailable}
          sort={sort}
          isCheapestMode={isHidden ? false : isCheapestMode}
          isFastestMode={isHidden ? false : isFastestMode}
        />
      </div>

      <div className={`flex-1${isHidden ? ' text-muted-foreground' : ''}`}>
        <div className={`text-sm font-bold ${isHidden ? 'text-muted-foreground' : 'text-foreground'}`}>
          {label}
        </div>

        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{name}</div>

        {isHidden ? (
          <div className="mt-2 text-xs leading-5 text-muted-foreground">
            Hidden by your No parking needed preference.
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border bg-card/80 p-2">
            <div className="text-muted-foreground">Cost</div>
            <div className="mt-0.5 font-semibold text-foreground">{cost}</div>
            {costNote ? (
              <div className="mt-1 line-clamp-2 break-words text-[11px] text-muted-foreground">
                {costNote}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-card/80 p-2">
            <div className="text-muted-foreground">{timeLabel}</div>
            <div className="mt-0.5 font-semibold text-foreground">{time}</div>
          </div>
        </div>

        {!isHidden && reason ? (
          <div className="mt-2 text-xs text-muted-foreground">{reason}</div>
        ) : null}

        {showInlineDetails && timingRows.length > 0 ? (
          <div className="mt-2 rounded-xl border border-border bg-card/70 p-2 text-xs leading-5">
            {timingRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-semibold text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {showInlineDetails ? (
          <div className="mt-3 space-y-2 text-xs leading-5">
            {shortPro ? (
              <div>
                <span className="font-semibold text-foreground">Pro: </span>
                <span className="text-muted-foreground">{shortPro}</span>
              </div>
            ) : null}
            {shortCon ? (
              <div>
                <span className="font-semibold text-foreground">Con: </span>
                <span className="text-muted-foreground">{shortCon}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 pt-4">
        {isHidden ? (
          onShowParkingAnyway ? (
            <button
              type="button"
              onClick={onShowParkingAnyway}
              className="flex w-full min-h-10 items-center justify-center rounded-2xl border border-border bg-card px-4 text-center text-sm font-semibold leading-tight text-foreground hover:bg-muted/80"
            >
              Show parking anyway
            </button>
          ) : null
        ) : hasDetailsToggle ? (
          <>
            {primaryAction ? (
              <DestinationModeActions compact actions={[primaryAction]} />
            ) : null}
            {detailsHref ? (
              <a
                href={detailsHref}
                onClick={(event) => {
                  if (detailsActionObj?.onClick) {
                    event.preventDefault();
                    detailsActionObj.onClick();
                  }
                }}
                aria-controls={detailsActionObj?.ariaControls}
                className={DETAILS_LINK_CLASS}
              >
                {detailsLabel}
              </a>
            ) : (
              <button
                type="button"
                onClick={detailsActionObj?.onClick}
                aria-controls={detailsActionObj?.ariaControls}
                className={DETAILS_LINK_CLASS}
              >
                {detailsLabel}
              </button>
            )}
          </>
        ) : actions && actions.length > 0 ? (
          <DestinationModeActions compact actions={actions} />
        ) : null}

        {footer}
      </div>
    </div>
  );
}
