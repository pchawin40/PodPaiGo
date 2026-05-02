import { resolveAprLotsWithBrowser } from './aprPlaywrightCrawler';

export type AirportParkingReservationLot = {
  source: 'airportparkingreservations';
  lotName: string;
  price: number | null;
  priceUnit: 'per-day' | null;
  bookingUrl: string;
  rawSnippet?: string;
  lastChecked: string;
  isSoldOut?: boolean;
  lotId?: number | null;
};

type AprSearchArgs = {
  checkInDate?: string;
  checkOutDate?: string;
  includeSoldOut?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function absoluteAprUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return `https://www.airportparkingreservations.com${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeLotKey(name: string, url: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${url.toLowerCase()}`;
}

function formatAprDate(dateString: string): string {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildAprSeaUrl(args?: AprSearchArgs): string {
  if (!args?.checkInDate || !args?.checkOutDate) {
    return 'https://airportparkingreservations.com/sea/airport-parking';
  }

  const params = new URLSearchParams({
    checkindate: formatAprDate(args.checkInDate),
    checkoutdate: formatAprDate(args.checkOutDate),
  });

  return `https://airportparkingreservations.com/sea/airport-parking?${params.toString()}`;
}

function extractNearbyPrices(html: string): AirportParkingReservationLot[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const lots: AirportParkingReservationLot[] = [];

  for (const row of rows) {
    const linkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const priceMatch = row.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/i);

    if (!linkMatch || !priceMatch) continue;

    const bookingUrl = absoluteAprUrl(linkMatch[1]);
    const lotName = cleanText(linkMatch[2].replace(/<[^>]+>/g, ''));
    const price = Number(priceMatch[1]);

    if (!lotName || !Number.isFinite(price) || price < 3 || price > 100) continue;

    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
      cleanText(m[1].replace(/<[^>]+>/g, ''))
    );

    lots.push({
      source: 'airportparkingreservations',
      lotName,
      price,
      priceUnit: 'per-day' as const,
      bookingUrl,
      rawSnippet: `${lotName} · ${cells[1] || ''} · ${cells[2] || ''} · $${price}/day`,
      lastChecked: nowIso(),
    });
  }

  return dedupeLots(lots);
}

function dedupeLots(lots: AirportParkingReservationLot[]): AirportParkingReservationLot[] {
  const seen = new Set<string>();

  return lots
    .filter((lot) => {
      const key = normalizeLotKey(lot.lotName, lot.bookingUrl);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.price ?? 999) - (b.price ?? 999));
}

async function enrichLotsWithTrackingPrices(
  lots: AirportParkingReservationLot[],
  args?: AprSearchArgs
): Promise<AirportParkingReservationLot[]> {
  if (!args?.checkInDate || !args?.checkOutDate || lots.length === 0) return lots;

  const browserResults = await resolveAprLotsWithBrowser(
    lots.map((lot) => lot.bookingUrl),
    args
  );

  const resultByUrl = new Map(
    browserResults.map((result) => [result.bookingUrl, result])
  );

  const enriched = lots.slice(0, 8).flatMap((lot) => {
    const result = resultByUrl.get(lot.bookingUrl);

    if (result?.isSoldOut) {
      console.log('[APR merge browser price]', {
        lotName: lot.lotName,
        baselinePrice: lot.price,
        browserPrice: null,
        lotId: result.lotId ?? null,
        bookingUrl: lot.bookingUrl,
        isSoldOut: true,
      });

      return args?.includeSoldOut
        ? [{
          ...lot,
          lotId: result.lotId ?? lot.lotId ?? null,
          price: null,
          rawSnippet: `${lot.lotName} · APR selected-date sold out`,
          lastChecked: nowIso(),
          isSoldOut: true,
        }]
        : [];
    }

    const browserPrice =
      result?.livePrice &&
        Number.isFinite(result.livePrice) &&
        result.livePrice >= 5 &&
        result.livePrice <= 80
        ? result.livePrice
        : null;

    console.log('[APR merge browser price]', {
      lotName: lot.lotName,
      baselinePrice: lot.price,
      browserPrice,
      lotId: result?.lotId ?? null,
      bookingUrl: lot.bookingUrl,
      isSoldOut: false,
    });

    return [{
      ...lot,
      lotId: result?.lotId ?? lot.lotId ?? null,
      price: browserPrice ?? lot.price,
      rawSnippet: browserPrice
        ? `${lot.lotName} · APR selected-date browser price · $${browserPrice}/day`
        : lot.rawSnippet,
      lastChecked: nowIso(),
    }];
  });

  console.log('[APR FINAL ENRICHED LOTS]', enriched.map((lot) => ({
    lotName: lot.lotName,
    price: lot.price,
    rawSnippet: lot.rawSnippet,
  })));

  return dedupeLots(enriched);
}

export async function crawlAirportParkingReservationsSea(
  args?: AprSearchArgs
): Promise<AirportParkingReservationLot[]> {
  const url = buildAprSeaUrl(args);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1 (+https://podpaigo.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return [];

    const html = await res.text();
    const lots = extractNearbyPrices(html);

    if (lots.length > 0) {
      return enrichLotsWithTrackingPrices(lots.slice(0, 12), args);
    }

    if (args?.checkInDate && args?.checkOutDate) {
      console.warn('[APR SEA crawler] selected-date page had no parseable lots; falling back to baseline SEA page');

      const baselineLots = await crawlAirportParkingReservationsSea();

      return enrichLotsWithTrackingPrices(baselineLots.slice(0, 12), args);
    }

    return [];
  } catch (error) {
    console.warn('APR crawler failed:', error);
    return [];
  }
}
