'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  sortRankedRecommendations,
  type RankedRecommendation,
  type RecommendationSortMode,
} from '../../lib/domain';
import {
  buildFullAirportPlannerPath,
  buildQuickGoResultsPath,
  deriveQuickGoDisplayRouteState,
  formatQuickGoOriginDisplayLabel,
  hasReliableQuickGoRoute,
  isQuickGoMode,
  isQuickGoRouteLoading,
  logQuickGoClientRoute,
  logQuickGoDisplayStateDecision,
  quickGoClassificationForTrip,
  readQuickGoOriginFromSearchParams,
  resolveQuickGoBestWay,
  resolveQuickGoDriveTime,
  type QuickGoRouteHydrationState,
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
  clientRouteRefreshPending?: boolean;
  routeHydrationState?: QuickGoRouteHydrationState;
};

export default function QuickGoResultsView({
  tripData,
  recommendation,
  rankedOptions,
  searchParams,
  routeLoading = false,
  routeRefreshing = false,
  priorDriveMinutes = null,
  clientRouteRefreshPending = false,
  routeHydrationState = 'not_started',
}: QuickGoResultsViewProps) {
  const router = useRouter();
  const isQuickGo = isQuickGoMode(searchParams);
  const detectedAirportCode = searchParams.get('detectedAirportCode');
  const showAirportPrompt =
    Boolean(detectedAirportCode) && searchParams.get('quickGoConfirmed') !== '1';

  const destination = tripData.destinationName || tripData.destination;
  const classification = quickGoClassificationForTrip({
    destination,
    destinationKind: tripData.destinationKind,
    detectedAirportCode,
  });

  const trafficRouteStatus = recommendation.trafficEstimate?.routeStatus;
  const hasReliableRoute = hasReliableQuickGoRoute(recommendation.trafficEstimate);
  const hasPriorRoute =
    typeof priorDriveMinutes === 'number' && Number.isFinite(priorDriveMinutes);
  const displayDecision = deriveQuickGoDisplayRouteState({
    isQuickGo,
    tripData,
    trafficEstimate: recommendation.trafficEstimate ?? null,
    routeHydrationState,
    routeLoading,
    routeRefreshing,
    clientRouteRefreshPending,
    hasPriorRoute,
    hasReliableRoute,
  });
  const unavailableInvariantOk =
    displayDecision.displayRouteState !== 'unavailable' ||
    routeHydrationState === 'final_unavailable' ||
    !displayDecision.routable;
  const displayRouteState =
    displayDecision.displayRouteState === 'unavailable' && !unavailableInvariantOk
      ? 'calculating'
      : displayDecision.displayRouteState;
  const effectiveRouteRefreshing = displayRouteState === 'refreshing';
  const effectiveRouteLoading =
    displayRouteState === 'calculating' || displayRouteState === 'refreshing';
  const hasResolvedCoordinates =
    typeof tripData.originLat === 'number' &&
    typeof tripData.originLng === 'number' &&
    typeof tripData.destinationLat === 'number' &&
    typeof tripData.destinationLng === 'number';
  const resolvingCoordinates =
    effectiveRouteLoading &&
    !hasResolvedCoordinates &&
    !(trafficRouteStatus && isQuickGoRouteLoading(trafficRouteStatus));
  const driveTime = resolveQuickGoDriveTime({
    traffic: recommendation.trafficEstimate ?? null,
    routeLoading: effectiveRouteLoading && !effectiveRouteRefreshing,
    routeRefreshing: effectiveRouteRefreshing,
    resolvingCoordinates,
    priorMinutes: priorDriveMinutes,
    clientRouteRefreshPending:
      clientRouteRefreshPending ||
      displayDecision.shouldForceInitialPending ||
      routeHydrationState === 'resolving',
    routeHydrationState,
  });
  const driveMinutes = driveTime.minutes;
  const resultId =
    searchParams.get('tripId') ||
    `${tripData.origin || 'unknown-origin'}->${destination || 'unknown-destination'}`;

  useEffect(() => {
    logQuickGoDisplayStateDecision({
      resultId,
      isQuickGo,
      routeHydrationState,
      routeLoading: effectiveRouteLoading,
      hasReliableRoute,
      serverRouteUnavailable: displayDecision.serverRouteUnavailable,
      shouldForceInitialPending: displayDecision.shouldForceInitialPending,
      displayRouteState,
      reason: unavailableInvariantOk ? displayDecision.reason : 'invariant_guard_forced_calculating',
    });

    if (displayRouteState === 'unavailable') {
      logQuickGoDisplayStateDecision({
        resultId,
        isQuickGo,
        routeHydrationState,
        routeLoading: effectiveRouteLoading,
        hasReliableRoute,
        serverRouteUnavailable: displayDecision.serverRouteUnavailable,
        shouldForceInitialPending: displayDecision.shouldForceInitialPending,
        displayRouteState,
        reason: displayDecision.reason,
        invariantOk: unavailableInvariantOk,
      });
    }

    if (!unavailableInvariantOk) {
      logQuickGoDisplayStateDecision({
        resultId,
        isQuickGo,
        routeHydrationState,
        routeLoading: effectiveRouteLoading,
        hasReliableRoute,
        serverRouteUnavailable: displayDecision.serverRouteUnavailable,
        shouldForceInitialPending: displayDecision.shouldForceInitialPending,
        displayRouteState: 'calculating',
        reason: 'unavailable_invariant_violation_suppressed',
      });
    }

    logQuickGoClientRoute('render', {
      routeLoading: effectiveRouteLoading,
      routeRefreshing: effectiveRouteRefreshing,
      clientRouteRefreshPending,
      routeHydrationState,
      displayRouteState,
      loading: driveTime.loading,
      unavailable: driveTime.unavailable,
      routeStatus: driveTime.routeStatus,
      minutes: driveTime.minutes,
    });
  }, [
    resultId,
    isQuickGo,
    routeHydrationState,
    effectiveRouteLoading,
    effectiveRouteRefreshing,
    clientRouteRefreshPending,
    hasReliableRoute,
    displayDecision.serverRouteUnavailable,
    displayDecision.shouldForceInitialPending,
    displayDecision.reason,
    displayRouteState,
    unavailableInvariantOk,
    driveTime.loading,
    driveTime.unavailable,
    driveTime.routeStatus,
    driveTime.minutes,
  ]);
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

  if (!isQuickGo) {
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
