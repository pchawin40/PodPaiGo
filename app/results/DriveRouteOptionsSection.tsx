'use client';

import { useState } from 'react';
import type { DriveRouteOption, DriveRoutePreferences } from '../../lib/types';
import {
  DRIVE_ROUTE_COPY,
  buildExpressLaneNote,
} from '../../lib/routes/driveRouteProfiles';

function formatDollars(value: number): string {
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}

function tollSummary(option: DriveRouteOption): string {
  if (option.profile === 'avoid_tolls') {
    return DRIVE_ROUTE_COPY.avoidsTolls;
  }

  if (option.profile !== 'toll_allowed') {
    return '';
  }

  if (!option.tollEstimated) {
    return DRIVE_ROUTE_COPY.tollPriceUnavailable;
  }

  if (
    typeof option.tollCostMin === 'number' &&
    typeof option.tollCostMax === 'number'
  ) {
    if (option.tollCostMin === option.tollCostMax) {
      return `${DRIVE_ROUTE_COPY.tollPossible} · ~${formatDollars(option.tollCostMin)}`;
    }
    return `${DRIVE_ROUTE_COPY.tollPossible} · ~${formatDollars(option.tollCostMin)}–${formatDollars(option.tollCostMax)}`;
  }

  return DRIVE_ROUTE_COPY.tollPossible;
}

export default function DriveRouteOptionsSection({
  options,
  prefs,
}: {
  options?: DriveRouteOption[];
  prefs?: DriveRoutePreferences | null;
}) {
  const [open, setOpen] = useState(false);

  if (!options || options.length === 0) return null;

  const expressLaneNote =
    options.find((option) => option.expressLaneNote)?.expressLaneNote ||
    buildExpressLaneNote(prefs);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">
          Drive route options
        </span>
        <span className="text-xs font-medium text-slate-500">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => {
              const summary = tollSummary(option);
              return (
                <li
                  key={option.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    {option.label}
                    {index === 0 && (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        Best overall
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-600">
                    {Math.round(option.durationMinutes)} min
                    {summary ? ` · ${summary}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>

          {expressLaneNote && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {expressLaneNote}
            </p>
          )}

          <p className="mt-2 text-[11px] text-slate-400">
            Toll prices and HOV/express lane access are estimates. Confirm in
            your map app before you drive.
          </p>
        </div>
      )}
    </section>
  );
}
