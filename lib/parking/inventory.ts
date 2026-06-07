import { db, parkingDbCacheDisabledByConfig } from '../db/client';
import { getAirportById } from '../airports/catalog';
import { withTimeout } from '../utils/asyncTimeout';

const PARKING_DB_READ_TIMEOUT_MS =
  Number(process.env.PARKING_DB_READ_TIMEOUT_MS || 4000);

function parkingDbCacheDisabled(): boolean {
    return parkingDbCacheDisabledByConfig();
}

export type ParkingLotInventoryInput = {
    airportCode: string;
    name: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    source: string;
    sourceId?: string | null;
    sourceUrl?: string | null;
    isOfficial?: boolean;
    confidence?: number;
};

export type ParkingLotInventoryRow = ParkingLotInventoryInput & {
    id: number;
    normalizedName: string;
    createdAt: string;
    updatedAt: string;
    distanceMiles?: number;
};

function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function saveParkingLots(
    lots: ParkingLotInventoryInput[],
): Promise<number> {
    if (lots.length === 0) return 0;
    if (parkingDbCacheDisabled()) return 0;

    const client = await db.connect();

    try {
        await client.query('begin');

        let saved = 0;

        for (const lot of lots) {
            const normalizedName = normalizeName(lot.name);
            const sourceId = lot.sourceId ?? `${normalizedName}|${lot.address ?? ''}`;

            await client.query(
                `
        insert into parking_lots (
          airport_code,
          name,
          normalized_name,
          address,
          latitude,
          longitude,
          source,
          source_id,
          source_url,
          is_official,
          confidence,
          updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
        on conflict (airport_code, source, source_id)
        do update set
          name = excluded.name,
          normalized_name = excluded.normalized_name,
          address = excluded.address,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          source_url = excluded.source_url,
          is_official = excluded.is_official,
          confidence = excluded.confidence,
          updated_at = now()
        `,
                [
                    lot.airportCode.toUpperCase(),
                    lot.name,
                    normalizedName,
                    lot.address ?? null,
                    lot.latitude ?? null,
                    lot.longitude ?? null,
                    lot.source,
                    sourceId,
                    lot.sourceUrl ?? null,
                    lot.isOfficial ?? false,
                    lot.confidence ?? 0.5,
                ],
            );

            saved += 1;
        }

        await client.query('commit');
        return saved;
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}

export async function getParkingLotsByAirport(
    airportCode: string,
    limit = 50,
    radiusMiles = 25,
): Promise<ParkingLotInventoryRow[]> {
    const airport = getAirportById(airportCode.toUpperCase());

    if (!airport?.geoLocation?.lat || !airport?.geoLocation?.lng) {
        return [];
    }

    if (parkingDbCacheDisabled()) return [];

    try {
        const result = await withTimeout(
            db.query(
                `
    with airport as (
      select
        $2::float8 as airport_lat,
        $3::float8 as airport_lng
    )
    select
      id,
      airport_code as "airportCode",
      name,
      normalized_name as "normalizedName",
      address,
      latitude,
      longitude,
      source,
      source_id as "sourceId",
      source_url as "sourceUrl",
      is_official as "isOfficial",
      confidence,
      created_at::text as "createdAt",
      updated_at::text as "updatedAt",
      (
        3958.8 * acos(
          least(
            1,
            cos(radians((select airport_lat from airport)))
            * cos(radians(latitude))
            * cos(radians(longitude) - radians((select airport_lng from airport)))
            + sin(radians((select airport_lat from airport)))
            * sin(radians(latitude))
          )
        )
      ) as "distanceMiles"
    from parking_lots
    where airport_code = $1
      and latitude is not null
      and longitude is not null
      and (
        3958.8 * acos(
          least(
            1,
            cos(radians((select airport_lat from airport)))
            * cos(radians(latitude))
            * cos(radians(longitude) - radians((select airport_lng from airport)))
            + sin(radians((select airport_lat from airport)))
            * sin(radians(latitude))
          )
        )
      ) <= $4
    order by
      confidence desc,
      updated_at desc,
      name asc
    limit $5
    `,
        [
            airportCode.toUpperCase(),
            airport.geoLocation.lat,
            airport.geoLocation.lng,
            radiusMiles,
            limit,
        ],
            ),
            PARKING_DB_READ_TIMEOUT_MS,
            'Parking inventory DB read',
        );

        return result.rows;
    } catch (error) {
        console.warn('Parking inventory DB read failed', error);
        return [];
    }
}

export async function getParkingLotsNearPoint(args: {
    lat?: number | null;
    lng?: number | null;
    limit?: number;
    radiusMiles?: number;
    destinationKind?: string | null;
}): Promise<ParkingLotInventoryRow[]> {
    const latitude = args.lat;
    const longitude = args.lng;

    if (
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude)
    ) {
        return [];
    }

    if (parkingDbCacheDisabled()) return [];

    const limit = Number.isFinite(args.limit) && args.limit && args.limit > 0
        ? Math.floor(args.limit)
        : 20;
    const radiusMiles = Number.isFinite(args.radiusMiles) && args.radiusMiles && args.radiusMiles > 0
        ? args.radiusMiles
        : 2.5;

    try {
        const result = await withTimeout(
            db.query(
                `
    with destination as (
      select
        $1::float8 as destination_lat,
        $2::float8 as destination_lng
    ),
    lots_with_distance as (
      select
        id,
        airport_code as "airportCode",
        name,
        normalized_name as "normalizedName",
        address,
        latitude,
        longitude,
        source,
        source_id as "sourceId",
        source_url as "sourceUrl",
        is_official as "isOfficial",
        confidence,
        created_at::text as "createdAt",
        updated_at::text as "updatedAt",
        (
          3958.8 * acos(
            least(
              1,
              cos(radians((select destination_lat from destination)))
              * cos(radians(latitude))
              * cos(radians(longitude) - radians((select destination_lng from destination)))
              + sin(radians((select destination_lat from destination)))
              * sin(radians(latitude))
            )
          )
        ) as "distanceMiles"
      from parking_lots
      where latitude is not null
        and longitude is not null
    )
    select *
    from lots_with_distance
    where "distanceMiles" <= $3
    order by
      "distanceMiles" asc,
      confidence desc,
      "updatedAt" desc,
      name asc
    limit $4
    `,
                [latitude, longitude, radiusMiles, limit],
            ),
            PARKING_DB_READ_TIMEOUT_MS,
            'Destination parking inventory DB read',
        );

        return result.rows;
    } catch (error) {
        console.warn('Destination parking inventory DB read failed', error);
        return [];
    }
}

export async function getParkingLotsNearDestination(args: {
    latitude?: number | null;
    longitude?: number | null;
    limit?: number;
    radiusMiles?: number;
    destinationKind?: string | null;
}): Promise<ParkingLotInventoryRow[]> {
    return getParkingLotsNearPoint({
        lat: args.latitude,
        lng: args.longitude,
        limit: args.limit,
        radiusMiles: args.radiusMiles,
        destinationKind: args.destinationKind,
    });
}
