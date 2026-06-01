'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteFavoriteTrip,
  favoriteTripToSearchParams,
  readFavoriteTrips,
  type SavedFavoriteTrip,
} from '../../lib/trip/favoriteTrips';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';

type SavedTripsPanelProps = {
  title?: string;
  description?: string;
  compact?: boolean;
  onReuse?: (favorite: SavedFavoriteTrip) => void;
  className?: string;
};

export default function SavedTripsPanel({
  title = 'Saved trips',
  description = 'Reuse a common route with one tap.',
  compact = false,
  onReuse,
  className = '',
}: SavedTripsPanelProps) {
  const router = useRouter();
  const [trips, setTrips] = useState<SavedFavoriteTrip[]>([]);
  const [ready, setReady] = useState(false);

  const refreshTrips = useCallback(() => {
    setTrips(readFavoriteTrips(window.localStorage));
    setReady(true);
  }, []);

  useEffect(() => {
    refreshTrips();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'podpaigo-favorite-trips') {
        refreshTrips();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshTrips]);

  const handleReuse = (favorite: SavedFavoriteTrip) => {
    if (onReuse) {
      onReuse(favorite);
      return;
    }

    const params = favoriteTripToSearchParams(favorite);
    router.push(buildResultsPathFromSearchParams(params));
  };

  const handleDelete = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    setTrips(deleteFavoriteTrip(id, window.localStorage));
  };

  if (!ready) {
    return null;
  }

  if (trips.length === 0) {
    return null;
  }

  return (
    <section
      className={
        'rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm shadow-sky-900/5 sm:p-5 ' +
        className
      }
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {!compact && description ? (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          ) : null}
        </div>
        <div className="text-xs font-medium text-slate-500">{trips.length} saved</div>
      </div>

      <ul className="mt-4 space-y-2">
        {trips.map((trip) => (
          <li key={trip.id}>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => handleReuse(trip)}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
              >
                <div className="truncate text-sm font-semibold text-slate-950">{trip.name}</div>
                {!compact && (
                  <div className="mt-1 truncate text-xs text-slate-500">{trip.origin}</div>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <span>{trip.intent.replace('-', ' ')}</span>
                  <span>·</span>
                  <span>{trip.transportAvailability}</span>
                  <span>·</span>
                  <span>{trip.preferredSort}</span>
                </div>
              </button>

              <button
                type="button"
                aria-label={`Delete ${trip.name}`}
                onClick={(event) => handleDelete(event, trip.id)}
                className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
