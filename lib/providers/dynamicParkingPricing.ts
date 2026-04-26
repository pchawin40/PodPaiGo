import { extractPriceFromPage } from './parkingPriceCrawler';
import { SEA_PRICE_SOURCES } from './parkingPriceSources';

export type DynamicParkingPrice = {
    lotKey: string;
    price: number | null;
    priceUnit: 'per-day' | 'total' | null;
    priceDisplay: 'live' | 'from-per-day' | 'check-live';
    priceNote: string;
    priceConfidence: 'high' | 'medium' | 'low';
    sourceUrl?: string;
    lastChecked: string;
    status: 'found' | 'fallback' | 'blocked' | 'not-found' | 'error';
    rawSnippet?: string;
};

export async function resolveDynamicParkingPrice(lotKey: string): Promise<DynamicParkingPrice> {
    const config = SEA_PRICE_SOURCES.find((s) => s.lotKey === lotKey);
    const now = new Date().toISOString();

    if (!config) {
        return {
            lotKey,
            price: null,
            priceUnit: null,
            priceDisplay: 'check-live',
            priceNote: 'No dynamic price source configured. Open provider to confirm live price.',
            priceConfidence: 'low',
            lastChecked: now,
            status: 'not-found',
        };
    }

    if (config.crawlEnabled !== false) {
        for (const url of config.urls) {
            const result = await extractPriceFromPage({
                lotKey,
                sourceUrl: url,
            });

            if (result.status === 'found' && result.price != null) {
                return {
                    lotKey,
                    price: result.price,
                    priceUnit: result.priceUnit,
                    priceDisplay: result.priceUnit === 'per-day' ? 'from-per-day' : 'live',
                    priceNote: `Dynamic price found from ${config.label}. Verify final checkout price before booking.`,
                    priceConfidence: result.confidence,
                    sourceUrl: result.sourceUrl,
                    lastChecked: result.lastChecked,
                    status: 'found',
                    rawSnippet: result.rawSnippet,
                };
            }

            if (result.status === 'blocked') {
                return {
                    lotKey,
                    price: null,
                    priceUnit: null,
                    priceDisplay: 'check-live',
                    priceNote: `${config.label} blocks automated price checks. Open provider to confirm live price.`,
                    priceConfidence: 'low',
                    sourceUrl: result.sourceUrl,
                    lastChecked: result.lastChecked,
                    status: 'blocked',
                    rawSnippet: result.rawSnippet,
                };
            }
        }
    }

    if (typeof config.fallbackPrice === 'number') {
        return {
            lotKey,
            price: config.fallbackPrice,
            priceUnit: config.fallbackUnit ?? 'per-day',
            priceDisplay: config.fallbackUnit === 'total' ? 'live' : 'from-per-day',
            priceNote: config.crawlEnabled === false
                ? `Known ${config.label} baseline rate. Automated live price checks are disabled for this source; verify before booking.`
                : `Known ${config.label} baseline rate. Live crawler did not find a current price; verify before booking.`,
            priceConfidence: 'medium',
            sourceUrl: config.urls[0],
            lastChecked: now,
            status: 'fallback',
        };
    }

    return {
        lotKey,
        price: null,
        priceUnit: null,
        priceDisplay: 'check-live',
        priceNote: `No dynamic price found for ${config.label}. Open provider to confirm live price.`,
        priceConfidence: 'low',
        sourceUrl: config.urls[0],
        lastChecked: now,
        status: 'not-found',
    };
}

export function getLotKeyFromName(name: string): string | null {
    const lower = name.toLowerCase();

    if (lower.includes('wally')) return 'wallypark';

    if (
        lower.includes('masterpark') ||
        lower.includes('master park')
    ) return 'masterpark';

    if (lower.includes('airportparkingreservations'))
        return 'airportparkingreservations';

    return null;
}