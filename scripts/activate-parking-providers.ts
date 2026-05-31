#!/usr/bin/env node
/**
 * Apply parking provider tables to local Postgres, run Google discover, refresh APR cache.
 */
import fs from 'fs';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';
import { getAirportById } from '../lib/airports/catalog';
import { saveParkingLots } from '../lib/parking/inventory';
import { crawlAirportParkingReservationsSea } from '../lib/providers/airportParkingReservationsCrawler';
import { saveAprPrices } from '../lib/db/parkingCache';

loadEnv({ path: '.env.local', override: true });

const HUB_AIRPORTS = ['SEA', 'PAE', 'LAX', 'JFK', 'ORD', 'ATL', 'DFW', 'LAS', 'MCO'];

function defaultCheckInDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function defaultCheckOutDate(checkIn: string): string {
  const date = new Date(`${checkIn}T12:00:00`);
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

const CHECK_IN = defaultCheckInDate();
const CHECK_OUT = defaultCheckOutDate(CHECK_IN);

function readMigrationSql(sqlPath: string): string {
  const raw = fs.readFileSync(sqlPath, 'utf8');
  return raw.replace(/^\uFEFF/, '');
}

async function applyMigration(connectionString: string) {
  const sqlPath = 'supabase/migrations/20260531120000_parking_provider_tables.sql';
  const sql = readMigrationSql(sqlPath);

  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query(sql);

  for (const table of ['parking_lots', 'parking_price_snapshots', 'parkwhiz_quote_snapshots']) {
    const r = await client.query(`select count(*)::int as n from ${table}`);
    console.log(`${table}: ${r.rows[0].n} rows (post-migration)`);
  }

  await client.end();
}

async function runDiscover(airportCode: string) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) {
    console.warn('Skipping discover — no GOOGLE_MAPS_SERVER_API_KEY');
    return 0;
  }

  const airport = getAirportById(airportCode);
  if (!airport?.geoLocation) return 0;

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.googleMapsUri',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.businessStatus',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: `airport parking near ${airport.label}`,
      locationBias: {
        circle: {
          center: {
            latitude: airport.geoLocation.lat,
            longitude: airport.geoLocation.lng,
          },
          radius: 20000,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`discover ${airportCode}: Google HTTP ${response.status} — ${body.slice(0, 500)}`);
    return 0;
  }

  const data = await response.json() as { places?: Array<Record<string, unknown>> };
  const places = Array.isArray(data.places) ? data.places : [];

  const lots = places
    .filter((place) => {
      const displayName = place.displayName as { text?: string } | undefined;
      const name = String(displayName?.text || '').toLowerCase();
      return name.includes('parking') || name.includes('garage') || name.includes('park');
    })
    .map((place) => {
      const displayName = place.displayName as { text?: string } | undefined;
      const location = place.location as { latitude?: number; longitude?: number } | undefined;
      const name = displayName?.text ?? `${airportCode} Parking`;

      return {
        airportCode,
        name,
        address: (place.formattedAddress as string | undefined) ?? null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        source: 'google-places',
        sourceId: (place.id as string | undefined) ?? null,
        sourceUrl: (place.googleMapsUri as string | undefined) ?? null,
        isOfficial: name.toLowerCase().includes('official'),
        confidence: 0.7,
      };
    });

  const saved = await saveParkingLots(lots);
  console.log(`discover ${airportCode}: saved ${saved} lots from ${places.length} places`);
  return saved;
}

async function refreshApr() {
  console.log(`APR refresh dates: ${CHECK_IN} -> ${CHECK_OUT}`);

  const lots = await crawlAirportParkingReservationsSea({
    checkInDate: CHECK_IN,
    checkOutDate: CHECK_OUT,
    includeSoldOut: false,
  });

  await saveAprPrices(
    lots.map((lot) => ({
      bookingUrl: lot.bookingUrl,
      lotId: String(lot.lotId ?? lot.bookingUrl),
      lotName: lot.lotName,
      airportCode: 'SEA',
      checkInDate: CHECK_IN,
      checkOutDate: CHECK_OUT,
      livePrice: lot.isSoldOut ? null : lot.price,
      availabilityStatus: lot.isSoldOut ? 'unavailable' : lot.price ? 'available' : 'unknown',
      priceSource: 'apr-tracking',
      ttlHours: 12,
    })),
  );

  console.log(`APR refresh: saved ${lots.length} lots for SEA`);
}

async function main() {
  const connectionString = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('No DATABASE_URL or LOCAL_DATABASE_URL');

  console.log(`Using trip dates ${CHECK_IN} -> ${CHECK_OUT} (matches coverage audit defaults)`);

  await applyMigration(connectionString);

  for (const airportCode of HUB_AIRPORTS) {
    await runDiscover(airportCode);
  }

  await refreshApr();

  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();
  const inv = await client.query(`select airport_code, count(*)::int as n from parking_lots group by 1 order by 1`);
  const apr = await client.query(
    `select count(*)::int as n from parking_price_snapshots where airport_code='SEA' and check_in_date=$1 and check_out_date=$2 and expires_at > now()`,
    [CHECK_IN, CHECK_OUT],
  );
  console.log('inventory by airport:', inv.rows);
  console.log(`SEA valid price snapshots (${CHECK_IN}-${CHECK_OUT}):`, apr.rows[0].n);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
