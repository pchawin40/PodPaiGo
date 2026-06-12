'use client';

import { Suspense } from 'react';
import ResultsContent from './ResultsContent';
import ResultsSiteHeader from './ResultsSiteHeader';

export default function ResultsPage() {
  return (
    <>
      <ResultsSiteHeader />

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
