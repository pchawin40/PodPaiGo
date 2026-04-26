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

export async function extractPriceFromPage(args: {
  lotKey: string;
  sourceUrl: string;
}): Promise<CrawledParkingPrice> {
  try {
    const res = await fetch(args.sourceUrl, {
      headers: {
        'User-Agent': 'PodPaiGoBot/0.1 (+https://podpaigo.com)',
      },
    });

    if (!res.ok) {
      return {
        status: 'error',
        lotKey: args.lotKey,
        price: null,
        priceUnit: null,
        sourceUrl: args.sourceUrl,
        lastChecked: new Date().toISOString(),
        confidence: 'low',
      };
    }

    const html = await res.text();

    if (html.includes('_Incapsula_Resource') || html.includes('NOINDEX, NOFOLLOW')) {
      return {
        status: 'blocked',
        lotKey: args.lotKey,
        price: null,
        priceUnit: null,
        sourceUrl: args.sourceUrl,
        lastChecked: new Date().toISOString(),
        confidence: 'low',
        rawSnippet: html.slice(0, 500),
      };
    }

    const pricePatterns = [
      /\$([0-9]+(?:\.[0-9]{1,2})?)\s*\/\s*day/i,
      /from\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i,
      /starting\s+at\s+\$([0-9]+(?:\.[0-9]{1,2})?)/i,
      /daily\s+rate[^$]{0,40}\$([0-9]+(?:\.[0-9]{1,2})?)/i,
    ];

    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return {
          status: 'found',
          lotKey: args.lotKey,
          price: Number(match[1]),
          priceUnit: 'per-day',
          sourceUrl: args.sourceUrl,
          lastChecked: new Date().toISOString(),
          confidence: 'medium',
          rawSnippet: match[0],
        };
      }
    }

    return {
      status: 'not-found',
      lotKey: args.lotKey,
      price: null,
      priceUnit: null,
      sourceUrl: args.sourceUrl,
      lastChecked: new Date().toISOString(),
      confidence: 'low',
      rawSnippet: html.slice(0, 500),
    };
  } catch {
    return {
      status: 'error',
      lotKey: args.lotKey,
      price: null,
      priceUnit: null,
      sourceUrl: args.sourceUrl,
      lastChecked: new Date().toISOString(),
      confidence: 'low',
    };
  }
}