
export type AprAvailabilityResult = {
    bookingUrl?: string;
    available: boolean;
    status: 'available' | 'unavailable' | 'unknown';
    statusCode?: number;
    livePrice: number | null;
    lotId: number | null;
};

export async function checkAprLotsAvailability(args: {
    lots: Array<{ lotName: string; bookingUrl: string }>;
    checkInDate?: string;
    checkOutDate?: string;
}): Promise<Record<string, AprAvailabilityResult>> {
    try {
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            process.env.APP_URL ||
            'http://localhost:3000';

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(`${baseUrl}/api/apr-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bookingUrls: args.lots.map((lot) => lot.bookingUrl),
                parkingCheckInDate: args.checkInDate,
                parkingCheckOutDate: args.checkOutDate,
            }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) return {};

        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];

        return Object.fromEntries(
            results.map((result: AprAvailabilityResult) => [
                result.bookingUrl,
                {
                    available: true,
                    status: result.livePrice ? 'available' : 'unknown',
                    statusCode: 200,
                    livePrice: result.livePrice ?? null,
                    lotId: result.lotId ?? null,
                } satisfies AprAvailabilityResult,
            ])
        );
    } catch {
        return {};
    }
}

const APR_LOT_ID_CACHE = new Map<string, number>();

async function getAprBrowserResult(bookingUrl: string): Promise<{
    status: string;
    lotId: number | null;
    livePrice: number | null;
}> {
    try {
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            process.env.APP_URL ||
            'http://localhost:3000';

        const res = await fetch(`${baseUrl}/api/apr-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingUrl }),
        });

        if (!res.ok) {
            return { status: 'unknown', lotId: null, livePrice: null };
        }

        return await res.json();
    } catch {
        return { status: 'unknown', lotId: null, livePrice: null };
    }
}

function formatAprDate(dateString: string): string {
    const d = new Date(`${dateString}T12:00:00`);
    return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

function normalizeUrl(url: string): string {
    if (url.startsWith('http')) return url;
    return `https://airportparkingreservations.com${url.startsWith('/') ? '' : '/'}${url}`;
}

function extractLotIdFromText(text: string): number | null {
    const patterns = [
        /parkinglot\/(\d+)\/search/i,
        /parking_lot_id["']?\s*[:=]\s*["']?(\d+)/i,
        /parkingLotId["']?\s*[:=]\s*["']?(\d+)/i,
        /lotId["']?\s*[:=]\s*["']?(\d+)/i,
        /lot_id["']?\s*[:=]\s*["']?(\d+)/i,
        /"id"\s*:\s*(\d+)[\s\S]{0,120}"lot/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            const id = Number(match[1]);
            if (Number.isFinite(id) && id > 0) return id;
        }
    }

    return null;
}

function extractLivePrice(data: unknown): number | null {
    const text = JSON.stringify(data);

    const matches = Array.from(
        text.matchAll(
            /"?(?:price|rate|dailyRate|per_day|perDay|amount|subtotal|total)"?\s*:\s*"?\$?([0-9]+(?:\.[0-9]{1,2})?)"?/gi
        )
    );

    const prices = matches
        .map((m) => Number(m[1]))
        .filter((n) => Number.isFinite(n) && n > 3 && n < 200);

    if (prices.length === 0) return null;

    return Math.min(...prices);
}

export async function resolveAprLotIdFromUrl(bookingUrl: string): Promise<number | null> {
    const url = normalizeUrl(bookingUrl);
    const cached = APR_LOT_ID_CACHE.get(url);
    if (cached) return cached;

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1',
                Accept: 'text/html,application/xhtml+xml',
            },
        });

        if (!res.ok) return null;

        const html = await res.text();
        const lotId = extractLotIdFromText(html);

        console.log('APR LOT ID RESOLVE', {
            url,
            status: res.status,
            lotId,
            hasParkinglotSearch: html.includes('/parkinglot/'),
            hasLotId: html.toLowerCase().includes('lotid') || html.toLowerCase().includes('lot_id'),
            snippet: html.slice(0, 500),
        });

        if (lotId) {
            APR_LOT_ID_CACHE.set(url, lotId);
        }

        return lotId;
    } catch {
        return null;
    }
}

export async function checkAprLotAvailability(args: {
    lotName: string;
    bookingUrl?: string;
    checkInDate?: string;
    checkOutDate?: string;
}): Promise<AprAvailabilityResult> {
    if (!args.checkInDate || !args.checkOutDate || !args.bookingUrl) {
        return { available: true, status: 'unknown', livePrice: null, lotId: null };
    }

    const browserResult = await getAprBrowserResult(args.bookingUrl);
    const lotId = browserResult.lotId;

    if (browserResult.livePrice) {
        return {
            available: true,
            status: 'available',
            statusCode: 200,
            livePrice: browserResult.livePrice,
            lotId,
        };
    }

    if (!lotId) {
        return { available: true, status: 'unknown', livePrice: null, lotId: null };
    }

    try {
        const res = await fetch(`https://airportparkingreservations.com/parkinglot/${lotId}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1',
            },
            body: JSON.stringify({
                checkindate: formatAprDate(args.checkInDate),
                checkoutdate: formatAprDate(args.checkOutDate),
            }),
        });

        if (res.status === 422 || res.status === 404) {
            return {
                available: false,
                status: 'unavailable',
                statusCode: res.status,
                livePrice: null,
                lotId,
            };
        }

        if (!res.ok) {
            return {
                available: true,
                status: 'unknown',
                statusCode: res.status,
                livePrice: null,
                lotId,
            };
        }

        const data = await res.json().catch(() => null);
        const livePrice = extractLivePrice(data);

        console.log('APR SELECTED DATE RESPONSE', {
            lotName: args.lotName,
            lotId,
            status: res.status,
            livePrice,
            dataPreview: JSON.stringify(data).slice(0, 1200),
        });

        return {
            available: true,
            status: 'available',
            statusCode: res.status,
            livePrice,
            lotId,
        };
    } catch {
        return {
            available: true,
            status: 'unknown',
            livePrice: null,
            lotId,
        };
    }
}