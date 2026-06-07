import { NextRequest, NextResponse } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';
import {
  cachePhotoMedia,
  dedupePhotoMediaFetch,
  getCachedPhotoMedia,
} from '@/lib/parking/placeMediaCache';
import { canMakeLivePhotoMediaCall } from '@/lib/parking/googlePlacesGuard';
import {
  hasPhotoMediaBeenRequestedThisRequest,
  markPhotoMediaRequestedThisRequest,
  runWithPlacesRequestBudget,
} from '@/lib/apiUsage/placesRequestBudget';

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
  const maxWidthPx = normalizedMaxWidth(req.nextUrl.searchParams.get('maxWidthPx'));

  if (!apiKey || !isSafePhotoName(name)) {
    return unavailableResponse();
  }

  const cached = getCachedPhotoMedia(name, maxWidthPx);
  if (cached) {
    const headers = new Headers();
    headers.set('Content-Type', cached.contentType);
    headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    headers.set('X-Place-Photo-Cache', 'hit');
    return new Response(cached.body, { status: 200, headers });
  }

  return runWithPlacesRequestBudget(`google-place-photo:${name}`, async () => {
    if (hasPhotoMediaBeenRequestedThisRequest(name)) {
      const deduped = getCachedPhotoMedia(name, maxWidthPx);
      if (deduped) {
        const headers = new Headers();
        headers.set('Content-Type', deduped.contentType);
        headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        headers.set('X-Place-Photo-Cache', 'deduped');
        return new Response(deduped.body, { status: 200, headers });
      }
    }

    markPhotoMediaRequestedThisRequest(name);

    if (
      !canMakeLivePhotoMediaCall({
        reason: 'place_photo_media',
        route: '/api/google-place-photo',
        cacheKey: name,
      })
    ) {
      return unavailableResponse();
    }

    const params = new URLSearchParams({
      maxWidthPx: String(maxWidthPx),
      key: apiKey,
    });

    const url = `https://places.googleapis.com/v1/${encodePhotoName(name)}/media?${params.toString()}`;

    try {
      const media = await dedupePhotoMediaFetch(name, maxWidthPx, async () => {
        const upstream = await fetch(url, {
          cache: 'no-store',
          redirect: 'follow',
        });

        const contentType = upstream.headers.get('content-type') || '';
        if (!upstream.ok || !upstream.body || !contentType.toLowerCase().startsWith('image/')) {
          return null;
        }

        const body = await upstream.arrayBuffer();
        return { body, contentType, ts: Date.now() };
      });

      if (!media) {
        return unavailableResponse();
      }

      cachePhotoMedia(name, maxWidthPx, media.body, media.contentType);

      const headers = new Headers();
      headers.set('Content-Type', media.contentType);
      headers.set(
        'Cache-Control',
        'public, max-age=86400, stale-while-revalidate=604800',
      );
      headers.set('X-Place-Photo-Cache', 'miss');
      headers.set('Content-Length', String(media.body.byteLength));

      return new Response(media.body, {
        status: 200,
        headers,
      });
    } catch {
      return unavailableResponse();
    }
  });
}
