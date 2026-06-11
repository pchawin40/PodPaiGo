'use client';

import type { ReactNode } from 'react';
import RecommendationStatusBadge from './RecommendationStatusBadge';
import type { DestinationModeAction } from '../results/DestinationModeActions';
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

export const OPTION_COMPARISON_GRID_CLASS =
  'sm:grid-cols-[minmax(220px,1.6fr)_120px_90px_90px_minmax(180px,1fr)_110px]';

const DETAILS_LINK_CLASS =
  'inline-flex min-h-7 w-full items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 text-center text-xs font-semibold leading-tight whitespace-normal text-slate-800 hover:bg-slate-50 sm:w-auto dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

const PRIMARY_LINK_CLASS =
  'inline-flex min-h-7 w-full items-center justify-center rounded-full border border-primary/30 bg-primary/5 px-2.5 text-center text-xs font-semibold leading-tight text-primary hover:bg-primary/10 sm:w-auto';

function modeIcon(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes('ride') && !normalized.includes('rideshare')) return '🅿️';
  if (normalized.includes('rideshare') || normalized.includes('uber') || normalized.includes('lyft')) return '🚕';
  if (normalized.includes('transit')) return '🚆';
  if (normalized.includes('walk')) return '🚶';
  if (normalized.includes('street') || normalized.includes('meter')) return '🅿️';
  if (normalized.includes('parking') || normalized.includes('garage') || normalized.includes('lot')) return '🚗';
  if (normalized.includes('drive')) return '🚗';
  return '•';
}

function compactCaveat({
  isHidden,
  unavailable,
  name,
  reason,
  cons,
}: {
  isHidden: boolean;
  unavailable?: boolean;
  name: string;
  reason?: string;
  cons: string[];
}): string {
  if (isHidden) return 'Hidden by preference';
  if (unavailable && /not confirmed|not available|unavailable/i.test(name)) return name;
  return reason || cons[0] || 'Check details';
}

function compactActionLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes('why') || normalized.includes('unavailable')) return 'Why?';
  if (normalized.includes('show')) return 'Show';
  return 'View';
}

export default function OptionComparisonCard({
  confidence,
  label,
  name,
  cost,
  costNote,
  time,
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
  const isHidden = Boolean(hiddenByPreference);

  const detailsActionObj = actions?.find((a) =>
    a.label === 'Details' || a.label === 'Why unavailable' || a.label === 'See why unavailable',
  );
  const nonDetailsActions = actions?.filter((a) => a !== detailsActionObj) ?? [];
  const primaryAction = nonDetailsActions[0];
  const visibleAction = detailsActionObj ?? primaryAction;
  const visibleActionClass = unavailable ? DETAILS_LINK_CLASS : PRIMARY_LINK_CLASS;
  const visibleActionLabel = visibleAction ? (unavailable ? 'Why?' : compactActionLabel(visibleAction.label)) : null;

  const cardClassName =
    'relative h-full min-h-[4.75rem] rounded-xl border px-3 py-2.5 text-left shadow-sm transition ' +
    (isHidden
      ? 'border-border bg-muted/60 opacity-75'
      : unavailable
        ? 'border-border bg-muted/60 opacity-80'
        : selected
          ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/20'
          : 'border-border bg-card') +
    (visibleAction && !isHidden ? ' cursor-pointer hover:border-primary/30 hover:bg-muted/30' : '') +
    (className ? ` ${className}` : '');

  const badgeStatus = isHidden ? 'hidden_by_preference' : status;
  const badgeVerdict = isHidden ? 'Hidden by preference' : verdict;

  const detailsHref = detailsActionObj?.ariaControls
    ? `#${detailsActionObj.ariaControls}`
    : detailsActionObj?.href;
  const caveat = compactCaveat({ isHidden, unavailable, name, reason, cons });

  return (
    <div className={cardClassName} role="group" aria-label={`${label} recommendation`}>
      <div
        className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 sm:items-center ${OPTION_COMPARISON_GRID_CLASS}`}
        data-testid="option-comparison-row"
      >
        <div className="flex min-w-0 gap-3 sm:items-center">
          <div
            className="flex h-8 w-8 shrink-0 self-start items-center justify-center rounded-full border border-border bg-card text-base sm:self-center"
            aria-hidden="true"
          >
            {modeIcon(label)}
          </div>
          <div className={`min-w-0 flex-1 sm:self-center${isHidden ? ' text-muted-foreground' : ''}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <div className={`min-w-0 truncate text-sm font-semibold ${isHidden ? 'text-muted-foreground' : 'text-foreground'}`}>
                {label}
              </div>
            </div>

            <div className="mt-0.5 min-w-0 text-xs leading-4 text-muted-foreground">
              <span className="line-clamp-1 break-words">{name}</span>
            </div>

            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-5 sm:hidden">
              <span className="font-semibold text-foreground">{cost}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold text-foreground">{time}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{badgeVerdict || confidence}</span>
            </div>

            {costNote ? (
              <div className="mt-0.5 line-clamp-1 break-words text-[11px] text-muted-foreground">
                {costNote}
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden min-w-0 justify-self-start sm:flex sm:items-center sm:self-center">
          <RecommendationStatusBadge
            status={badgeStatus}
            verdict={badgeVerdict}
            unavailable={unavailable}
            sort={sort}
            isCheapestMode={isHidden ? false : isCheapestMode}
            isFastestMode={isHidden ? false : isFastestMode}
          />
        </div>

        <div className="hidden min-w-0 break-words text-xs font-semibold tabular-nums text-foreground sm:flex sm:items-center sm:self-center">
          {cost}
        </div>

        <div className="hidden min-w-0 break-words text-xs font-semibold tabular-nums text-foreground sm:flex sm:items-center sm:self-center">
          {time}
        </div>

        <div className="col-span-2 min-w-0 text-xs leading-5 text-muted-foreground sm:col-span-1 sm:flex sm:items-center sm:self-center sm:leading-tight">
          <span className="line-clamp-2 break-words sm:line-clamp-1">{caveat}</span>
        </div>

        <div
          className="col-span-2 flex w-full gap-2 sm:col-span-1 sm:w-auto sm:min-w-14 sm:items-center sm:justify-end sm:self-center"
          data-testid="option-comparison-actions"
        >
          {isHidden ? (
            onShowParkingAnyway ? (
              <button
                type="button"
                onClick={onShowParkingAnyway}
                className={DETAILS_LINK_CLASS}
              >
                Show parking anyway
              </button>
            ) : null
          ) : visibleAction ? (
            visibleAction === detailsActionObj && detailsHref ? (
                <a
                  href={detailsHref}
                  onClick={(event) => {
                    if (detailsActionObj?.onClick) {
                      event.preventDefault();
                      detailsActionObj.onClick();
                    }
                  }}
                  aria-controls={detailsActionObj?.ariaControls}
                  className={visibleActionClass}
                >
                  {visibleActionLabel}
                </a>
            ) : visibleAction.href ? (
              <a
                href={visibleAction.href}
                target="_blank"
                rel="noopener noreferrer"
                className={visibleActionClass}
              >
                {visibleActionLabel}
              </a>
            ) : (
                <button
                  type="button"
                  onClick={visibleAction.onClick}
                  disabled={visibleAction.disabled}
                  aria-controls={detailsActionObj?.ariaControls}
                  className={
                    visibleAction.disabled
                      ? visibleActionClass + ' cursor-not-allowed opacity-60'
                      : visibleActionClass
                  }
                >
                  {visibleActionLabel}
                </button>
            )
          ) : null}
        </div>

        {footer ? (
          <div className="col-span-2 sm:col-start-2 sm:col-span-2">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
