import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildParkingDiagnostics } from '@/lib/providers/parking/coverage/diagnostics';
import {
  buildAirportCoverageDashboard,
  formatCoverageDashboardMarkdown,
} from '@/lib/providers/parking/coverage/audit';
import {
  compareCoverageDashboards,
  formatCoverageImprovementMarkdown,
} from '@/lib/providers/parking/coverage/compare';
import type { AirportCoverageDashboard } from '@/lib/providers/parking/coverage/types';
import { getProviderSetupChecklist } from '@/lib/providers/parking/coverage/setupChecklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASELINE_PATH = join(process.cwd(), 'data', 'parking-coverage-baseline.json');
const AFTER_PATH = join(process.cwd(), 'data', 'parking-coverage-report.json');
const IMPROVEMENT_PATH = join(process.cwd(), 'data', 'parking-coverage-improvement.json');

function readDashboard(path: string): AirportCoverageDashboard | null {
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AirportCoverageDashboard;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const airportCode = request.nextUrl.searchParams.get('airportCode') || 'SEA';
  const checkInDate = request.nextUrl.searchParams.get('checkInDate') || undefined;
  const checkOutDate = request.nextUrl.searchParams.get('checkOutDate') || undefined;

  const diagnostics = await buildParkingDiagnostics({
    airportCode,
    checkInDate,
    checkOutDate,
  });

  const baseline = readDashboard(BASELINE_PATH);
  const after = readDashboard(AFTER_PATH);
  const improvement = baseline && after
    ? compareCoverageDashboards(baseline, after)
    : null;

  return NextResponse.json({
    diagnostics,
    setupChecklist: getProviderSetupChecklist(),
    improvement,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const airportCodes = Array.isArray(body.airportCodes)
      ? body.airportCodes
      : undefined;

    const dashboard = await buildAirportCoverageDashboard({ airportCodes });

    writeFileSync(AFTER_PATH, JSON.stringify(dashboard, null, 2));
    writeFileSync(
      join(process.cwd(), 'data', 'parking-coverage-report.md'),
      formatCoverageDashboardMarkdown(dashboard),
    );

    const baseline = readDashboard(BASELINE_PATH);
    let improvement = null;

    if (baseline) {
      improvement = compareCoverageDashboards(baseline, dashboard);
      writeFileSync(IMPROVEMENT_PATH, JSON.stringify(improvement, null, 2));
      writeFileSync(
        join(process.cwd(), 'data', 'parking-coverage-improvement.md'),
        formatCoverageImprovementMarkdown(improvement),
      );
    }

    return NextResponse.json({
      status: 'ok',
      dashboard,
      improvement,
      baselinePresent: Boolean(baseline),
    });
  } catch (error) {
    console.error('[parking diagnostics audit]', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
