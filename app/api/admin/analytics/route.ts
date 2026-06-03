import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '../../../../lib/admin/adminAuth';
import {
  getAnalyticsDashboardData,
  type AnalyticsDateRange,
} from '../../../../lib/admin/analyticsDashboard';
import { createSupabaseAuthClient } from '../../../../lib/monetization/recordOutboundClick';

export const runtime = 'nodejs';

const RANGES = new Set<AnalyticsDateRange>(['today', '7d', '30d', 'all']);

function parseRange(value: string | null): AnalyticsDateRange {
  if (value && RANGES.has(value as AnalyticsDateRange)) {
    return value as AnalyticsDateRange;
  }
  return '7d';
}

export async function GET(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const authClient = createSupabaseAuthClient(accessToken);

  if (!authClient || !accessToken) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { data } = await authClient.auth.getUser();
  const email = data.user?.email ?? null;

  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const range = parseRange(request.nextUrl.searchParams.get('range'));
  const airportCode = request.nextUrl.searchParams.get('airport');

  const dashboard = await getAnalyticsDashboardData({
    range,
    airportCode,
  });

  return NextResponse.json(dashboard);
}
