import { NextRequest, NextResponse } from 'next/server';
import { getParkWhizParkingOptions } from '../../../../lib/providers/parkWhiz';
import { crawlAirportParkingReservationsSea } from '../../../../lib/providers/airportParkingReservationsCrawler';

export const runtime = 'nodejs';

type InputLot = {
    id?: string;
    name: string;
};

function containsLotQualifier(text: string): boolean {
    const lower = text.toLowerCase();
    return (
        lower.includes('lot a') ||
        lower.includes('lot b') ||
        lower.includes('lot c') ||
        lower.includes('garage') ||
        lower.includes('valet')
    );
}

function normalizeName(text: string): string {
    return text
        .toLowerCase()
        .replace(/airport/g, '')
        .replace(/parking/g, '')
        .replace(/seatac/g, '')
        .replace(/sea-tac/g, '')
        .replace(/sea/g, '')
        .replace(/garage/g, '')
        .replace(/lot/g, '')
        .replace(/self/g, '')
        .replace(/covered/g, '')
        .replace(/uncovered/g, '')
        .replace(/valet/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokens(text: string): Set<string> {
    return new Set(
        normalizeName(text)
            .split(' ')
            .filter((t) => t.length >= 3),
    );
}

function scoreMatch(a: string, b: string): number {
    const aTokens = tokens(a);
    const bTokens = tokens(b);

    if (aTokens.size === 0 || bTokens.size === 0) return 0;

    let overlap = 0;

    for (const token of aTokens) {
        if (bTokens.has(token)) overlap += 1;
    }

    return overlap / Math.max(aTokens.size, bTokens.size);
}

function findBestMatch<T extends { name: string }>(
    lotName: string,
    candidates: T[],
): { match: T | null; score: number } {
    let best: T | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
        const score = scoreMatch(lotName, candidate.name);

        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    if (!best) {
        return { match: null, score: bestScore };
    }

    const lotHasQualifier = containsLotQualifier(lotName);
    const matchHasQualifier = containsLotQualifier(best.name);

    if (lotHasQualifier || matchHasQualifier) {
        const lotNorm = normalizeName(lotName);
        const matchNorm = normalizeName(best.name);

        if (!lotNorm.includes(matchNorm) && !matchNorm.includes(lotNorm)) {
            return { match: null, score: bestScore };
        }
    }

    return {
        match: bestScore >= 0.45 ? best : null,
        score: bestScore,
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const airportCode = String(body.airportCode ?? 'SEA').toUpperCase();
        const checkInDate = String(body.checkInDate ?? '');
        const checkOutDate = String(body.checkOutDate ?? '');
        const lots = Array.isArray(body.lots) ? (body.lots as InputLot[]) : [];

        if (!checkInDate || !checkOutDate) {
            return NextResponse.json(
                { error: 'Missing checkInDate or checkOutDate' },
                { status: 400 },
            );
        }

        if (lots.length === 0) {
            return NextResponse.json({
                ok: true,
                airportCode,
                checkInDate,
                checkOutDate,
                matches: [],
            });
        }

        const parkWhizOptions = await getParkWhizParkingOptions({
            airportCode,
            checkInDate,
            checkOutDate,
        }).catch((error) => {
            console.warn('[parking prices] ParkWhiz failed', error);
            return [];
        });

        const aprLots =
            airportCode === 'SEA'
                ? await crawlAirportParkingReservationsSea({
                    checkInDate,
                    checkOutDate,
                    includeSoldOut: false,
                }).catch((error) => {
                    console.warn('[parking prices] APR failed', error);
                    return [];
                })
                : [];

        const aprOptions = aprLots.map((lot) => ({
            id: lot.lotId ? String(lot.lotId) : lot.bookingUrl,
            name: lot.lotName,
            price: lot.price,
            priceUnit: lot.priceUnit,
            sourceName: 'AirportParkingReservations',
            sourceLink: lot.bookingUrl,
            isSoldOut: lot.isSoldOut,
        }));

        const providerOptions = [
            ...parkWhizOptions.map((option) => ({
                id: option.id,
                name: option.name,
                price: option.price,
                priceUnit: option.priceUnit,
                sourceName: option.sourceName ?? 'ParkWhiz',
                sourceLink: option.sourceLink,
                isSoldOut: false,
            })),
            ...aprOptions,
        ];

        const matches = lots.map((lot) => {
            const { match, score } = findBestMatch(lot.name, providerOptions);

            return {
                lotId: lot.id ?? null,
                lotName: lot.name,
                matched: !!match,
                matchScore: Math.round(score * 100) / 100,
                providerName: match?.name ?? null,
                provider: match?.sourceName ?? null,
                price: match?.price ?? null,
                priceUnit: match?.priceUnit ?? null,
                sourceLink: match?.sourceLink ?? null,
                isSoldOut: match?.isSoldOut ?? false,
            };
        });

        return NextResponse.json({
            ok: true,
            airportCode,
            checkInDate,
            checkOutDate,
            providerCounts: {
                parkWhiz: parkWhizOptions.length,
                apr: aprOptions.length,
                total: providerOptions.length,
            },
            matches,
        });
    } catch (error) {
        console.error('[parking prices] failed', error);

        return NextResponse.json(
            { error: 'Parking price lookup failed' },
            { status: 500 },
        );
    }
}