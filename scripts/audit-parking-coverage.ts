#!/usr/bin/env node
/**
 * Runs live provider coverage audit for hub airports.
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/audit-parking-coverage.ts
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  buildAirportCoverageDashboard,
  formatCoverageDashboardMarkdown,
} from '../lib/providers/parking/coverage/audit';
import {
  compareCoverageDashboards,
  formatCoverageImprovementMarkdown,
} from '../lib/providers/parking/coverage/compare';
import type { AirportCoverageDashboard } from '../lib/providers/parking/coverage/types';

loadEnv({ path: '.env.local', override: true });

const baselinePath = join(process.cwd(), 'data', 'parking-coverage-baseline.json');
const reportPath = join(process.cwd(), 'data', 'parking-coverage-report.json');

async function main() {
  const dashboard = await buildAirportCoverageDashboard();
  const markdown = formatCoverageDashboardMarkdown(dashboard);
  const mdPath = join(process.cwd(), 'data', 'parking-coverage-report.md');

  writeFileSync(reportPath, JSON.stringify(dashboard, null, 2));
  writeFileSync(mdPath, markdown);

  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as AirportCoverageDashboard;
    const improvement = compareCoverageDashboards(baseline, dashboard);
    writeFileSync(
      join(process.cwd(), 'data', 'parking-coverage-improvement.json'),
      JSON.stringify(improvement, null, 2),
    );
    writeFileSync(
      join(process.cwd(), 'data', 'parking-coverage-improvement.md'),
      formatCoverageImprovementMarkdown(improvement),
    );
    console.log(formatCoverageImprovementMarkdown(improvement));
  } else {
    writeFileSync(baselinePath, JSON.stringify(dashboard, null, 2));
    console.log('Saved baseline to data/parking-coverage-baseline.json');
  }

  console.log(markdown);
  console.log(`\nWrote ${reportPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
