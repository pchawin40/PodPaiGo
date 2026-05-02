import { debugLog } from '../utils/debug';
import { db } from './client';

export type CachedAprPrice = {
    bookingUrl: string;
    lotId: string;
    lotName: string;
    airportCode: string;
    checkInDate: string;
    checkOutDate: string;
    livePrice: number | null;
    availabilityStatus: string | null;
    priceSource: string | null;
    fetchedAt: string;
    expiresAt: string;
};

export type SaveAprPriceInput = {
    bookingUrl: string;
    lotId: string;
    lotName: string;
    airportCode: string;
    checkInDate: string;
    checkOutDate: string;
    livePrice: number | null;
    availabilityStatus?: 'available' | 'unavailable' | 'unknown' | null;
    priceSource?: string | null;
    ttlHours?: number;
};

export async function getCachedAprPrices(params: {
    bookingUrls: string[];
    airportCode: string;
    checkInDate: string;
    checkOutDate: string;
}): Promise<CachedAprPrice[]> {
    if (params.bookingUrls.length === 0) return [];

    const result = await db.query(
        `
    select distinct on (booking_url)
      booking_url as "bookingUrl",
      lot_id as "lotId",
      lot_name as "lotName",
      airport_code as "airportCode",
      check_in_date::text as "checkInDate",
      check_out_date::text as "checkOutDate",
      price_total::float8 as "livePrice",
      availability_status as "availabilityStatus",
      source as "priceSource",
      fetched_at::text as "fetchedAt",
      expires_at::text as "expiresAt"
    from parking_price_snapshots
    where airport_code = $1
      and check_in_date = $2
      and check_out_date = $3
      and booking_url = any($4::text[])
      and expires_at > now()
    order by booking_url, fetched_at desc
    `,
        [
            params.airportCode,
            params.checkInDate,
            params.checkOutDate,
            params.bookingUrls,
        ],
    );

    return result.rows;
}

export async function saveAprPrices(prices: SaveAprPriceInput[]): Promise<void> {
    if (prices.length === 0) return;

    const client = await db.connect();

    try {
        await client.query('begin');

        for (const price of prices) {
            await client.query(
                `
        insert into parking_price_snapshots (
          lot_id,
          lot_name,
          airport_code,
          check_in_date,
          check_out_date,
          price_total,
          price_daily,
          currency,
          availability_status,
          booking_url,
          source,
          fetched_at,
          expires_at
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $6, 'USD', $7, $8,
          $9, now(), now() + ($10 || ' hours')::interval
        )
        `,
                [
                    price.lotId,
                    price.lotName,
                    price.airportCode,
                    price.checkInDate,
                    price.checkOutDate,
                    price.livePrice,
                    price.availabilityStatus ?? (price.livePrice ? 'available' : 'unknown'),
                    price.bookingUrl,
                    price.priceSource ?? 'apr',
                    price.ttlHours ?? 12,
                ],
            );
        }

        await client.query('commit');
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}

export type CachedAprLotSnapshot = {
    bookingUrl: string;
    lotId: string;
    lotName: string;
    livePrice: number | null;
    priceSource: string | null;
    fetchedAt: string;
};

export async function getCachedAprLotsForDateRange(params: {
    airportCode: string;
    checkInDate?: string;
    checkOutDate?: string;
}): Promise<CachedAprLotSnapshot[]> {
    const result = await db.query(
        `
    select distinct on (booking_url)
      booking_url as "bookingUrl",
      lot_id as "lotId",
      lot_name as "lotName",
      price_total::float8 as "livePrice",
      source as "priceSource",
      fetched_at::text as "fetchedAt"
    from parking_price_snapshots
    where airport_code = $1
      and booking_url is not null
      and price_total is not null
      and ($2::date is null or check_in_date = $2::date)
      and ($3::date is null or check_out_date = $3::date)
      and expires_at > now()
    order by
      booking_url,
      case when source = 'apr-tracking' then 0 else 1 end,
      fetched_at desc
    `,
        [params.airportCode, params.checkInDate ?? null, params.checkOutDate ?? null],
    );

    debugLog('[DB cached APR rows latest by airport]', result.rows);

    return result.rows;
}
