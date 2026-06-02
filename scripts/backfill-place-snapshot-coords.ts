#!/usr/bin/env node
/**
 * Gradually backfill lat/lng/photo metadata on parking_lot_google_place_snapshots.
 *
 * Usage:
 *   BACKFILL_DRY_RUN=true npm run backfill:place-snapshot-coords
 *   npm run backfill:place-snapshot-coords
 *
 * Requires DATABASE_URL (or LOCAL_DATABASE_URL) and GOOGLE_MAPS_SERVER_API_KEY.
 * Does NOT download photo media — only stores photo resource names from Place Details.
 */
import { config as loadEnv } from 'dotenv';
import { getDb } from '../lib/db/client';
import { getGoogleMapsServerApiKey } from '../lib/env/googleMapsServerKey';

loadEnv({ path: '.env.local', override: true });

const DEFAULT_LIMIT = 20;
const DELAY_MS = 1000;

type SnapshotRow = {
  cacheKey: string;
  googlePlaceId: string;
};

type PlaceDetails = {
  lat: number;
  lng: number;
  photoName: string | null;
  photoNames: string[];
};

type BackfillStats = {
  rowsScanned: number;
  rowsUpdated: number;
  rowsSkipped: number;
  googleCallsMade: number;
  remainingMissingCoords: number;
  dryRun: boolean;
  stoppedEarly: boolean;
  stopReason?: string;
};

function readLimit(): number {
  const configured = Number(process.env.BACKFILL_PLACE_SNAPSHOT_LIMIT);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_LIMIT;
}

function isDryRun(): boolean {
  return process.env.BACKFILL_DRY_RUN === 'true';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstPhotoName(photos: Array<{ name?: string }> | undefined): string | null {
  const name = photos?.find((photo) => typeof photo.name === 'string' && photo.name.trim())?.name;
  return name?.trim() || null;
}

function photoNames(photos: Array<{ name?: string }> | undefined, limit = 4): string[] {
  return Array.from(
    new Set(
      (photos ?? [])
        .map((photo) => photo.name)
        .filter((name): name is string => typeof name === 'string' && Boolean(name.trim())),
    ),
  ).slice(0, limit);
}

async function countMissingCoords(): Promise<number> {
  const result = await getDb().query<{ count: string }>(
    `
    select count(*)::text as count
    from parking_lot_google_place_snapshots
    where google_place_id is not null
      and (lat is null or lng is null)
    `,
  );

  return Number(result.rows[0]?.count || 0);
}

async function selectRowsMissingCoords(limit: number): Promise<SnapshotRow[]> {
  const result = await getDb().query<SnapshotRow>(
    `
    select cache_key as "cacheKey", google_place_id as "googlePlaceId"
    from parking_lot_google_place_snapshots
    where google_place_id is not null
      and (lat is null or lng is null)
    order by expires_at desc nulls last, updated_at desc
    limit $1
    `,
    [limit],
  );

  return result.rows.filter((row) => Boolean(row.googlePlaceId?.trim()));
}

function distinctPlaceIds(rows: SnapshotRow[]): string[] {
  return Array.from(
    new Set(rows.map((row) => row.googlePlaceId.trim()).filter(Boolean)),
  );
}

async function rowsMissingCoordsForPlace(placeId: string): Promise<SnapshotRow[]> {
  const result = await getDb().query<SnapshotRow>(
    `
    select cache_key as "cacheKey", google_place_id as "googlePlaceId"
    from parking_lot_google_place_snapshots
    where google_place_id = $1
      and (lat is null or lng is null)
    order by updated_at desc
    `,
    [placeId],
  );

  return result.rows;
}

async function fetchPlaceDetailsForBackfill(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,location,photos',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Google Place Details failed for ${placeId}: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
    );
  }

  const json = (await res.json()) as {
    location?: { latitude?: number; longitude?: number };
    photos?: Array<{ name?: string }>;
  };

  const lat = json.location?.latitude;
  const lng = json.location?.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  const names = photoNames(json.photos, 4);

  return {
    lat,
    lng,
    photoName: firstPhotoName(json.photos),
    photoNames: names,
  };
}

