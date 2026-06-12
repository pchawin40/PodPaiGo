'use client';

import { useMemo } from 'react';
import {
  buildAirportDayTimeline,
  type AirportDayTransportMode,
} from '../../../lib/airports/airportDayTimeline';
import ExpandableSection from '../ui/ExpandableSection';
import AirportDayTimeline from '../AirportDayTimeline';

type CompactTripTimelineProps = {
  leaveByTime?: string | null;
  departureTime?: string | null;
  travelMinutes?: number | null;
  parkingBufferMinutes?: number | null;
  airportBufferMinutes?: number | null;
  transportMode?: AirportDayTransportMode | null;
  shuttleWalkMinutes?: number | null;
  parkingPickName?: string | null;
  parkingCheckInTime?: string | null;
  className?: string;
};

function compactSummary(milestones: ReturnType<typeof buildAirportDayTimeline>): string {
  return milestones
    .slice(0, 5)
    .map((step) => `${step.timeLabel || 'TBD'} ${step.label}`)
    .join(' → ');
}

export default function CompactTripTimeline({
  leaveByTime,
  departureTime,
  travelMinutes,
  parkingBufferMinutes,
  airportBufferMinutes,
  transportMode = null,
  shuttleWalkMinutes,
  parkingPickName,
  parkingCheckInTime,
  className = '',
}: CompactTripTimelineProps) {
  const milestones = useMemo(
    () =>
      buildAirportDayTimeline({
        leaveByTime,
        departureTime,
        travelMinutes,
        parkingBufferMinutes,
        airportBufferMinutes,
        transportMode,
        shuttleWalkMinutes,
        parkingPickName,
        parkingCheckInTime,
      }),
    [
      leaveByTime,
      departureTime,
      travelMinutes,
      parkingBufferMinutes,
      airportBufferMinutes,
      transportMode,
      shuttleWalkMinutes,
      parkingPickName,
      parkingCheckInTime,
    ],
  );

  if (milestones.length === 0) return null;

  const summary = compactSummary(milestones);

  return (
    <div className={className} data-testid="compact-trip-timeline">
      <ExpandableSection title="Timeline" summary={summary}>
        <AirportDayTimeline milestones={milestones} showHeading={false} variant="inline" />
      </ExpandableSection>
    </div>
  );
}
