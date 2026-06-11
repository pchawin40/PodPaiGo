import { NextResponse } from 'next/server';
import { refreshParkingPrices } from '../../../../lib/jobs/refreshParkingPrices';
import { requireCronAuthorization } from '../../../../lib/auth/cron';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireCronAuthorization(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await refreshParkingPrices();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[cron refresh-parking] failed:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Parking refresh failed',
      },
      { status: 500 },
    );
  }
}
