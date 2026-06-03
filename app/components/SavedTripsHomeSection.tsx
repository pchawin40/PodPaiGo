'use client';

import Link from 'next/link';
import SavedTripsPanel from './SavedTripsPanel';

export default function SavedTripsHomeSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <SavedTripsPanel
        compact
        title="Your saved trips"
        description="Jump back into a familiar airport routine."
      />

      <div className="mt-4 text-center">
        <Link
          href="/trip"
          className="text-sm font-medium text-primary hover:underline"
        >
          Plan or manage trips
        </Link>
      </div>
    </section>
  );
}
