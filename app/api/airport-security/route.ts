import { NextResponse } from 'next/server';
import { getAirportTsaEstimate } from '../../../lib/airports/tsa/provider';

type LaneKey = 'standard' | 'precheck' | 'clear' | 'clearPrecheck';

type SecurityLaneStatus = {
    available: boolean;
    waitMinutes?: number;
    note?: string;
};

type AirportSecurityResponse = {
    airportCode: string;
    sourceName: string;
    trustStatus: 'live' | 'estimated' | 'unavailable';
    lanes: Record<LaneKey, SecurityLaneStatus>;
};

function fallbackSecurity(airportCode: string): AirportSecurityResponse {
    return {
        airportCode,
        sourceName: 'Airport security capability fallback',
        trustStatus: airportCode === 'SEA' ? 'estimated' : 'unavailable',
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

    if (airportCode !== 'SEA') {
        return NextResponse.json(fallbackSecurity(airportCode));
    }

    try {
        const estimate = await getAirportTsaEstimate({
            airportCode,
            destination: 'Seattle-Tacoma International Airport',
            securityOption: 'clear-precheck',
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
            lanes: {
                standard: {
                    available: true,
                    waitMinutes: standardWait,
                    note: 'Standard TSA lane.',
                },
                precheck: {
                    available: true,
                    waitMinutes: safePrecheckWait,
                    note: 'TSA PreCheck lane when operating.',
                },
                clear: {
                    available: true,
                    waitMinutes: safeClearWait,
                    note: 'CLEAR lane when operating. Wait estimate is capped because source data is checkpoint-level.',
                },
                clearPrecheck: {
                    available: true,
                    waitMinutes: safeClearPrecheckWait,
                    note: 'Fastest eligible lane when CLEAR and PreCheck are operating.',
                },
            },
        };

        return NextResponse.json(response);
    } catch {
        return NextResponse.json(fallbackSecurity(airportCode));
    }
}