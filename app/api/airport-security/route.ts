import { NextResponse } from 'next/server';
import { getAirportTsaEstimate } from '../../../lib/airports/tsa/provider';

type LaneKey = 'standard' | 'precheck' | 'clear' | 'clearPrecheck';

type SecurityOption = 'standard' | 'precheck' | 'clear' | 'clear-precheck';

type SecurityLaneStatus = {
    available: boolean;
    waitMinutes?: number;
    note?: string;
};

type AirportSecurityResponse = {
    airportCode: string;
    sourceName: string;
    trustStatus: 'live' | 'estimated' | 'unavailable';
    plannedAirportArrivalAt?: string;
    timingBasis?: 'planned-arrival' | 'current-live';
    note?: string;
    lanes: Record<LaneKey, SecurityLaneStatus>;
};

function normalizeSecurityOption(value: string | null): SecurityOption {
    if (
        value === 'precheck' ||
        value === 'clear' ||
        value === 'clear-precheck' ||
        value === 'standard'
    ) {
        return value;
    }

    return 'standard';
}

function isLaneAllowedForSelection(
    selectedSecurity: SecurityOption,
    lane: LaneKey
): boolean {
    if (lane === 'standard') return true;

    if (selectedSecurity === 'precheck') {
        return lane === 'precheck';
    }

    if (selectedSecurity === 'clear') {
        return lane === 'clear';
    }

    if (selectedSecurity === 'clear-precheck') {
        return lane === 'precheck' || lane === 'clear' || lane === 'clearPrecheck';
    }

    return false;
}

function restrictLane(
    selectedSecurity: SecurityOption,
    lane: LaneKey,
    status: SecurityLaneStatus
): SecurityLaneStatus {
    if (isLaneAllowedForSelection(selectedSecurity, lane)) {
        return status;
    }

    return {
        ...status,
        available: false,
        note: 'Not included because the traveler did not select this security option.',
    };
}

function fallbackSecurity(airportCode: string, plannedAirportArrivalAt?: string): AirportSecurityResponse {
    return {
        airportCode,
        sourceName: 'Airport security capability fallback',
        trustStatus: airportCode === 'SEA' ? 'estimated' : 'unavailable',
        plannedAirportArrivalAt,
        timingBasis: plannedAirportArrivalAt ? 'planned-arrival' : 'current-live',
        note: plannedAirportArrivalAt
            ? 'Future TSA/security timing is estimated for the planned airport arrival.'
            : 'Airport security availability estimate.',
        lanes: {
            standard: {
                available: true,
                note: 'Standard TSA screening is generally available.',
            },
            precheck: {
                available: airportCode === 'SEA',
                note:
                    airportCode === 'SEA'
                        ? 'TSA PreCheck is commonly available at SEA.'
                        : 'PreCheck availability is not confirmed for this airport yet.',
            },
            clear: {
                available: airportCode === 'SEA',
                note:
                    airportCode === 'SEA'
                        ? 'CLEAR availability is estimated for SEA.'
                        : 'CLEAR availability is not confirmed for this airport yet.',
            },
            clearPrecheck: {
                available: airportCode === 'SEA',
                note:
                    airportCode === 'SEA'
                        ? 'CLEAR + PreCheck may be available when both lanes are operating.'
                        : 'CLEAR + PreCheck availability is not confirmed for this airport yet.',
            },
        },
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const airportCode = (searchParams.get('airport') || 'SEA').toUpperCase();
    const plannedAirportArrivalAt = searchParams.get('plannedAirportArrivalAt') || undefined;
    const selectedSecurity = normalizeSecurityOption(
        searchParams.get('securityOption') || searchParams.get('security')
    );

    if (airportCode !== 'SEA') {
        return NextResponse.json(fallbackSecurity(airportCode, plannedAirportArrivalAt));
    }

    try {
        const estimate = await getAirportTsaEstimate({
            airportCode,
            destination: 'Seattle-Tacoma International Airport',
            securityOption: selectedSecurity,
            plannedAirportArrivalAt,
        });

        const standardWait = estimate.waitTimes?.standard ?? estimate.waitTime;
        const precheckWait = estimate.waitTimes?.precheck;
        const clearWait = estimate.waitTimes?.clear;
        const clearPrecheckWait = estimate.waitTimes?.clearPrecheck;

        const safePrecheckWait =
            typeof standardWait === 'number'
                ? Math.min(precheckWait ?? standardWait, standardWait)
                : precheckWait;

        const safeClearWait =
            typeof standardWait === 'number'
                ? Math.min(clearWait ?? standardWait, standardWait)
                : clearWait;

        const fastestEligible =
            typeof standardWait === 'number'
                ? Math.min(
                    clearPrecheckWait ?? standardWait,
                    safePrecheckWait ?? standardWait,
                    safeClearWait ?? standardWait,
                    standardWait
                )
                : clearPrecheckWait ?? safePrecheckWait ?? safeClearWait;

        const safeClearPrecheckWait =
            typeof fastestEligible === 'number'
                ? Math.max(2, fastestEligible - 1)
                : fastestEligible;

        const response: AirportSecurityResponse = {
            airportCode,
            sourceName: estimate.sourceName || 'SEA TSA wait estimate',
            trustStatus: estimate.trustStatus === 'live' ? 'live' : 'estimated',
            plannedAirportArrivalAt: estimate.plannedAirportArrivalAt,
            timingBasis: estimate.timingBasis,
            note: estimate.liveDataIsCurrentOnly
                ? 'Live TSA is current only; future wait is estimated.'
                : estimate.timingBasis === 'current-live'
                    ? 'Live TSA wait is current only.'
                    : 'Future TSA/security timing is estimated for the planned airport arrival.',
            lanes: {
                standard: restrictLane(selectedSecurity, 'standard', {
                    available: true,
                    waitMinutes: standardWait,
                    note: 'Standard TSA lane.',
                }),
                precheck: restrictLane(selectedSecurity, 'precheck', {
                    available: true,
                    waitMinutes: safePrecheckWait,
                    note: 'TSA PreCheck lane when operating.',
                }),
                clear: restrictLane(selectedSecurity, 'clear', {
                    available: true,
                    waitMinutes: safeClearWait,
                    note: 'CLEAR lane when operating. Wait estimate is capped because source data is checkpoint-level.',
                }),
                clearPrecheck: restrictLane(selectedSecurity, 'clearPrecheck', {
                    available: true,
                    waitMinutes: safeClearPrecheckWait,
                    note: 'Fastest eligible lane when CLEAR and PreCheck are operating.',
                }),
            },
        };

        return NextResponse.json(response);
    } catch {
        return NextResponse.json(fallbackSecurity(airportCode, plannedAirportArrivalAt));
    }
}
