import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { createSupabaseServiceClient } from '@/lib/analytics/insertAnalyticsEvent';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const client = createSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ feedback: [], stored: false, reason: 'supabase_not_configured' });
  }

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(Number.parseInt(limitRaw || '50', 10) || 50, 1), 100);

  const { data, error } = await client
    .from('analytics_events')
    .select('id, created_at, event_properties, page_path, user_agent, user_id, anonymous_id, session_id')
    .eq('event_name', 'feedback_submitted')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: 'feedback_query_failed', message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ feedback: data ?? [], stored: true });
}
