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
  const candidates: { price: number; rawSnippet: string; score: number }[] = [];

  const patterns = [
    { regex: /starting\s+from\s+\$([0-9]+(?:\.[0-9]{1,2})?)\s*per\s*day/i, score: 100 },
    { regex: /\$([0-9]+(?:\.[0-9]{1,2})?)\s*per\s*day/i, score: 80 },
    { regex: /from\s+\$[0-9]+(?:\.[0-9]{1,2})?\s+\$([0-9]+(?:\.[0-9]{1,2})?)\s*per\s*day/i, score: 120 },
    { regex: /limited\s+offer[^$]*\$[0-9]+(?:\.[0-9]{1,2})?\s+\$([0-9]+(?:\.[0-9]{1,2})?)\s*per\s*day/i, score: 130 },
  ];

  for (const { regex, score } of patterns) {
    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);

    for (const match of text.matchAll(globalRegex)) {
      const price = Number(match[1]);
      if (Number.isFinite(price) && price >= 3 && price <= 100) {
        candidates.push({
          price,
          rawSnippet: match[0],
          score,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.price - b.price;
  });

  return candidates[0];
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
      priceUnit: 'per-day' as const,
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