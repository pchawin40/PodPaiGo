'use client';

import { Suspense } from 'react';
import SiteHeader from '../components/SiteHeader';
import ResultsContent from './ResultsContent';

export default function ResultsPage() {
  return (
    <>
      <SiteHeader ctaHref="/trip" ctaLabel="New trip" />

      <Suspense
        fallback={
          <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
            <div className="text-xl">Loading...</div>
          </div>
        }
      >
        <ResultsContent />
      </Suspense>
    </>
  );
}