'use client';

import type { AirportDayTimelineMilestone } from '../../lib/airports/airportDayTimeline';

type AirportDayTimelineProps = {
  milestones: AirportDayTimelineMilestone[];
  className?: string;
};

export default function AirportDayTimeline({
  milestones,
  className = '',
}: AirportDayTimelineProps) {
  if (milestones.length === 0) return null;

  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        Airport day timeline
      </div>
      <ol className="mt-3 space-y-0">
        {milestones.map((milestone, index) => (
          <li key={milestone.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < milestones.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 bottom-0 w-px bg-white/15"
              />
            ) : null}
            <span
              aria-hidden
              className="relative z-10 mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-sky-100"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-medium text-white">{milestone.label}</div>
                <div className="text-sm font-semibold text-sky-100">
                  {milestone.timeLabel || 'TBD'}
                  {milestone.estimated ? (
                    <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      estimated
                    </span>
                  ) : null}
                </div>
              </div>
              {milestone.detail ? (
                <p className="mt-0.5 text-xs leading-5 text-slate-400">{milestone.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type { AirportDayTimelineMilestone };
