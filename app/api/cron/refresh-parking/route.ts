import { NextResponse } from 'next/server';
import { refreshParkingPrices } from '../../../../lib/jobs/refreshParkingPrices';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');

  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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