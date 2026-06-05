import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/admin/adminAuth';
import { createSupabaseAuthClient } from '@/lib/monetization/recordOutboundClick';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const authClient = createSupabaseAuthClient(accessToken);

  if (!authClient || !accessToken) {
    return NextResponse.json({
      signedIn: false,
      isAdmin: false,
    });
  }

  const { data } = await authClient.auth.getUser();
  const email = data.user?.email ?? null;

  return NextResponse.json({
    signedIn: Boolean(data.user),
    isAdmin: isAdminEmail(email),
    email: email ?? undefined,
  });
}
