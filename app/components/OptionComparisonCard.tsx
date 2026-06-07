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
  details?: ReactNode;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  footer?: ReactNode;
  className?: string;
};

export default function OptionComparisonCard({
  confidence,
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
  details,
  detailsOpen,
  onToggleDetails,
  footer,
  className = '',
}: OptionComparisonCardProps) {
  const cardClassName =
    'relative flex h-full flex-col rounded-2xl border p-4 pt-10 text-left shadow-sm transition ' +
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

      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {confidence} confidence
      </div>

      <div className="mt-3 text-sm font-bold text-foreground">{label}</div>

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
        <div>
          <span className="font-semibold text-foreground">Pros: </span>
          <span className="text-muted-foreground">{pros.join(', ')}</span>
        </div>
        <div>
          <span className="font-semibold text-foreground">Cons: </span>
          <span className="text-muted-foreground">{cons.join(', ')}</span>
        </div>
      </div>

      <div className="mt-auto">
        {actions && actions.length > 0 ? (
          <DestinationModeActions compact actions={actions} />
        ) : null}

        {details ? (
          <details
            className="mt-3 rounded-2xl border border-border bg-card/70"
            open={detailsOpen}
            onToggle={(event) => {
              if (onToggleDetails) {
                event.preventDefault();
                onToggleDetails();
              }
            }}
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-primary marker:hidden [&::-webkit-details-marker]:hidden">
              {detailsOpen ? 'Hide details' : 'Show details'}
            </summary>
            <div className="border-t border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
              {details}
            </div>
          </details>
        ) : null}

        {footer}
      </div>
    </div>
  );
}
