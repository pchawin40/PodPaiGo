'use client';

import { useState } from 'react';
import {
  upsertFavoriteTrip,
  type FavoriteTripInput,
} from '../../lib/trip/favoriteTrips';
import { trackEvent } from '../../lib/analytics/trackEvent';

type SaveFavoriteTripButtonProps = {
  trip: FavoriteTripInput;
  className?: string;
  label?: string;
  savedLabel?: string;
};

export default function SaveFavoriteTripButton({
  trip,
  className = '',
  label = 'Save trip',
  savedLabel = 'Saved',
}: SaveFavoriteTripButtonProps) {
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleSave = () => {
    trackEvent('save_trip_clicked', {
      eventProperties: {
        airportCode: trip.airportCode || undefined,
        intent: trip.intent,
        hasUser: false,
      },
    });

    const saved = upsertFavoriteTrip(trip, window.localStorage);
    if (!saved) {
      setStatus('error');
      return;
    }

    trackEvent('save_trip_completed', {
      eventProperties: {
        airportCode: trip.airportCode || undefined,
        intent: trip.intent,
        hasUser: false,
      },
    });

    setStatus('saved');
    window.setTimeout(() => setStatus('idle'), 2200);
  };

  const text =
    status === 'saved' ? savedLabel : status === 'error' ? 'Could not save' : label;

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={!trip.origin.trim()}
      className={
        'inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ' +
        className
      }
    >
      {text}
    </button>
  );
}
