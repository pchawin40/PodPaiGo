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

/** Desktop compare table uses md+ breakpoint; mobile cards use md:hidden. */
export const COMPARE_OPTIONS_DESKTOP_BREAKPOINT = 'md' as const;

export const OPTION_COMPARISON_GRID_CLASS =
  'md:grid-cols-[minmax(220px,1.6fr)_120px_90px_90px_minmax(180px,1fr)_110px]';

const MOBILE_ACTION_CLASS =
  'inline-flex min-h-7 w-fit max-w-full items-center justify-center rounded-full px-3 text-center text-xs font-semibold leading-tight whitespace-normal';

const DESKTOP_ACTION_CLASS =
  'inline-flex min-h-7 w-full items-center justify-center rounded-full px-2.5 text-center text-xs font-semibold leading-tight whitespace-normal md:w-auto';

const DETAILS_LINK_CLASS = `${DESKTOP_ACTION_CLASS} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800`;

const PRIMARY_LINK_CLASS = `${DESKTOP_ACTION_CLASS} border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10`;

const MOBILE_DETAILS_LINK_CLASS = `${MOBILE_ACTION_CLASS} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800`;

const MOBILE_PRIMARY_LINK_CLASS = `${MOBILE_ACTION_CLASS} border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10`;

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

type ResolvedVisibleAction = {
  action: DestinationModeAction;
  isDetailsAction: boolean;
  label: string;
  desktopClassName: string;
  mobileClassName: string;
  href?: string;
};

function resolveVisibleAction({
  actions,
  unavailable,
}: {
  actions?: DestinationModeAction[];
  unavailable?: boolean;
}): ResolvedVisibleAction | null {
  const detailsActionObj = actions?.find((a) =>
    a.label === 'Details' || a.label === 'Why unavailable' || a.label === 'See why unavailable',
  );
  const nonDetailsActions = actions?.filter((a) => a !== detailsActionObj) ?? [];
  const primaryAction = nonDetailsActions[0];
  const visibleAction = detailsActionObj ?? primaryAction;
  if (!visibleAction) return null;

  const isDetailsAction = visibleAction === detailsActionObj;
  const href = isDetailsAction
    ? detailsActionObj?.ariaControls
      ? `#${detailsActionObj.ariaControls}`
      : detailsActionObj?.href
    : visibleAction.href;

  return {
    action: visibleAction,
    isDetailsAction,
    label: unavailable ? 'Why?' : compactActionLabel(visibleAction.label),
    desktopClassName: unavailable ? DETAILS_LINK_CLASS : PRIMARY_LINK_CLASS,
    mobileClassName: unavailable ? MOBILE_DETAILS_LINK_CLASS : MOBILE_PRIMARY_LINK_CLASS,
    href,
  };
}

function ModeIcon({ label }: { label: string }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-base"
      aria-hidden="true"
    >
      {modeIcon(label)}
    </div>
  );
}

function OptionComparisonAction({
  isHidden,
  onShowParkingAnyway,
  visibleAction,
  detailsActionObj,
  variant,
}: {
  isHidden: boolean;
  onShowParkingAnyway?: () => void;
  visibleAction: ResolvedVisibleAction | null;
  detailsActionObj?: DestinationModeAction;
  variant: 'mobile' | 'desktop';
}) {
  const showParkingClass = variant === 'mobile' ? MOBILE_DETAILS_LINK_CLASS : DETAILS_LINK_CLASS;

  if (isHidden) {
    return onShowParkingAnyway ? (
      <button type="button" onClick={onShowParkingAnyway} className={showParkingClass}>
        Show parking anyway
      </button>
    ) : null;
  }

  if (!visibleAction) return null;

  const { action, isDetailsAction, label, desktopClassName, mobileClassName, href } = visibleAction;
  const className = variant === 'mobile' ? mobileClassName : desktopClassName;

  if (isDetailsAction && href) {
    return (
      <a
        href={href}
        onClick={(event) => {
          if (action.onClick) {
            event.preventDefault();
            action.onClick();
          }
        }}
        aria-controls={detailsActionObj?.ariaControls}
        className={className}
      >
        {label}
      </a>
    );
  }

  if (action.href) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      aria-controls={detailsActionObj?.ariaControls}
      className={action.disabled ? `${className} cursor-not-allowed opacity-60` : className}
    >
      {label}
    </button>
  );
}

