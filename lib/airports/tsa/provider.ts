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
    plannedAirportArrivalAt?: string;
}): Promise<TsaEstimate> {
    const code = args.airportCode.toUpperCase();
    const security = args.securityOption ?? 'standard';
    const plannedAirportArrivalAt = args.plannedAirportArrivalAt;

    const fallback = TSA_ESTIMATES[code] ?? DEFAULT_TSA_ESTIMATE;

    const liveData = code === 'SEA'
        ? await getLiveSeaTsaWaitTimes(args.securityOption)
        : null;

    const plannedTimeMs = plannedAirportArrivalAt
        ? new Date(plannedAirportArrivalAt).getTime()
        : NaN;
    const minutesUntilPlannedArrival = Number.isFinite(plannedTimeMs)
        ? Math.round((plannedTimeMs - Date.now()) / 60000)
        : null;
    const isFuturePlanning =
        typeof minutesUntilPlannedArrival === 'number' &&
        minutesUntilPlannedArrival > 60;
    const hasCurrentLiveData = Boolean(liveData?.waitTimes);
    const useLiveForWait = hasCurrentLiveData && !isFuturePlanning;

    const waitTimes = useLiveForWait ? liveData!.waitTimes : fallback;
    const sourceName = useLiveForWait
        ? 'Port of Seattle live checkpoint waits'
        : isFuturePlanning && hasCurrentLiveData
            ? `${code} TSA future estimate`
            : `${code} TSA estimate`;

    return {
        destination: args.destination || code,
        waitTime: waitForSecurity(waitTimes, security),
        waitTimes,
        selectedLane: security,
        plannedAirportArrivalAt,
        timingBasis: useLiveForWait ? 'current-live' : 'planned-arrival',
        liveDataIsCurrentOnly: isFuturePlanning && hasCurrentLiveData,
        status: useLiveForWait ? 'live' : 'estimated',
        trustStatus: useLiveForWait ? 'live' : 'estimated',
        sourceName,
        lastUpdated: new Date().toISOString(),
        assumptions: [
            plannedAirportArrivalAt
                ? `Estimated for planned airport arrival/check-in: ${plannedAirportArrivalAt}.`
                : 'No planned airport arrival/check-in time was provided.',
            ...(useLiveForWait
                ? ['Live TSA wait is current only.', 'Actual TSA wait may vary by checkpoint and lane.']
                : isFuturePlanning && hasCurrentLiveData
                    ? ['Live TSA is current only; future wait is estimated.', 'Future estimate uses lane-specific baseline wait times.']
                    : ['Estimated TSA wait by security lane.', 'Use live airport/TSA source when available.']
            ),
        ],
        bestCheckpoint: useLiveForWait ? liveData?.bestCheckpoint ?? undefined : undefined,
    };
}
