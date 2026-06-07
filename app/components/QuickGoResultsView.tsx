'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  sortRankedRecommendations,
  type RankedRecommendation,
  type RecommendationSortMode,
} from '../../lib/domain';
import {
  buildFullAirportPlannerPath,
  buildQuickGoResultsPath,
  formatQuickGoOriginDisplayLabel,
  isQuickGoMode,
  quickGoClassificationForTrip,
  readQuickGoOriginFromSearchParams,
  resolveQuickGoBestWay,
  resolveQuickGoDriveTime,
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
  routeLoading?: boolean;
  routeRefreshing?: boolean;
  priorDriveMinutes?: number | null;
};

export default function QuickGoResultsView({
  tripData,
  recommendation,
  rankedOptions,
  searchParams,
  routeLoading = false,
  routeRefreshing = false,
  priorDriveMinutes = null,
}: QuickGoResultsViewProps) {
  const router = useRouter();
  const detectedAirportCode = searchParams.get('detectedAirportCode');
  const showAirportPrompt =
    Boolean(detectedAirportCode) && searchParams.get('quickGoConfirmed') !== '1';

  const destination = tripData.destinationName || tripData.destination;
  const classification = quickGoClassificationForTrip({
    destination,
    destinationKind: tripData.destinationKind,
    detectedAirportCode,
  });

  const resolvingCoordinates =
    routeLoading &&
    !(
      typeof tripData.originLat === 'number' &&
      typeof tripData.originLng === 'number' &&
      typeof tripData.destinationLat === 'number' &&
      typeof tripData.destinationLng === 'number'
    );
  const driveTime = resolveQuickGoDriveTime({
    traffic: recommendation.trafficEstimate ?? null,
    routeLoading,
    routeRefreshing,
    resolvingCoordinates,
    priorMinutes: priorDriveMinutes,
  });
  const driveMinutes = driveTime.minutes;
  const preference: RecommendationSortMode =
    searchParams.get('quickGoPreference') === 'cheapest'
      ? 'cheapest'
      : searchParams.get('quickGoPreference') === 'fastest'
        ? 'fastest'
        : 'easiest';
  const rankedForPreference = sortRankedRecommendations(rankedOptions, preference);

  const { bestWayLabel, backupWayLabel, bestOption, backupOption } = resolveQuickGoBestWay({
    tripData,
    rankedOptions: rankedForPreference,
    driveMinutes,
    classification,
  });

  const originDisplayLabel = formatQuickGoOriginDisplayLabel(searchParams);
  const quickGoPurpose = searchParams.get('quickGoPurpose') || 'general-destination';
  const showLeaveTime = searchParams.get('calculateLeaveTime') !== '0';
  const fullDetailsParams = new URLSearchParams(searchParams.toString());
  fullDetailsParams.set('type', 'general-trip');
  fullDetailsParams.delete('tripMode');
  fullDetailsParams.set('quickGoConfirmed', '1');
  const fullDetailsHref = `/results?${fullDetailsParams.toString()}`;

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
          classification={classification}
          bestWayLabel={bestWayLabel}
          backupWayLabel={backupWayLabel}
          bestOption={bestOption}
          backupOption={backupOption}
          driveMinutes={driveMinutes}
          leaveByTime={showLeaveTime ? recommendation.leaveByTime ?? null : null}
          preference={preference}
          quickGoPurpose={quickGoPurpose}
          weatherImpact={recommendation.weatherImpact}
          driveTimeTrustStatus={recommendation.trafficEstimate?.trustStatus}
          driveTimeSourceName={recommendation.trafficEstimate?.sourceName}
          driveTime={driveTime}
          driveTimeUnavailable={driveTime.unavailable}
          fullDetailsHref={fullDetailsHref}
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton href={fullDetailsHref} variant="secondary">
            Open full trip details
          </PrimaryButton>
          <PrimaryButton href="/trip" variant="ghost">
            New full trip
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
