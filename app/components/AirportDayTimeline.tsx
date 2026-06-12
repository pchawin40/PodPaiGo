'use client';

import type { AirportDayTimelineMilestone } from '../../lib/airports/airportDayTimeline';

type AirportDayTimelineProps = {
  milestones: AirportDayTimelineMilestone[];
  className?: string;
  showHeading?: boolean;
  /** `sidebar` = dark card styling; `inline` = light results-page styling */
  variant?: 'sidebar' | 'inline';
};

export default function AirportDayTimeline({
  milestones,
  className = '',
  showHeading = true,
  variant = 'sidebar',
}: AirportDayTimelineProps) {
  if (milestones.length === 0) return null;

  const isInline = variant === 'inline';
  const rootClass = isInline ? 'ppg-inline-timeline' : 'ppg-sidebar-timeline';

  return (
    <div className={`${rootClass} ${className}`.trim()}>
      {showHeading ? (
        <div className={isInline ? 'ppg-inline-timeline-heading' : 'ppg-sidebar-timeline-heading'}>
          Airport day timeline
        </div>
      ) : null}
      <ol className={`space-y-0 ${showHeading ? 'mt-3' : ''}`}>
        {milestones.map((milestone, index) => (
          <li key={milestone.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < milestones.length - 1 ? (
              <span
                aria-hidden
                className={`absolute left-[11px] top-6 bottom-0 w-px ${
                  isInline ? 'ppg-inline-timeline-connector' : 'ppg-sidebar-timeline-connector'
                }`}
              />
            ) : null}
            <span
              aria-hidden
              className={`relative z-10 mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                isInline ? 'ppg-inline-timeline-badge' : 'ppg-sidebar-timeline-badge'
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className={isInline ? 'ppg-inline-timeline-label' : 'ppg-sidebar-timeline-label'}>
                  {milestone.label}
                </div>
                <div className={isInline ? 'ppg-inline-timeline-time' : 'ppg-sidebar-timeline-time'}>
                  {milestone.timeLabel || 'TBD'}
                  {milestone.estimated ? (
                    <span
                      className={
                        isInline ? 'ppg-inline-timeline-estimated' : 'ppg-sidebar-timeline-estimated'
                      }
                    >
                      estimated
                    </span>
                  ) : null}
                </div>
              </div>
              {milestone.detail ? (
                <p className={isInline ? 'ppg-inline-timeline-detail' : 'ppg-sidebar-timeline-detail'}>
                  {milestone.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type { AirportDayTimelineMilestone };