type CompareOptionPresentation = {
  label: string;
  name: string;
  cost: string;
  costNote?: string;
  time: string;
  caveat: string;
  isHidden: boolean;
  badgeStatus?: RecommendationStatus;
  badgeVerdict?: string;
  unavailable?: boolean;
  sort?: 'easiest' | 'cheapest' | 'fastest';
  isCheapestMode?: boolean;
  isFastestMode?: boolean;
};

export function CompareOptionsDesktopHeader({ className = '' }: { className?: string }) {
  return (
    <div
      className={`mt-2 hidden w-full max-w-full min-w-0 gap-x-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid ${OPTION_COMPARISON_GRID_CLASS}${className ? ` ${className}` : ''}`}
      data-testid="compare-options-desktop-header"
    >
      <span>Option</span>
      <span>Status</span>
      <span>Cost</span>
      <span>Time</span>
      <span>Note</span>
      <span className="text-right">Action</span>
    </div>
  );
}

function MobileCompareOptionCard({
  presentation,
  visibleAction,
  detailsActionObj,
  onShowParkingAnyway,
}: {
  presentation: CompareOptionPresentation;
  visibleAction: ResolvedVisibleAction | null;
  detailsActionObj?: DestinationModeAction;
  onShowParkingAnyway?: () => void;
}) {
  const { label, name, cost, costNote, time, caveat, isHidden, badgeStatus, badgeVerdict, unavailable, sort, isCheapestMode, isFastestMode } =
    presentation;

  return (
    <div
      className="flex w-full max-w-full min-w-0 flex-col gap-2 md:hidden"
      data-testid="option-comparison-mobile-card"
    >
      <div className="flex min-w-0 items-start gap-3">
        <ModeIcon label={label} />
        <div className={`min-w-0 flex-1${isHidden ? ' text-muted-foreground' : ''}`}>
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div
              className={`min-w-0 flex-1 break-words text-sm font-semibold leading-snug ${isHidden ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {label}
            </div>
            <div className="shrink-0">
              <RecommendationStatusBadge
                status={badgeStatus}
                verdict={badgeVerdict}
                unavailable={unavailable}
                sort={sort}
                isCheapestMode={isHidden ? false : isCheapestMode}
                isFastestMode={isHidden ? false : isFastestMode}
              />
            </div>
          </div>
          {!unavailable || !/not confirmed|not available|unavailable/i.test(name) ? (
            <div className="mt-0.5 min-w-0 text-xs leading-4 text-muted-foreground">
              <span className="line-clamp-2 break-words">{name}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 break-words text-xs leading-5">
        <span className="font-semibold text-foreground">{cost}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-semibold text-foreground">{time}</span>
      </div>

      {costNote ? (
        <div className="line-clamp-1 break-words text-[11px] text-muted-foreground">{costNote}</div>
      ) : null}

      <div className="min-w-0 text-xs leading-5 text-muted-foreground">
        <span className="line-clamp-2 break-words">{caveat}</span>
      </div>

      <div className="min-w-0 max-w-full pb-1 pr-2" data-testid="option-comparison-actions">
        <OptionComparisonAction
          isHidden={isHidden}
          onShowParkingAnyway={onShowParkingAnyway}
          visibleAction={visibleAction}
          detailsActionObj={detailsActionObj}
          variant="mobile"
        />
      </div>
    </div>
  );
}

function DesktopCompareOptionRow({
  presentation,
  visibleAction,
  detailsActionObj,
  onShowParkingAnyway,
  footer,
}: {
  presentation: CompareOptionPresentation;
  visibleAction: ResolvedVisibleAction | null;
  detailsActionObj?: DestinationModeAction;
  onShowParkingAnyway?: () => void;
  footer?: ReactNode;
}) {
  const { label, name, cost, costNote, time, caveat, isHidden, badgeStatus, badgeVerdict, unavailable, sort, isCheapestMode, isFastestMode } =
    presentation;

  return (
    <div
      className={`hidden w-full max-w-full min-w-0 gap-x-3 md:grid md:items-center ${OPTION_COMPARISON_GRID_CLASS}`}
      data-testid="option-comparison-row"
    >
      <div className="flex min-w-0 gap-3 md:items-center">
        <ModeIcon label={label} />
        <div className={`min-w-0 flex-1 md:self-center${isHidden ? ' text-muted-foreground' : ''}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div
              className={`min-w-0 truncate text-sm font-semibold ${isHidden ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {label}
            </div>
          </div>

          <div className="mt-0.5 min-w-0 text-xs leading-4 text-muted-foreground">
            <span className="line-clamp-1 break-words">{name}</span>
          </div>

          {costNote ? (
            <div className="mt-0.5 line-clamp-1 break-words text-[11px] text-muted-foreground">
              {costNote}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 justify-self-start md:flex md:items-center md:self-center">
        <RecommendationStatusBadge
          status={badgeStatus}
          verdict={badgeVerdict}
          unavailable={unavailable}
          sort={sort}
          isCheapestMode={isHidden ? false : isCheapestMode}
          isFastestMode={isHidden ? false : isFastestMode}
        />
      </div>

      <div className="min-w-0 break-words text-xs font-semibold tabular-nums text-foreground md:flex md:items-center md:self-center">
        {cost}
      </div>

      <div className="min-w-0 break-words text-xs font-semibold tabular-nums text-foreground md:flex md:items-center md:self-center">
        {time}
      </div>

      <div className="min-w-0 text-xs leading-tight text-muted-foreground md:flex md:items-center md:self-center">
        <span className="line-clamp-1 break-words">{caveat}</span>
      </div>

      <div
        className="flex w-full min-w-0 md:min-w-14 md:items-center md:justify-end md:self-center"
        data-testid="option-comparison-actions-desktop"
      >
        <OptionComparisonAction
          isHidden={isHidden}
          onShowParkingAnyway={onShowParkingAnyway}
          visibleAction={visibleAction}
          detailsActionObj={detailsActionObj}
          variant="desktop"
        />
      </div>

      {footer ? <div className="md:col-start-2 md:col-span-2">{footer}</div> : null}
    </div>
  );
}

export default function OptionComparisonCard({
  confidence: _confidence,
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
  const visibleAction = resolveVisibleAction({ actions, unavailable });

  const cardClassName =
    'relative h-full w-full max-w-full min-h-[4.75rem] min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 text-left shadow-sm transition ' +
    (isHidden
      ? 'border-border bg-muted/60 opacity-75'
      : unavailable
        ? 'border-border bg-muted/60 opacity-80'
        : selected
          ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/20'
          : 'border-border bg-card') +
    (visibleAction && !isHidden ? ' cursor-pointer hover:border-primary/30 hover:bg-muted/30' : '') +
    (className ? ` ${className}` : '');

  const presentation: CompareOptionPresentation = {
    label,
    name,
    cost,
    costNote,
    time,
    caveat: compactCaveat({ isHidden, unavailable, name, reason, cons }),
    isHidden,
    badgeStatus: isHidden ? 'hidden_by_preference' : status,
    badgeVerdict: isHidden ? 'Hidden by preference' : verdict,
    unavailable,
    sort,
    isCheapestMode,
    isFastestMode,
  };

  return (
    <div className={cardClassName} role="group" aria-label={`${label} recommendation`}>
      <MobileCompareOptionCard
        presentation={presentation}
        visibleAction={visibleAction}
        detailsActionObj={detailsActionObj}
        onShowParkingAnyway={onShowParkingAnyway}
      />
      <DesktopCompareOptionRow
        presentation={presentation}
        visibleAction={visibleAction}
        detailsActionObj={detailsActionObj}
        onShowParkingAnyway={onShowParkingAnyway}
        footer={footer}
      />
    </div>
  );
}
