/**
 * Import US airports from OurAirports CSV into Postgres and bundled JSON.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/import-us-airports.ts
 *
 * Env:
 *   DATABASE_URL or LOCAL_DATABASE_URL — optional, upserts into public.airports
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { mapOurAirportsCsvRow } from '../lib/airports/lookupService';
import type { NationalAirportRecord } from '../lib/airports/records';
import { AIRPORT_ENRICHMENT } from '../lib/airports/enrichment';

const OURAIRPORTS_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

async function fetchOurAirportsCsv(): Promise<string> {
  const response = await fetch(OURAIRPORTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to download OurAirports CSV: HTTP ${response.status}`);
  }
  return response.text();
}

function dedupeRecords(records: NationalAirportRecord[]): NationalAirportRecord[] {
  const byCode = new Map<string, NationalAirportRecord>();

  for (const record of records) {
    const existing = byCode.get(record.airportCode);
    if (!existing) {
      byCode.set(record.airportCode, record);
      continue;
    }

    const existingScore =
      (existing.iata ? 2 : 0) +
      (existing.airportType === 'large_airport' ? 3 : existing.airportType === 'medium_airport' ? 2 : 1);
    const nextScore =
      (record.iata ? 2 : 0) +
      (record.airportType === 'large_airport' ? 3 : record.airportType === 'medium_airport' ? 2 : 1);

    if (nextScore >= existingScore) {
      byCode.set(record.airportCode, record);
    }
  }

  return [...byCode.values()].sort((a, b) => a.airportCode.localeCompare(b.airportCode));
}

async function upsertToDatabase(records: NationalAirportRecord[]): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL;

  if (!connectionString) {
    console.log('Skipping database upsert (DATABASE_URL not configured).');
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query('begin');

    for (const record of records) {
      const enrichment = AIRPORT_ENRICHMENT[record.iata || record.airportCode] || {};

      await pool.query(
        `
        insert into airports (
          airport_code,
          iata,
          icao,
          name,
          city,
          state,
          country,
          latitude,
          longitude,
          timezone,
          airport_type,
          keywords,
          is_active,
          destination_name,
          routing_address,
          parking_search_query,
          rideshare_destination_name,
          checkin_note,
          generic_guidance,
          official_parking_url,
          official_airport_url,
          indoor_map,
          updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,
          $13,$14,$15,$16,$17,$18,$19,$20,$21,now()
        )
        on conflict (airport_code) do update set
          iata = excluded.iata,
          icao = excluded.icao,
          name = excluded.name,
          city = excluded.city,
          state = excluded.state,
          country = excluded.country,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          timezone = excluded.timezone,
          airport_type = excluded.airport_type,
          keywords = excluded.keywords,
          destination_name = coalesce(excluded.destination_name, airports.destination_name),
          routing_address = coalesce(excluded.routing_address, airports.routing_address),
          parking_search_query = coalesce(excluded.parking_search_query, airports.parking_search_query),
          rideshare_destination_name = coalesce(excluded.rideshare_destination_name, airports.rideshare_destination_name),
          checkin_note = coalesce(excluded.checkin_note, airports.checkin_note),
          generic_guidance = coalesce(excluded.generic_guidance, airports.generic_guidance),
          official_parking_url = coalesce(excluded.official_parking_url, airports.official_parking_url),
          official_airport_url = coalesce(excluded.official_airport_url, airports.official_airport_url),
          indoor_map = coalesce(excluded.indoor_map, airports.indoor_map),
          updated_at = now()
        `,
        [
          record.airportCode,
          record.iata,
          record.icao,
          record.name,
          record.city,
          record.state,
          record.country,
          record.latitude,
          record.longitude,
          record.timezone,
          record.airportType ?? null,
          record.keywords ?? null,
          enrichment.destinationName ?? null,
          enrichment.routingAddress ?? null,
          enrichment.parkingSearchQuery ?? null,
          enrichment.rideshareDestinationName ?? null,
          enrichment.checkinNote ?? null,
          enrichment.genericGuidance ?? null,
          enrichment.officialParkingUrl ?? null,
          enrichment.officialAirportUrl ?? null,
          enrichment.indoorMap ? JSON.stringify(enrichment.indoorMap) : null,
        ],
      );
    }

    await pool.query('commit');
    console.log(`Upserted ${records.length} airports into database.`);
  } catch (error) {
    await pool.query('rollback');
    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('Downloading OurAirports CSV...');
  const csv = await fetchOurAirportsCsv();
  const rows = parseCsv(csv);

  const mapped = rows
    .map((row) => mapOurAirportsCsvRow(row))
    .filter((record): record is NationalAirportRecord => Boolean(record));

  const records = dedupeRecords(mapped);
  const outputPath = path.join(__dirname, '../data/airports-us.generated.json');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));

  console.log(`Wrote ${records.length} US airports to ${outputPath}`);

  await upsertToDatabase(records);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
