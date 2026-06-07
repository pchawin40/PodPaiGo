'use client';

import type { ReactNode } from 'react';
import RecommendationStatusBadge from './RecommendationStatusBadge';
import DestinationModeActions, {
  type DestinationModeAction,
} from '../results/DestinationModeActions';
import type { RecommendationStatus } from '../../lib/recommendationStatusBadge';

export type OptionComparisonCardProps = {
  confidence: string;
  label: string;
  name: string;
  cost: string;
  costNote?: string;
  time: string;
  pros: string[];
  cons: string[];
  status?: RecommendationStatus;
  verdict?: string;
  unavailable?: boolean;
  hiddenByPreference?: boolean;
  sort?: 'easiest' | 'cheapest' | 'fastest';
  isCheapestMode?: boolean;
  isFastestMode?: boolean;
  selected?: boolean;
  actions?: DestinationModeAction[];
  footer?: ReactNode;
  className?: string;
};

export default function OptionComparisonCard({
  label,
  name,
  cost,
  costNote,
  time,
  pros,
  cons,
  status,
  verdict,
  unavailable,
  hiddenByPreference,
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

  const cardClassName =
    'relative flex h-full min-h-[17.5rem] flex-col rounded-2xl border p-4 pt-10 text-left shadow-sm transition ' +
    (unavailable
      ? 'border-border bg-muted/60 opacity-80'
      : selected
        ? 'border-primary/50 bg-primary/10'
        : 'border-border bg-card') +
    (className ? ` ${className}` : '');

  return (
    <div className={cardClassName}>
      <div className="absolute right-3 top-3">
        <RecommendationStatusBadge
          status={status}
          verdict={verdict}
          unavailable={unavailable}
          sort={sort}
          isCheapestMode={isCheapestMode}
          isFastestMode={isFastestMode}
        />
      </div>

      <div className="text-sm font-bold text-foreground">{label}</div>

      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{name}</div>

      {hiddenByPreference ? (
        <div className="mt-2 text-xs leading-5 text-violet-800 dark:text-violet-200">
          Drive is cheaper, but hidden because you said no parking.
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-border bg-card/80 p-2">
          <div className="text-muted-foreground">Cost</div>
          <div className="mt-0.5 font-semibold text-foreground">{cost}</div>
          {costNote ? (
            <div className="mt-1 text-[11px] text-muted-foreground">{costNote}</div>
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-card/80 p-2">
          <div className="text-muted-foreground">Time</div>
          <div className="mt-0.5 font-semibold text-foreground">{time}</div>
        </div>
      </div>

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

      <div className="mt-auto pt-3">
        {actions && actions.length > 0 ? (
          <DestinationModeActions compact actions={actions} />
        ) : null}

        {footer}
      </div>
    </div>
  );
}
