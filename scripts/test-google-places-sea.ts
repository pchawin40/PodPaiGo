#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { getAirportById } from '../lib/airports/catalog';

loadEnv({ path: '.env.local', override: true });

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

async function main() {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  console.log('GOOGLE_MAPS_SERVER_API_KEY configured:', Boolean(key));
  if (!key) process.exit(1);

  const airport = getAirportById('SEA');
  if (!airport?.geoLocation) throw new Error('SEA geo missing');

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
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

  const text = await response.text();
  console.log('HTTP status:', response.status);
  console.log('Response body:', text.slice(0, 2000));

  if (response.ok) {
    const data = JSON.parse(text) as { places?: unknown[] };
    console.log('places count:', Array.isArray(data.places) ? data.places.length : 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
