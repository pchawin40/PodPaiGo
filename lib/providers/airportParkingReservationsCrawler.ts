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

  return `https://airportparkingreservations.com/search/SEA?${params.toString()}`;
}

function priceFromAprTrackingUrl(url: string): number | null {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/(?:^|~)pr([0-9]+(?:\.[0-9]{1,2})?)(?:~|&|$)/);
  const price = match?.[1] ? Number(match[1]) : null;

  return price && Number.isFinite(price) && price >= 5 && price <= 80 ? price : null;
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

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const enriched: AirportParkingReservationLot[] = [];

    for (const lot of lots.slice(0, 8)) {
      const page = await context.newPage();
      let trackingPrice: number | null = null;

      page.on('request', (req) => {
        const url = req.url();
        const foundPrice = priceFromAprTrackingUrl(url);

        if (foundPrice) {
          trackingPrice = foundPrice;
          console.log('[APR tracking price captured]', {
            lotName: lot.lotName,
            foundPrice,
          });
        }
      });

      try {
        await page.goto(lot.bookingUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });

        // Wait specifically until tracking price appears, not just random 5 sec
        await page
          .waitForFunction(() => {
            return performance
              .getEntriesByType('resource')
              .some((entry) => /~pr[0-9]+(\.[0-9]{1,2})?/.test(decodeURIComponent(entry.name)));
          }, { timeout: 8000 })
          .catch(() => null);

        // Give request listener a final moment to catch it
        await page.waitForTimeout(1000);

        const finalPrice = trackingPrice ?? lot.price;

        enriched.push({
          ...lot,
          price: finalPrice,
          rawSnippet:
            trackingPrice && trackingPrice !== lot.price
              ? `${lot.lotName} · APR tracking price · $${trackingPrice}/day`
              : lot.rawSnippet,
          lastChecked: nowIso(),
        });
      } catch {
        enriched.push(lot);
      } finally {
        await page.close().catch(() => { });
      }
    }

    console.log('[APR FINAL ENRICHED LOTS]', enriched.map((lot) => ({
      lotName: lot.lotName,
      price: lot.price,
      rawSnippet: lot.rawSnippet,
    })));

    return dedupeLots(enriched);
  } finally {
    await browser.close().catch(() => { });
  }
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