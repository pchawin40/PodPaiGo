import { NextResponse } from 'next/server';

export function requireCronAuthorization(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization')?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    return null;
  }

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  return null;
}
