import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  return NextResponse.json({
    signedIn: true,
    isAdmin: true,
    email: admin.email ?? undefined,
  });
}
