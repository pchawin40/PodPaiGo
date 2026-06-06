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
  parkingBufferMinutes?: number | null;
  airportBufferMinutes?: number | null;
  transportMode?: AirportDayTransportMode;
  shuttleWalkMinutes?: number | null;
  parkingPickName?: string | null;
  /** When set, lot arrival is anchored to this time instead of leave + drive. */
  parkingCheckInTime?: string | null;
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
  const parkingBufferMinutes =
    typeof input.parkingBufferMinutes === 'number' && input.parkingBufferMinutes > 0
      ? input.parkingBufferMinutes
      : null;
  const shuttleMinutes =
    typeof input.shuttleWalkMinutes === 'number' && input.shuttleWalkMinutes > 0
      ? input.shuttleWalkMinutes
      : null;
  const parkingCheckIn = input.parkingCheckInTime?.trim() || null;
  const resolvedTravelMinutes =
    travelMinutes ??
    (leaveBy && parkingCheckIn
      ? (() => {
          const leaveMin = parseTimeToMinutes(leaveBy);
          const checkInMin = parseTimeToMinutes(parkingCheckIn);
          if (leaveMin == null || checkInMin == null) return null;
          const diff = checkInMin - leaveMin;
          return diff > 0 ? diff : null;
        })()
      : null);

  milestones.push({
    id: 'leave-home',
    label: 'Leave home',
    timeLabel: leaveBy ? formatDisplayTime(leaveBy) : null,
    detail: leaveBy ? 'Recommended leave-by time' : 'Set trip timing to estimate leave-by',
    estimated: !leaveBy,
  });

  if (parkingCheckIn || (leaveBy && resolvedTravelMinutes != null)) {
    const arriveTime =
      parkingCheckIn ||
      (leaveBy && resolvedTravelMinutes != null
        ? addMinutesToTime(leaveBy, resolvedTravelMinutes)
        : null);
    milestones.push({
      id: 'arrive-access',
      label: arriveLabel(input.transportMode ?? 'parking'),
      timeLabel: arriveTime ? formatDisplayTime(arriveTime) : null,
      detail:
        input.transportMode === 'parking' && input.parkingPickName
          ? input.parkingPickName
          : resolvedTravelMinutes != null
            ? `${resolvedTravelMinutes} min travel estimate`
            : 'Travel time estimate unavailable',
      estimated: !parkingCheckIn,
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
      parkingCheckIn ||
      (leaveBy && resolvedTravelMinutes != null
        ? addMinutesToTime(leaveBy, resolvedTravelMinutes)
        : null);
    const parkingReadyTime =
      arriveTime && parkingBufferMinutes != null
        ? addMinutesToTime(arriveTime, parkingBufferMinutes)
        : arriveTime;
    const terminalTime =
      parkingReadyTime && shuttleMinutes != null
        ? addMinutesToTime(parkingReadyTime, shuttleMinutes)
        : parkingReadyTime && resolvedTravelMinutes != null
          ? addMinutesToTime(parkingReadyTime, Math.max(10, Math.round(resolvedTravelMinutes * 0.2)))
          : parkingReadyTime && parkingCheckIn
            ? addMinutesToTime(parkingReadyTime, 10)
            : null;

    milestones.push({
      id: 'park-check-in',
      label: 'Park / check in',
      timeLabel: parkingReadyTime ? formatDisplayTime(parkingReadyTime) : null,
      detail: parkingBufferMinutes
        ? `${parkingBufferMinutes} min to park, unload, and check in`
        : input.parkingPickName || 'Confirm parking reservation details',
      estimated: !parkingCheckIn,
    });

    milestones.push({
      id: 'terminal-access',
      label: 'Shuttle / walk to terminal',
      timeLabel: terminalTime ? formatDisplayTime(terminalTime) : null,
      detail: shuttleMinutes
        ? `${shuttleMinutes} min airport access estimate`
        : terminalTime
          ? 'Estimated terminal arrival'
          : 'Shuttle/walk estimate unavailable',
      estimated: !shuttleMinutes,
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
