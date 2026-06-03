'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RankedRecommendation } from '../../lib/domain';
import {
  buildFullAirportPlannerPath,
  buildQuickGoResultsPath,
  formatQuickGoOriginDisplayLabel,
  isQuickGoMode,
  readQuickGoOriginFromSearchParams,
} from '../../lib/trip/quickGo';
import type { Recommendation, TripData } from '../../lib/types';
import QuickGoResultsCard from './QuickGoResultsCard';
import PrimaryButton from './ui/PrimaryButton';
import TravelCard from './ui/TravelCard';

type QuickGoResultsViewProps = {
  tripData: TripData;
  recommendation: Recommendation;
  rankedOptions: RankedRecommendation[];
  searchParams: URLSearchParams;
};

export default function QuickGoResultsView({
  tripData,
  recommendation,
  rankedOptions,
  searchParams,
}: QuickGoResultsViewProps) {
  const router = useRouter();
  const detectedAirportCode = searchParams.get('detectedAirportCode');
  const showAirportPrompt =
    Boolean(detectedAirportCode) && searchParams.get('quickGoConfirmed') !== '1';

  const bestOption = rankedOptions[0] ?? null;
  const backupOption = rankedOptions[1] ?? null;
  const driveMinutes =
    recommendation.trafficEstimate?.duration ??
    bestOption?.duration ??
    null;

  const originDisplayLabel = formatQuickGoOriginDisplayLabel(searchParams);

  const handleContinueQuickGo = () => {
    const origin = readQuickGoOriginFromSearchParams(searchParams);
    if (!origin) return;

    router.push(
      buildQuickGoResultsPath({
        destinationText: tripData.destinationName || tripData.destination,
        origin,
        continueAsQuickGo: true,
      }),
    );
  };

  const handleUseFullPlanner = () => {
    if (!detectedAirportCode) return;

    router.push(
      buildFullAirportPlannerPath({
        origin: tripData.origin,
        airportCode: detectedAirportCode,
      }),
    );
  };

  if (!isQuickGoMode(searchParams)) {
    return null;
  }

  return (
    <div className="travel-page-bg flex flex-1 flex-col font-sans">
      <main className="mx-auto w-full max-w-4xl flex-1 px-3 pb-24 pt-6 sm:px-4 sm:pt-8">
        {showAirportPrompt ? (
          <TravelCard className="mb-5 border-warning/25 bg-warning/10">
            <p className="text-sm font-medium text-foreground">
              This looks like an airport trip. Want to use the full airport planner?
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <PrimaryButton type="button" onClick={handleUseFullPlanner}>
                Use full airport planner
              </PrimaryButton>
              <PrimaryButton type="button" variant="secondary" onClick={handleContinueQuickGo}>
                Continue Quick Go
              </PrimaryButton>
            </div>
          </TravelCard>
        ) : null}

        <QuickGoResultsCard
          tripData={tripData}
          originDisplayLabel={originDisplayLabel}
          bestOption={bestOption}
          backupOption={backupOption}
          driveMinutes={driveMinutes}
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton href="/trip" variant="secondary">
            Open full trip planner
          </PrimaryButton>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Back home
          </Link>
        </div>
      </main>
    </div>
  );
}
