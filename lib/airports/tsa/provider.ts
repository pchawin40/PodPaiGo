// lib/airports/tsa/provider.ts
import { SecurityOption, TsaEstimate } from '../../types';
import { DEFAULT_TSA_ESTIMATE, TSA_ESTIMATES } from './estimates';
import { getLiveSeaTsaWaitTimes } from './liveSea';

function waitForSecurity(
  waitTimes: typeof DEFAULT_TSA_ESTIMATE,
  security: SecurityOption
) {
  if (security === 'clear-precheck') return waitTimes.clearPrecheck;
  return waitTimes[security];
}

export async function getAirportTsaEstimate(args: {
  airportCode: string;
  destination: string;
  securityOption?: SecurityOption;
}): Promise<TsaEstimate> {
  const code = args.airportCode.toUpperCase();
  const security = args.securityOption ?? 'standard';

  const fallback = TSA_ESTIMATES[code] ?? DEFAULT_TSA_ESTIMATE;

  const liveData =
    code === 'SEA'
      ? await getLiveSeaTsaWaitTimes()
      : null;

  const waitTimes = liveData?.waitTimes ?? fallback;
  const isLive = Boolean(liveData?.waitTimes);

  return {
    destination: args.destination || code,
    waitTime: waitForSecurity(waitTimes, security),
    waitTimes,
    selectedLane: security,
    status: isLive ? 'live' : 'estimated',
    trustStatus: isLive ? 'live' : 'estimated',
    sourceName: isLive
      ? 'Port of Seattle live checkpoint waits'
      : `${code} TSA estimate`,
    lastUpdated: new Date().toISOString(),
    assumptions: isLive
      ? ['Live SEA checkpoint wait estimate.', 'Actual TSA wait may vary by checkpoint and lane.']
      : ['Estimated TSA wait by security lane.', 'Use live airport/TSA source when available.'],
    bestCheckpoint: liveData?.bestCheckpoint ?? undefined,
  };
}