async function updateSnapshotsForPlace(
  placeId: string,
  details: PlaceDetails,
): Promise<number> {
  const result = await getDb().query(
    `
    update parking_lot_google_place_snapshots
    set
      lat = $2,
      lng = $3,
      photo_name = coalesce($4, photo_name),
      photo_names_json = case
        when $5::jsonb = '[]'::jsonb then photo_names_json
        else $5::jsonb
      end,
      updated_at = now()
    where google_place_id = $1
      and (lat is null or lng is null)
    `,
    [
      placeId,
      details.lat,
      details.lng,
      details.photoName,
      JSON.stringify(details.photoNames),
    ],
  );

  return result.rowCount ?? 0;
}

function printStats(stats: BackfillStats): void {
  console.log('');
  console.log('Place snapshot coordinate backfill');
  console.log('----------------------------------');
  console.log(`dry_run:                 ${stats.dryRun}`);
  console.log(`rows_scanned:            ${stats.rowsScanned}`);
  console.log(`rows_updated:          ${stats.rowsUpdated}`);
  console.log(`rows_skipped:            ${stats.rowsSkipped}`);
  console.log(`google_calls_made:       ${stats.googleCallsMade}`);
  console.log(`remaining_missing_coords: ${stats.remainingMissingCoords}`);
  if (stats.stoppedEarly) {
    console.log(`stopped_early:           true`);
    console.log(`stop_reason:             ${stats.stopReason || 'unknown'}`);
  }
}

export async function runPlaceSnapshotCoordBackfill(): Promise<BackfillStats> {
  const dryRun = isDryRun();
  const limit = readLimit();
  const apiKey = getGoogleMapsServerApiKey();

  if (!process.env.DATABASE_URL && !process.env.LOCAL_DATABASE_URL) {
    throw new Error('DATABASE_URL or LOCAL_DATABASE_URL is required.');
  }

  if (!dryRun && !apiKey) {
    throw new Error('GOOGLE_MAPS_SERVER_API_KEY is required unless BACKFILL_DRY_RUN=true.');
  }

  const scannedRows = await selectRowsMissingCoords(limit);
  const placeIds = distinctPlaceIds(scannedRows);
  const rowsScanned = scannedRows.length;

  const stats: BackfillStats = {
    rowsScanned,
    rowsUpdated: 0,
    rowsSkipped: 0,
    googleCallsMade: 0,
    remainingMissingCoords: await countMissingCoords(),
    dryRun,
    stoppedEarly: false,
  };

  if (placeIds.length === 0) {
    printStats(stats);
    return stats;
  }

  console.log(
    dryRun
      ? `[dry run] Would process ${placeIds.length} distinct google_place_id value(s) from ${rowsScanned} scanned snapshot row(s).`
      : `Processing ${placeIds.length} distinct google_place_id value(s) from ${rowsScanned} scanned snapshot row(s).`,
  );

  for (let index = 0; index < placeIds.length; index += 1) {
    if (stats.googleCallsMade >= limit) {
      console.warn(`Reached BACKFILL_PLACE_SNAPSHOT_LIMIT (${limit}) Google call cap; stopping.`);
      break;
    }

    const placeId = placeIds[index];
    const targetRows = await rowsMissingCoordsForPlace(placeId);

    if (targetRows.length === 0) {
      stats.rowsSkipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry run] place_id=${placeId} rows=${targetRows.length} — would call Google Place Details (field mask: id,location,photos)`,
      );
      continue;
    }

    try {
      if (index > 0) {
        await sleep(DELAY_MS);
      }

      stats.googleCallsMade += 1;
      const details = await fetchPlaceDetailsForBackfill(placeId, apiKey!);

      if (!details) {
        stats.rowsSkipped += targetRows.length;
        console.warn(`Skipped ${placeId}: Place Details returned no coordinates.`);
        continue;
      }

      const updated = await updateSnapshotsForPlace(placeId, details);
      stats.rowsUpdated += updated;

      console.log(
        `Updated place_id=${placeId} rows=${updated} lat=${details.lat} lng=${details.lng} photos=${details.photoNames.length}`,
      );
    } catch (error) {
      stats.stoppedEarly = true;
      stats.stopReason = error instanceof Error ? error.message : String(error);
      console.error(stats.stopReason);
      break;
    }
  }

  stats.remainingMissingCoords = await countMissingCoords();
  printStats(stats);
  return stats;
}

async function main(): Promise<void> {
  const stats = await runPlaceSnapshotCoordBackfill();

  if (stats.stoppedEarly) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
