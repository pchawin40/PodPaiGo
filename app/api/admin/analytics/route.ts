import { NextRequest, NextResponse } from 'next/server';
import {
  getAnalyticsDashboardData,
  type AnalyticsDateRange,
} from '../../../../lib/admin/analyticsDashboard';
import { requireAdmin } from '../../../../lib/auth/admin';

export const runtime = 'nodejs';

const RANGES = new Set<AnalyticsDateRange>(['today', '7d', '30d', 'all']);

function parseRange(value: string | null): AnalyticsDateRange {
  if (value && RANGES.has(value as AnalyticsDateRange)) {
    return value as AnalyticsDateRange;
  }
  return '7d';
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const range = parseRange(request.nextUrl.searchParams.get('range'));
  const airportCode = request.nextUrl.searchParams.get('airport');

  const dashboard = await getAnalyticsDashboardData({
    range,
    airportCode,
  });

  return NextResponse.json(dashboard);
}
