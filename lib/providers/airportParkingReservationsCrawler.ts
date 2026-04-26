export type AirportParkingReservationLot = {
  source: 'airportparkingreservations';
  lotName: string;
  price: number | null;
  priceUnit: 'per-day' | null;
  bookingUrl: string;
  rawSnippet?: string;
  lastChecked: string;
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

function extractNearbyPrices(html: string): AirportParkingReservationLot[] {
  const lots: AirportParkingReservationLot[] = [];

  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

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

    const parkingType = cells[1] || '';
    const distance = cells[2] || '';

    lots.push({
      source: 'airportparkingreservations',
      lotName,
      price,
      priceUnit: 'per-day',
      bookingUrl,
      rawSnippet: `${lotName} · ${parkingType} · ${distance} · $${price}/day`,
      lastChecked: nowIso(),
    });
  }

  const seen = new Set<string>();

  return lots
    .filter((lot) => {
      const key = lot.lotName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.price ?? 999) - (b.price ?? 999));
}

export async function crawlAirportParkingReservationsSea(): Promise<AirportParkingReservationLot[]> {
  const url =
    'https://airportparkingreservations.com/sea/airport-parking';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1 (+https://podpaigo.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    return extractNearbyPrices(html)
      .sort((a, b) => (a.price ?? 999) - (b.price ?? 999))
      .slice(0, 12);
  } catch {
    return [];
  }
}