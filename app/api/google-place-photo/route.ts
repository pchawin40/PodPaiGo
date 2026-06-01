import { NextRequest, NextResponse } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';

function googleMapsApiKey(): string | null {
  return getGoogleMapsServerApiKey() ?? null;
}

function unavailableResponse() {
  return NextResponse.json(
    {
      imageUrl: null,
      status: 'unavailable',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    }
  );
}

function normalizedMaxWidth(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 900;
  return Math.min(Math.round(parsed), 4800);
}

function isSafePhotoName(name: string): boolean {
  return /^places\/[^/?#]+\/photos\/[^/?#]+$/.test(name);
}

function encodePhotoName(name: string): string {
  return name.split('/').map((part) => encodeURIComponent(part)).join('/');
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim() || '';
  const apiKey = googleMapsApiKey();

  if (!apiKey || !isSafePhotoName(name)) {
    return unavailableResponse();
  }

  const params = new URLSearchParams({
    maxWidthPx: String(normalizedMaxWidth(req.nextUrl.searchParams.get('maxWidthPx'))),
    key: apiKey,
  });

  const url = `https://places.googleapis.com/v1/${encodePhotoName(name)}/media?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !upstream.body || !contentType.toLowerCase().startsWith('image/')) {
      return unavailableResponse();
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set(
      'Cache-Control',
      upstream.headers.get('cache-control') || 'public, max-age=86400, stale-while-revalidate=604800'
    );

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch {
    return unavailableResponse();
  }
}
