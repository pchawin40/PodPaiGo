import { SecurityOption } from '../types';

export type AirportSecurityEstimate = {
  label: string;
  selectedMinutes: number;
  fastestMinutes: number;
  selectedLineLabel: string;
  fastestLineLabel: string;
  note: string;
  supportsPreCheck: boolean;
  supportsClear: boolean;
  sourceName: string;
  isLive: boolean;
};

const DEFAULT_SMALL_AIRPORT_SECURITY: Record<string, Partial<AirportSecurityEstimate>> = {
  PAE: {
    label: 'Security',
    selectedMinutes: 8,
    fastestMinutes: 8,
    selectedLineLabel: 'Standard screening',
    fastestLineLabel: 'Standard screening',
    note: 'Smaller airport estimate. Confirm current security conditions with the airport or airline.',
    supportsPreCheck: false,
    supportsClear: false,
    sourceName: 'PodPaiGo estimate',
    isLive: false,
  },
  BLI: {
    selectedMinutes: 10,
    fastestMinutes: 10,
    selectedLineLabel: 'Standard screening',
    fastestLineLabel: 'Standard screening',
    note: 'Smaller airport estimate. Confirm current security conditions with the airport or airline.',
    supportsPreCheck: false,
    supportsClear: false,
    sourceName: 'PodPaiGo estimate',
    isLive: false,
  },
  GEG: {
    selectedMinutes: 15,
    fastestMinutes: 10,
    selectedLineLabel: 'Standard screening',
    fastestLineLabel: 'PreCheck if available',
    note: 'Airport security estimate. Confirm current security conditions before leaving.',
    supportsPreCheck: true,
    supportsClear: false,
    sourceName: 'PodPaiGo estimate',
    isLive: false,
  },
  PSC: {
    selectedMinutes: 10,
    fastestMinutes: 10,
    selectedLineLabel: 'Standard screening',
    fastestLineLabel: 'Standard screening',
    note: 'Smaller airport estimate. Confirm current security conditions with the airport or airline.',
    supportsPreCheck: false,
    supportsClear: false,
    sourceName: 'PodPaiGo estimate',
    isLive: false,
  },
  YKM: {
    selectedMinutes: 8,
    fastestMinutes: 8,
    selectedLineLabel: 'Standard screening',
    fastestLineLabel: 'Standard screening',
    note: 'Smaller airport estimate. Confirm current security conditions with the airport or airline.',
    supportsPreCheck: false,
    supportsClear: false,
    sourceName: 'PodPaiGo estimate',
    isLive: false,
  },
};

export function getAirportSecurityEstimate(
  airportCode: string,
  selectedSecurity: SecurityOption
): AirportSecurityEstimate {
  const code = airportCode.toUpperCase();

  if (code === 'SEA') {
    const laneMinutes: Record<SecurityOption, number> = {
      standard: 3,
      precheck: 3,
      clear: 3,
      'clear-precheck': 2,
    };

    const laneLabels: Record<SecurityOption, string> = {
      standard: 'Standard',
      precheck: 'PreCheck',
      clear: 'CLEAR',
      'clear-precheck': 'CLEAR + PreCheck',
    };

    const availableLanes: SecurityOption[] =
      selectedSecurity === 'clear-precheck'
        ? ['standard', 'precheck', 'clear', 'clear-precheck']
        : selectedSecurity === 'precheck'
          ? ['standard', 'precheck']
          : selectedSecurity === 'clear'
            ? ['standard', 'clear']
            : ['standard'];

    const fastestLane = availableLanes.reduce((best, lane) => {
      const laneIsFaster = laneMinutes[lane] < laneMinutes[best];
      const laneTiesSelected =
        laneMinutes[lane] === laneMinutes[best] && lane === selectedSecurity;

      return laneIsFaster || laneTiesSelected ? lane : best;
    }, availableLanes[0]);

    return {
      label: 'TSA',
      selectedMinutes: laneMinutes[selectedSecurity],
      fastestMinutes: laneMinutes[fastestLane],
      selectedLineLabel: laneLabels[selectedSecurity],
      fastestLineLabel: laneLabels[fastestLane],
      note: 'Fastest security option is limited to the traveler’s selected available lane(s).',
      supportsPreCheck: true,
      supportsClear: true,
      sourceName: 'SEA airport data',
      isLive: true,
    };
  }

  const base = DEFAULT_SMALL_AIRPORT_SECURITY[code] || DEFAULT_SMALL_AIRPORT_SECURITY.PAE;

  return {
    label: 'Security',
    selectedMinutes: base.selectedMinutes ?? 10,
    fastestMinutes: base.fastestMinutes ?? 10,
    selectedLineLabel: base.selectedLineLabel ?? 'Standard screening',
    fastestLineLabel: base.fastestLineLabel ?? 'Standard screening',
    note: base.note ?? 'Airport security estimate. Confirm current security conditions before leaving.',
    supportsPreCheck: base.supportsPreCheck ?? false,
    supportsClear: base.supportsClear ?? false,
    sourceName: base.sourceName ?? 'PodPaiGo estimate',
    isLive: base.isLive ?? false,
  };
}