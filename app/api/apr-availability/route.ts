import { NextResponse } from 'next/server';
import { getCachedAprPrices, saveAprPrices } from '../../../lib/db/parkingCache';
import {
  resolveAprLotsWithBrowser,
} from '../../../lib/providers/aprPlaywrightCrawler';
import {
  crawlAirportParkingReservationsSea,
} from '../../../lib/providers/airportParkingReservationsCrawler';
import { debugLog } from '@/lib/utils/debug';

export const runtime = 'nodejs';

const APR_TIMEOUT_MS = 15000;
const AIRPORT_CODE = 'SEA';

type AprResult = {
  bookingUrl: string;
  lotId: number | null;
  livePrice: number | null;
  status: 'resolved' | 'timeout' | 'unavailable' | 'unknown';
  priceSource?: 'lot-page' | 'baseline' | 'cache';
  fetchedAt?: string;
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

// APR lot names can be inconsistent and often missing, so we try to infer a display name from the URL or known lot IDs.
function aprLotNameFromUrl(url: string, lotId?: number | null): string {
  const knownById: Record<number, string> = {
    97: 'Extra Car Airport Parking',
    117: 'MasterPark Lot B',
    226: 'Skyway Inn Airport Parking',
    231: 'DoubleTree Seattle Airport',
    262: 'Jiffy Airport Parking Seattle',
    1067: 'Hilton Seattle Airport & Conference Center',
  };

  if (lotId && knownById[lotId]) return knownById[lotId];

  const slug = url
    .split('/')
    .pop()
    ?.replace(/^lot-/, '')
    .replace(/-sea$/, '')
    .replace(/-/g, ' ')
    .trim();

  return slug
    ? slug.replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Airport Parking Lot';
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const checkInDate = getDateOnly(body?.parkingCheckInDate);
    const checkOutDate = getDateOnly(body?.parkingCheckOutDate);

    debugLog('[APR route request dates]', {
      parkingCheckInDate: body?.parkingCheckInDate,
      parkingCheckOutDate: body?.parkingCheckOutDate,
      checkInDate,
      checkOutDate,
      bookingUrls: body?.bookingUrls,
    });

    const bookingUrls = uniqueStrings(
      Array.isArray(body?.bookingUrls)
        ? body.bookingUrls.filter((u: unknown) => typeof u === 'string')
        : typeof body?.bookingUrl === 'string'
          ? [body.bookingUrl]
          : []
    );

    if (bookingUrls.length === 0) {
      return NextResponse.json({
        status: 'unknown',
        lotId: null,
        livePrice: null,
        results: [],
        message: 'No APR booking URLs provided',
      });
    }

    if (!checkInDate || !checkOutDate) {
      return NextResponse.json({
        status: 'unknown',
        lotId: null,
        livePrice: null,
        results: [],
        message: 'Missing parking check-in or check-out date',
      });
    }

    const startedAt = Date.now();

    const cachedPrices = await getCachedAprPrices({
      bookingUrls,
      airportCode: AIRPORT_CODE,
      checkInDate,
      checkOutDate,
    });

    const cachedByUrl = new Map(cachedPrices.map((p) => [p.bookingUrl, p]));
    const missingBookingUrls = bookingUrls.filter((url) => !cachedByUrl.has(url));

    let resolvedResults: AprResult[] = bookingUrls
      .filter((url) => cachedByUrl.has(url))
      .map((url) => {
        const cached = cachedByUrl.get(url)!;

        return {
          bookingUrl: url,
          lotId: Number(cached.lotId) || null,
          livePrice: cached.livePrice,
          status: cached.availabilityStatus === 'unavailable'
            ? 'unavailable'
            : cached.livePrice
              ? 'resolved'
              : 'unknown',
          priceSource: 'cache',
          fetchedAt: cached.fetchedAt,
        };
      });

    if (missingBookingUrls.length > 0) {
      const browserResults = await withTimeout(
        resolveAprLotsWithBrowser(missingBookingUrls, {
          checkInDate,
          checkOutDate,
        }),
        APR_TIMEOUT_MS
      );

      let liveResults: AprResult[] | null = browserResults
        ? browserResults.map((r) => ({
          bookingUrl: r.bookingUrl,
          lotId: r.lotId ?? null,
          livePrice: r.livePrice ?? null,
          status: r.isSoldOut ? 'unavailable' : r.livePrice ? 'resolved' : 'unknown',
          priceSource: r.livePrice ? 'lot-page' : undefined,
        }))
        : null;

      if (!liveResults || liveResults.some((r) => !r.livePrice)) {
        const fallbackLots = await withTimeout(
          crawlAirportParkingReservationsSea({
            checkInDate,
            checkOutDate,
          }),
          6000
        );

        const lots = fallbackLots || [];

        liveResults = missingBookingUrls.map((bookingUrl) => {
          const existing = liveResults?.find((r) => r.bookingUrl === bookingUrl);
          if (existing?.livePrice) return existing;
          if (existing?.status === 'unavailable') return existing;

          const urlKey = normalize(bookingUrl);

          const match = lots.find((lot) => {
            const lotUrlKey = normalize(lot.bookingUrl);
            const lotNameKey = normalize(lot.lotName);

            return (
              urlKey.includes(lotNameKey) ||
              lotUrlKey.includes(urlKey) ||
              urlKey.includes(lotUrlKey) ||
              lotUrlKey === urlKey
            );
          });

          return {
            bookingUrl,
            lotId: existing?.lotId ?? null,
            livePrice: existing?.livePrice ?? match?.price ?? null,
            status: existing?.livePrice || match?.price ? 'resolved' : 'unknown',
            priceSource: existing?.livePrice
              ? 'lot-page'
              : match?.price
                ? 'baseline'
                : undefined,
          };
        });
      }

      console.log('[APR liveResults before save]', liveResults);

      await saveAprPrices(
        liveResults.map((result) => ({
          bookingUrl: result.bookingUrl,
          lotId: String(result.lotId ?? normalize(result.bookingUrl)),
          lotName: aprLotNameFromUrl(result.bookingUrl, result.lotId),
          airportCode: AIRPORT_CODE,
          checkInDate,
          checkOutDate,
          livePrice: result.livePrice,
          availabilityStatus: result.status === 'unavailable'
            ? 'unavailable'
            : result.livePrice
              ? 'available'
              : 'unknown',
          priceSource: result.priceSource ?? 'apr',
          ttlHours: 12,
        })),
      );

      resolvedResults = [...resolvedResults, ...liveResults];
    }

    return NextResponse.json({
      status: resolvedResults.some((r) => r.status === 'resolved')
        ? resolvedResults.some((r) => r.status !== 'resolved')
          ? 'partial'
          : 'resolved'
        : 'unknown',
      durationMs: Date.now() - startedAt,
      cache: {
        hits: cachedPrices.length,
        misses: missingBookingUrls.length,
      },
      results: resolvedResults,
    });
  } catch (error) {
    console.error('APR availability route failed:', error);

    return NextResponse.json(
      { status: 'unknown', lotId: null, livePrice: null, results: [] },
      { status: 500 }
    );
  }
}
