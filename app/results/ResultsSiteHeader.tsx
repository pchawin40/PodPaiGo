'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteHeader from '../components/SiteHeader';
import { shouldShowResultsNewTripCta } from './resultsNewTripCta';

type ResultsSiteHeaderProps = {
  storedSearchParams?: string | null;
};

export default function ResultsSiteHeader({ storedSearchParams }: ResultsSiteHeaderProps) {
  if (typeof storedSearchParams === 'string') {
    return (
      <SiteHeader
        ctaHref="/trip"
        ctaLabel="New trip"
        showCta={shouldShowResultsNewTripCta(storedSearchParams)}
      />
    );
  }

  if (storedSearchParams === null) {
    return <SiteHeader ctaHref="/trip" ctaLabel="New trip" showCta={false} />;
  }

  return (
    <Suspense fallback={<SiteHeader ctaHref="/trip" ctaLabel="New trip" showCta={false} />}>
      <RouteResultsSiteHeader />
    </Suspense>
  );
}

function RouteResultsSiteHeader() {
  const routeSearchParams = useSearchParams();
  const showCta = shouldShowResultsNewTripCta(routeSearchParams);

  return <SiteHeader ctaHref="/trip" ctaLabel="New trip" showCta={showCta} />;
}
