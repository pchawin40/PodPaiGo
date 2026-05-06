import { debugLog } from '../utils/debug';
import { db } from './client';
import { ParkingOption } from '../types';

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
on conflict (airport_code, booking_url, check_in_date, check_out_date)
do update set
  lot_id = excluded.lot_id,
  lot_name = excluded.lot_name,
  price_total = excluded.price_total,
  price_daily = excluded.price_daily,
  currency = excluded.currency,
  availability_status = excluded.availability_status,
  source = excluded.source,
  fetched_at = excluded.fetched_at,
  expires_at = excluded.expires_at
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


export type CachedParkWhizQuotes = {
    options: ParkingOption[];
    fetchedAt: string;
    expiresAt: string;
};

export function buildParkWhizCacheKey(params: {
    airportCode: string;
    checkInAt: string;
    checkOutAt: string;
    distanceMiles?: number;
}): string {
    return [
        'parkwhiz',
        params.airportCode.toUpperCase(),
        params.checkInAt,
        params.checkOutAt,
        params.distanceMiles ?? 5,
    ].join('|');
}

export async function getCachedParkWhizQuotes(params: {
    airportCode: string;
    checkInAt: string;
    checkOutAt: string;
    distanceMiles?: number;
}): Promise<CachedParkWhizQuotes | null> {
    const cacheKey = buildParkWhizCacheKey(params);

    const result = await db.query(
        `
        select
          options_json as "options",
          fetched_at::text as "fetchedAt",
          expires_at::text as "expiresAt"
        from parkwhiz_quote_snapshots
        where cache_key = $1
          and expires_at > now()
        order by fetched_at desc
        limit 1
        `,
        [cacheKey],
    );

    if (result.rows.length === 0) return null;

    return {
        options: result.rows[0].options as ParkingOption[],
        fetchedAt: result.rows[0].fetchedAt,
        expiresAt: result.rows[0].expiresAt,
    };
}

export async function saveParkingPriceSnapshotsFromOptions(params: {
    airportCode: string;
    checkInDate: string;
    checkOutDate: string;
    source: string;
    options: ParkingOption[];
    ttlHours?: number;
}): Promise<void> {
    const priced = params.options.filter(
        (option) => typeof option.price === 'number' && option.price > 0
    );

    if (priced.length === 0) return;

    const client = await db.connect();

    try {
        await client.query('begin');

        for (const option of priced) {
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
          $6, $7, 'USD', $8, $9,
          $10, now(), now() + ($11 || ' hours')::interval
        )
        on conflict (airport_code, booking_url, check_in_date, check_out_date)
        do update set
          lot_id = excluded.lot_id,
          lot_name = excluded.lot_name,
          price_total = excluded.price_total,
          price_daily = excluded.price_daily,
          currency = excluded.currency,
          availability_status = excluded.availability_status,
          source = excluded.source,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
        `,
                [
                    option.providerLotId || option.googlePlaceId || option.id,
                    option.name,
                    params.airportCode.toUpperCase(),
                    params.checkInDate,
                    params.checkOutDate,
                    option.price,
                    option.priceUnit === 'total'
                        ? option.price / Math.max(
                            1,
                            Math.ceil(
                                (new Date(params.checkOutDate).getTime() - new Date(params.checkInDate).getTime()) /
                                (1000 * 60 * 60 * 24)
                            )
                        )
                        : option.price,
                    option.availabilityStatus || 'available',
                    option.sourceLink || option.mapLink || '',
                    params.source,
                    params.ttlHours ?? 2,
                ]
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

export type LatestParkingPriceSnapshot = {
    lotName: string;
    airportCode: string;
    checkInDate: string;
    checkOutDate: string;
    priceTotal: number | null;
    priceDaily: number | null;
    availabilityStatus: string | null;
    bookingUrl: string | null;
    source: string | null;
    fetchedAt: string;
};

export async function getLatestParkingPriceSnapshots(params: {
    airportCode: string;
    checkInDate?: string;
    checkOutDate?: string;
}): Promise<LatestParkingPriceSnapshot[]> {
    if (!params.checkInDate || !params.checkOutDate) return [];

    const result = await db.query(
        `
    select distinct on (lower(lot_name), source)
      lot_name as "lotName",
      airport_code as "airportCode",
      check_in_date::text as "checkInDate",
      check_out_date::text as "checkOutDate",
      price_total::float8 as "priceTotal",
      price_daily::float8 as "priceDaily",
      availability_status as "availabilityStatus",
      booking_url as "bookingUrl",
      source,
      fetched_at::text as "fetchedAt"
    from parking_price_snapshots
    where airport_code = $1
      and check_in_date = $2::date
      and check_out_date = $3::date
      and (
        expires_at > now()
        or fetched_at > now() - interval '7 days'
      )
    order by
      lower(lot_name),
      source,
      fetched_at desc
    `,
        [
            params.airportCode.toUpperCase(),
            params.checkInDate,
            params.checkOutDate,
        ],
    );

    return result.rows;
}

export async function saveParkWhizQuotes(params: {
    airportCode: string;
    checkInAt: string;
    checkOutAt: string;
    distanceMiles?: number;
    options: ParkingOption[];
    ttlHours?: number;
}): Promise<void> {
    const distanceMiles = params.distanceMiles ?? 5;

    const cacheKey = buildParkWhizCacheKey({
        airportCode: params.airportCode,
        checkInAt: params.checkInAt,
        checkOutAt: params.checkOutAt,
        distanceMiles,
    });

    await db.query(
        `
        insert into parkwhiz_quote_snapshots (
          airport_code,
          check_in_at,
          check_out_at,
          distance_miles,
          cache_key,
          options_json,
          fetched_at,
          expires_at
        )
        values (
          $1, $2, $3, $4, $5, $6::jsonb, now(), now() + ($7 || ' hours')::interval
        )
        on conflict (cache_key)
        do update set
          options_json = excluded.options_json,
          fetched_at = now(),
          expires_at = excluded.expires_at
        `,
        [
            params.airportCode.toUpperCase(),
            params.checkInAt,
            params.checkOutAt,
            distanceMiles,
            cacheKey,
            JSON.stringify(params.options),
            params.ttlHours ?? 2,
        ],
    );
}