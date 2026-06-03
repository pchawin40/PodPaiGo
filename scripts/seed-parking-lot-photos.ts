#!/usr/bin/env npx ts-node
/**
 * Dev/admin helper to seed first-party or provider parking lot photo URLs.
 * Does NOT download Google photo bytes or upload Google images to Supabase Storage.
 *
 * Example:
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-parking-lot-photos.ts \
 *   --airport SEA --provider inventory --provider-lot-id 42 \
 *   --url https://example.com/jiffy-lot.jpg --source first_party \
 *   --attribution "PodPaiGo" --primary
 */

import 'dotenv/config';
import { getDb } from '../lib/db/client';

type SeedArgs = {
  airportCode: string | null;
  parkingLotId: string | null;
  provider: string | null;
  providerLotId: string | null;
  googlePlaceId: string | null;
  imageUrl: string;
  source: 'first_party' | 'partner' | 'provider';
  attribution: string | null;
  attributionUrl: string | null;
  licenseNote: string | null;
  storagePath: string | null;
  isPrimary: boolean;
};

function readArg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1]?.trim() || null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseArgs(): SeedArgs {
  const imageUrl = readArg('url');
  if (!imageUrl) {
    throw new Error('--url is required');
  }

  if (imageUrl.includes('/api/google-place-photo') || imageUrl.includes('places.googleapis.com')) {
    throw new Error('Refusing to seed Google proxy or Google media URLs. Use first-party/partner/provider URLs only.');
  }

  const source = (readArg('source') || 'first_party') as SeedArgs['source'];
  if (!['first_party', 'partner', 'provider'].includes(source)) {
    throw new Error('--source must be first_party, partner, or provider');
  }

  return {
    airportCode: readArg('airport')?.toUpperCase() || null,
    parkingLotId: readArg('parking-lot-id'),
    provider: readArg('provider'),
    providerLotId: readArg('provider-lot-id'),
    googlePlaceId: readArg('google-place-id'),
    imageUrl,
    source,
    attribution: readArg('attribution'),
    attributionUrl: readArg('attribution-url'),
    licenseNote: readArg('license-note'),
    storagePath: readArg('storage-path'),
    isPrimary: hasFlag('primary'),
  };
}

async function main() {
  const args = parseArgs();

  if (!args.parkingLotId && !(args.provider && args.providerLotId) && !args.googlePlaceId) {
    throw new Error('Provide at least one of --parking-lot-id, --provider + --provider-lot-id, or --google-place-id');
  }

  const result = await getDb().query(
    `
      insert into parking_lot_photos (
        parking_lot_id,
        provider,
        provider_lot_id,
        google_place_id,
        airport_code,
        image_url,
        storage_path,
        source,
        attribution,
        attribution_url,
        license_note,
        is_primary
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      returning id
    `,
    [
      args.parkingLotId,
      args.provider,
      args.providerLotId,
      args.googlePlaceId,
      args.airportCode,
      args.imageUrl,
      args.storagePath,
      args.source,
      args.attribution,
      args.attributionUrl,
      args.licenseNote,
      args.isPrimary,
    ],
  );

  const id = result.rows[0]?.id;
  console.log(`Seeded parking lot photo ${id} (${args.source}) for ${args.airportCode || 'unknown airport'}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
