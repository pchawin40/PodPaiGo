// lib/airports/tsa/provider.ts
import { SecurityOption, TsaEstimate } from '../../types';
import { DEFAULT_TSA_ESTIMATE, TSA_ESTIMATES } from './estimates';

function waitForSecurity(waitTimes: typeof DEFAULT_TSA_ESTIMATE, security: SecurityOption) {
  if (security === 'clear-precheck') return waitTimes.clearPrecheck;
  return waitTimes[security];
}

export function getAirportTsaEstimate(args: {
  airportCode: string;
  destination: string;
  securityOption?: SecurityOption;
}): TsaEstimate {
  const code = args.airportCode.toUpperCase();
  const security = args.securityOption ?? 'standard';
  const waitTimes = TSA_ESTIMATES[code] ?? DEFAULT_TSA_ESTIMATE;

  return {
    destination: args.destination || code,
    waitTime: waitForSecurity(waitTimes, security),
    waitTimes,
    selectedLane: security,
    status: 'estimated',
    trustStatus: 'estimated',
    sourceName: `${code} TSA estimate`,
    lastUpdated: new Date().toISOString(),
    assumptions: [
      'Estimated TSA wait by security lane.',
      'Use live airport/TSA source when available.',
    ],
  };
}