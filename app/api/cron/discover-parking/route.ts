import { NextResponse } from 'next/server';
import { requireCronAuthorization } from '../../../../lib/auth/cron';

export const runtime = 'nodejs';

const AIRPORTS_TO_REFRESH = ['SEA', 'PAE', 'GEG', 'BLI', 'PSC'];

export async function GET(req: Request) {
  const unauthorized = requireCronAuthorization(req);
  if (unauthorized) return unauthorized;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL;

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Missing NEXT_PUBLIC_APP_URL or BASE_URL' },
      { status: 500 }
    );
  }

  const results = [];

  for (const airportCode of AIRPORTS_TO_REFRESH) {
    const res = await fetch(`${baseUrl}/api/parking/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CRON_SECRET?.trim()
          ? { Authorization: `Bearer ${process.env.CRON_SECRET.trim()}` }
          : {}),
      },
      body: JSON.stringify({
        airportCode,
        radiusMeters: 20000,
      }),
    });

    const data = await res.json();

    results.push({
      airportCode,
      status: res.status,
      data,
    });
  }

  return NextResponse.json({
    ok: true,
    refreshed: results,
  });
}
