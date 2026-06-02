export type AirportDayTransportMode = 'parking' | 'rideshare' | 'transit' | null;

export type AirportDayTimelineMilestone = {
  id: string;
  label: string;
  timeLabel: string | null;
  detail?: string | null;
  estimated: boolean;
};

export type AirportDayTimelineInput = {
  leaveByTime?: string | null;
  departureTime?: string | null;
  travelMinutes?: number | null;
  airportBufferMinutes?: number | null;
  transportMode?: AirportDayTransportMode;
  shuttleWalkMinutes?: number | null;
  parkingPickName?: string | null;
};

function parseTimeToMinutes(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addMinutesToTime(time: string, minutes: number): string | null {
  const base = parseTimeToMinutes(time);
  if (base == null) return null;
  return minutesToTimeString(base + minutes);
}

function subtractMinutesFromTime(time: string, minutes: number): string | null {
  return addMinutesToTime(time, -minutes);
}

function formatDisplayTime(time: string | null): string | null {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;

  const hour = Number(match[1]);
  const minute = match[2];
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${meridiem}`;
}

function arriveLabel(mode: AirportDayTransportMode): string {
  if (mode === 'rideshare') return 'Arrive at rideshare drop-off';
  if (mode === 'transit') return 'Arrive at transit station';
  return 'Arrive at parking / pickup point';
}

export function buildAirportDayTimeline(input: AirportDayTimelineInput): AirportDayTimelineMilestone[] {
  const milestones: AirportDayTimelineMilestone[] = [];
  const leaveBy = input.leaveByTime?.trim() || null;
  const departure = input.departureTime?.trim() || null;
  const travelMinutes =
    typeof input.travelMinutes === 'number' && input.travelMinutes > 0
      ? input.travelMinutes
      : null;
  const bufferMinutes =
    typeof input.airportBufferMinutes === 'number' && input.airportBufferMinutes > 0
      ? input.airportBufferMinutes
      : null;
  const shuttleMinutes =
    typeof input.shuttleWalkMinutes === 'number' && input.shuttleWalkMinutes > 0
      ? input.shuttleWalkMinutes
      : null;

  milestones.push({
    id: 'leave-home',
    label: 'Leave home',
    timeLabel: leaveBy ? formatDisplayTime(leaveBy) : null,
    detail: leaveBy ? 'Recommended leave-by time' : 'Set trip timing to estimate leave-by',
    estimated: !leaveBy,
  });

  if (leaveBy && travelMinutes != null) {
    milestones.push({
      id: 'arrive-access',
      label: arriveLabel(input.transportMode ?? 'parking'),
      timeLabel: formatDisplayTime(addMinutesToTime(leaveBy, travelMinutes)),
      detail:
        input.transportMode === 'parking' && input.parkingPickName
          ? input.parkingPickName
          : `${travelMinutes} min travel estimate`,
      estimated: true,
    });
  } else {
    milestones.push({
      id: 'arrive-access',
      label: arriveLabel(input.transportMode ?? 'parking'),
      timeLabel: null,
      detail: 'Travel time estimate unavailable',
      estimated: true,
    });
  }

  if (input.transportMode === 'parking') {
    const arriveTime =
      leaveBy && travelMinutes != null ? addMinutesToTime(leaveBy, travelMinutes) : null;
    const terminalTime =
      arriveTime && shuttleMinutes != null
        ? addMinutesToTime(arriveTime, shuttleMinutes)
        : arriveTime && travelMinutes != null
          ? addMinutesToTime(arriveTime, Math.max(10, Math.round(travelMinutes * 0.2)))
          : null;

    milestones.push({
      id: 'terminal-access',
      label: 'Shuttle / walk to terminal',
      timeLabel: terminalTime ? formatDisplayTime(terminalTime) : null,
      detail: shuttleMinutes
        ? `${shuttleMinutes} min airport access estimate`
        : 'Estimated terminal arrival',
      estimated: true,
    });
  }

  milestones.push({
    id: 'security-target',
    label: 'Security target',
    timeLabel:
      departure && bufferMinutes != null
        ? formatDisplayTime(subtractMinutesFromTime(departure, bufferMinutes))
        : null,
    detail: bufferMinutes ? `${bufferMinutes} min airport buffer` : 'Airport buffer estimate',
    estimated: !(departure && bufferMinutes != null),
  });

  milestones.push({
    id: 'boarding-target',
    label: 'Boarding target',
    timeLabel: departure ? formatDisplayTime(subtractMinutesFromTime(departure, 30)) : null,
    detail: 'Estimated boarding window',
    estimated: true,
  });

  milestones.push({
    id: 'flight-departure',
    label: 'Flight departure',
    timeLabel: departure ? formatDisplayTime(departure) : null,
    detail: departure ? 'Scheduled departure' : 'Add departure time to complete timeline',
    estimated: !departure,
  });

  return milestones;
}
