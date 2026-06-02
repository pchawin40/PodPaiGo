import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAuthClient,
  insertOutboundClickEvent,
} from '../../../../lib/monetization/recordOutboundClick';
import { validateOutboundClickPayload } from '../../../../lib/monetization/validateOutboundClick';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    const payload = validateOutboundClickPayload(body);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }

    const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
    const client = createSupabaseAuthClient(accessToken);

    if (!client) {
      return NextResponse.json({ ok: true, stored: false, reason: 'supabase_not_configured' });
    }

    let authenticatedUserId: string | null = null;
    if (accessToken) {
      const { data } = await client.auth.getUser();
      authenticatedUserId = data.user?.id ?? null;
    }

    await insertOutboundClickEvent(client, payload, authenticatedUserId);
    return NextResponse.json({ ok: true, stored: true });
  } catch (error) {
    console.warn('[outbound-click] failed to store event', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json({ ok: true, stored: false, reason: 'store_failed' });
  }
}
