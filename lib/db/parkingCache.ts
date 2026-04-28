import { db } from './client';

export type CachedAprPrice = {
    bookingUrl: string;
    lotId: string;
    lotName: string;
    airportCode: string;
    checkInDate: string;
    checkOutDate: string;
    livePrice: number | null;
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
    select
      booking_url as "bookingUrl",
      lot_id as "lotId",
      lot_name as "lotName",
      airport_code as "airportCode",
      check_in_date::text as "checkInDate",
      check_out_date::text as "checkOutDate",
      price_total as "livePrice",
      source as "priceSource",
      fetched_at::text as "fetchedAt",
      expires_at::text as "expiresAt"
    from parking_price_snapshots
    where airport_code = $1
      and check_in_date = $2
      and check_out_date = $3
      and booking_url = any($4::text[])
      and expires_at > now()
    order by fetched_at desc
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
                    price.livePrice ? 'available' : 'unknown',
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
    checkInDate: string;
    checkOutDate: string;
}): Promise<CachedAprLotSnapshot[]> {
    const result = await db.query(
        `
    select distinct on (booking_url)
      booking_url as "bookingUrl",
      lot_id as "lotId",
      lot_name as "lotName",
      price_total as "livePrice",
      source as "priceSource",
      fetched_at::text as "fetchedAt"
    from parking_price_snapshots
    where airport_code = $1
      and check_in_date = $2
      and check_out_date = $3
      and expires_at > now()
      and booking_url is not null
    order by
       booking_url,
      case when source = 'apr-tracking' then 0 else 1 end,
      fetched_at desc
    `,
        [params.airportCode, params.checkInDate, params.checkOutDate],
    );

    console.log('[DB cached APR rows]', result.rows);

    const skywayDebug = await db.query(
        `
  select
    lot_id,
    lot_name,
    price_total,
    source,
    check_in_date::text,
    check_out_date::text,
    fetched_at::text,
    expires_at::text
  from parking_price_snapshots
  where lower(lot_name) like '%skyway%'
  order by fetched_at desc
  limit 20
  `
    );

    console.log('[DB skyway all recent]', skywayDebug.rows);

    return result.rows;
}