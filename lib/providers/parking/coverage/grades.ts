import type { AirportCoverageReport } from './types';

export function gradeAirportCoverage(report: Pick<
  AirportCoverageReport,
  'providerCount' | 'parkingOptionCount' | 'livePriceCount' | 'mergedOptionCount'
>): AirportCoverageReport['coverageGrade'] {
  const { providerCount, parkingOptionCount, livePriceCount, mergedOptionCount } = report;

  let score = 0;

  if (mergedOptionCount >= 15) score += 30;
  else if (mergedOptionCount >= 8) score += 22;
  else if (mergedOptionCount >= 4) score += 14;
  else if (mergedOptionCount >= 1) score += 6;

  if (livePriceCount >= 5) score += 30;
  else if (livePriceCount >= 2) score += 22;
  else if (livePriceCount >= 1) score += 12;

  if (providerCount >= 4) score += 25;
  else if (providerCount >= 3) score += 18;
  else if (providerCount >= 2) score += 10;
  else if (providerCount >= 1) score += 4;

  if (parkingOptionCount >= 20) score += 15;
  else if (parkingOptionCount >= 10) score += 10;
  else if (parkingOptionCount >= 5) score += 6;

  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

export function coverageGradeLabel(grade: AirportCoverageReport['coverageGrade']): string {
  switch (grade) {
    case 'A':
      return 'Strong multi-provider coverage with live prices';
    case 'B':
      return 'Good coverage; some live pricing';
    case 'C':
      return 'Moderate coverage; limited live prices';
    case 'D':
      return 'Weak coverage; mostly estimated or link-only';
    case 'F':
      return 'Insufficient real parking data';
  }
}
