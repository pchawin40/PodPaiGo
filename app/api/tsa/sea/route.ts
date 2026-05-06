import { NextResponse } from 'next/server';
import { getLiveSeaTsaWaitTimes } from '../../../../lib/airports/tsa/liveSea';

export async function GET() {
  const waitTimes = await getLiveSeaTsaWaitTimes();

  return NextResponse.json({
    airportCode: 'SEA',
    source: waitTimes ? 'live' : 'fallback',
    waitTimes,
    updatedAt: new Date().toISOString(),
  });
}