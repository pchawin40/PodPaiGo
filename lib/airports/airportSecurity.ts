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
    const selectedMinutes =
      selectedSecurity === 'clear-precheck' ? 2 :
      selectedSecurity === 'precheck' ? 3 :
      selectedSecurity === 'clear' ? 3 :
      3;

    return {
      label: 'TSA',
      selectedMinutes,
      fastestMinutes: 2,
      selectedLineLabel:
        selectedSecurity === 'clear-precheck' ? 'CLEAR + PreCheck' :
        selectedSecurity === 'precheck' ? 'PreCheck' :
        selectedSecurity === 'clear' ? 'CLEAR' :
        'Standard',
      fastestLineLabel: 'CLEAR + PreCheck',
      note: 'For selected option: use the best available checkpoint shown by airport data.',
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