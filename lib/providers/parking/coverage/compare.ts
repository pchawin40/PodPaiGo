import type { AirportCoverageDashboard, AirportCoverageReport } from './types';

export type AirportCoverageComparisonRow = {
  airportCode: string;
  gradeBefore: AirportCoverageReport['coverageGrade'];
  gradeAfter: AirportCoverageReport['coverageGrade'];
  mergedBefore: number;
  mergedAfter: number;
  mergedDelta: number;
  liveBefore: number;
  liveAfter: number;
  liveDelta: number;
  providerCountBefore: number;
  providerCountAfter: number;
  improved: boolean;
};

export type CoverageImprovementReport = {
  baselineGeneratedAt: string;
  afterGeneratedAt: string;
  airports: AirportCoverageComparisonRow[];
  belowGradeBBefore: string[];
  belowGradeBAfter: string[];
  newlyAboveGradeB: string[];
  stillBelowGradeB: string[];
  summary: string;
};

function gradeRank(grade: AirportCoverageReport['coverageGrade']): number {
  return { A: 5, B: 4, C: 3, D: 2, F: 1 }[grade];
}

function isBelowGradeB(grade: AirportCoverageReport['coverageGrade']): boolean {
  return gradeRank(grade) < gradeRank('B');
}

export function compareCoverageDashboards(
  before: AirportCoverageDashboard,
  after: AirportCoverageDashboard,
): CoverageImprovementReport {
  const beforeByCode = new Map(before.airports.map((a) => [a.airportCode, a]));
  const afterByCode = new Map(after.airports.map((a) => [a.airportCode, a]));

  const airportCodes = [...new Set([
    ...before.airports.map((a) => a.airportCode),
    ...after.airports.map((a) => a.airportCode),
  ])];

  const airports: AirportCoverageComparisonRow[] = airportCodes.map((airportCode) => {
    const b = beforeByCode.get(airportCode);
    const a = afterByCode.get(airportCode);

    const mergedBefore = b?.mergedOptionCount ?? 0;
    const mergedAfter = a?.mergedOptionCount ?? 0;
    const liveBefore = b?.livePriceCount ?? 0;
    const liveAfter = a?.livePriceCount ?? 0;

    return {
      airportCode,
      gradeBefore: b?.coverageGrade ?? 'F',
      gradeAfter: a?.coverageGrade ?? 'F',
      mergedBefore,
      mergedAfter,
      mergedDelta: mergedAfter - mergedBefore,
      liveBefore,
      liveAfter,
      liveDelta: liveAfter - liveBefore,
      providerCountBefore: b?.providerCount ?? 0,
      providerCountAfter: a?.providerCount ?? 0,
      improved:
        gradeRank(a?.coverageGrade ?? 'F') > gradeRank(b?.coverageGrade ?? 'F') ||
        mergedAfter > mergedBefore ||
        liveAfter > liveBefore,
    };
  });

  const belowGradeBBefore = airports
    .filter((row) => isBelowGradeB(row.gradeBefore))
    .map((row) => row.airportCode);

  const belowGradeBAfter = airports
    .filter((row) => isBelowGradeB(row.gradeAfter))
    .map((row) => row.airportCode);

  const newlyAboveGradeB = belowGradeBBefore.filter(
    (code) => !belowGradeBAfter.includes(code),
  );

  const stillBelowGradeB = belowGradeBBefore.filter((code) =>
    belowGradeBAfter.includes(code),
  );

  const improvedCount = airports.filter((row) => row.improved).length;

  return {
    baselineGeneratedAt: before.generatedAt,
    afterGeneratedAt: after.generatedAt,
    airports,
    belowGradeBBefore,
    belowGradeBAfter,
    newlyAboveGradeB,
    stillBelowGradeB,
    summary: `${improvedCount}/${airports.length} airports improved; ${newlyAboveGradeB.length} moved to grade B or above; ${stillBelowGradeB.length} still below B.`,
  };
}

export function formatCoverageImprovementMarkdown(report: CoverageImprovementReport): string {
  const lines = [
    '# Coverage Improvement Report',
    '',
    `Baseline: ${report.baselineGeneratedAt}`,
    `After: ${report.afterGeneratedAt}`,
    '',
    report.summary,
    '',
    '## Before vs After',
    '',
    '| Airport | Grade | Merged | Live | Providers |',
    '|---------|-------|--------|------|-----------|',
  ];

  for (const row of report.airports) {
    lines.push(
      `| ${row.airportCode} | ${row.gradeBefore}→${row.gradeAfter} | ${row.mergedBefore}→${row.mergedAfter} (${row.mergedDelta >= 0 ? '+' : ''}${row.mergedDelta}) | ${row.liveBefore}→${row.liveAfter} (${row.liveDelta >= 0 ? '+' : ''}${row.liveDelta}) | ${row.providerCountBefore}→${row.providerCountAfter} |`,
    );
  }

  lines.push('');
  lines.push(`**Still below grade B:** ${report.stillBelowGradeB.join(', ') || 'none'}`);
  lines.push(`**Newly B or above:** ${report.newlyAboveGradeB.join(', ') || 'none'}`);
  lines.push('');

  return lines.join('\n');
}
