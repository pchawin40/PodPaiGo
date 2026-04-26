export type CrawledParkingPrice = {
  status: 'found' | 'not-found' | 'blocked' | 'error';
  lotKey: string;
  price: number | null;
  priceUnit: 'per-day' | 'total' | null;
  sourceUrl: string;
  lastChecked: string;
  confidence: 'high' | 'medium' | 'low';
  rawSnippet?: string;
};

const PRICE_PATTERNS = [
  /\$([0-9]+(?:\.[0-9]{1,2})?)\s*\/\s*day/i,
  /\$([0-9]+(?:\.[0-9]{1,2})?)\s*per\s*day/i,
  /from\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i,
  /starting\s+at\s+\$([0-9]+(?:\.[0-9]{1,2})?)/i,
  /daily\s+rate[^$]{0,80}\$([0-9]+(?:\.[0-9]{1,2})?)/i,
  /parking[^$]{0,80}\$([0-9]+(?:\.[0-9]{1,2})?)/i,
];

function nowIso() {
  return new Date().toISOString();
}

function blockedResult(args: { lotKey: string; sourceUrl: string; rawSnippet?: string }): CrawledParkingPrice {
  return {
    status: 'blocked',
    lotKey: args.lotKey,
    price: null,
    priceUnit: null,
    sourceUrl: args.sourceUrl,
    lastChecked: nowIso(),
    confidence: 'low',
    rawSnippet: args.rawSnippet,
  };
}

function findPriceInText(text: string): { price: number; rawSnippet: string } | null {
  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const price = Number(match[1]);

      // Avoid obviously bad captures.
      if (Number.isFinite(price) && price >= 3 && price <= 100) {
        return {
          price,
          rawSnippet: match[0],
        };
      }
    }
  }

  return null;
}

async function extractWithFetch(args: {
  lotKey: string;
  sourceUrl: string;
}): Promise<CrawledParkingPrice> {
  const res = await fetch(args.sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1 (+https://podpaigo.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    return {
      status: 'error',
      lotKey: args.lotKey,
      price: null,
      priceUnit: null,
      sourceUrl: args.sourceUrl,
      lastChecked: nowIso(),
      confidence: 'low',
    };
  }

  const html = await res.text();

  if (
    html.includes('_Incapsula_Resource') ||
    html.includes('NOINDEX, NOFOLLOW') ||
    html.toLowerCase().includes('access denied') ||
    html.toLowerCase().includes('captcha')
  ) {
    return blockedResult({
      lotKey: args.lotKey,
      sourceUrl: args.sourceUrl,
      rawSnippet: html.slice(0, 500),
    });
  }

  const found = findPriceInText(html);

  if (found) {
    return {
      status: 'found',
      lotKey: args.lotKey,
      price: found.price,
      priceUnit: 'per-day',
      sourceUrl: args.sourceUrl,
      lastChecked: nowIso(),
      confidence: 'medium',
      rawSnippet: found.rawSnippet,
    };
  }

  return {
    status: 'not-found',
    lotKey: args.lotKey,
    price: null,
    priceUnit: null,
    sourceUrl: args.sourceUrl,
    lastChecked: nowIso(),
    confidence: 'low',
    rawSnippet: html.slice(0, 500),
  };
}

export async function extractPriceFromPage(args: {
  lotKey: string;
  sourceUrl: string;
}): Promise<CrawledParkingPrice> {
  try {
    return await extractWithFetch(args);
  } catch {
    return {
      status: 'error',
      lotKey: args.lotKey,
      price: null,
      priceUnit: null,
      sourceUrl: args.sourceUrl,
      lastChecked: nowIso(),
      confidence: 'low',
    };
  }
}