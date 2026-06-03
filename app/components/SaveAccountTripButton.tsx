'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { TripData } from '../../lib/types';
import { getSaveTripUiState } from '../../lib/auth/saveTripUi';
import { insertSavedTrip } from '../../lib/auth/savedTrips';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from './AuthProvider';
import { trackEvent } from '../../lib/analytics/trackEvent';

type SaveAccountTripButtonProps = {
  tripData: TripData;
  intent?: string | null;
  className?: string;
};

export default function SaveAccountTripButton({
  tripData,
  intent = null,
  className = '',
}: SaveAccountTripButtonProps) {
  const { user, configured } = useAuth();
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const uiState = useMemo(() => getSaveTripUiState(Boolean(user)), [user]);

  const redirectPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  if (!configured) {
    return null;
  }

  if (uiState.action === 'sign-in') {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
        className={
          'inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-950 hover:bg-sky-100 ' +
          className
        }
      >
        {uiState.label}
      </Link>
    );
  }

  const handleSave = async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    trackEvent('save_trip_clicked', {
      eventProperties: {
        airportCode: tripData.airportCode || undefined,
        tripType: tripData.type,
        hasUser: true,
      },
    });

    setErrorMessage(null);
    const { error } = await insertSavedTrip(client, tripData, user.id, { intent });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    trackEvent('save_trip_completed', {
      eventProperties: {
        airportCode: tripData.airportCode || undefined,
        tripType: tripData.type,
        hasUser: true,
      },
    });

    setStatus('saved');
    window.setTimeout(() => setStatus('idle'), 2200);
  };

  const label =
    status === 'saved' ? 'Saved to account' : status === 'error' ? 'Could not save' : uiState.label;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          void handleSave();
        }}
        disabled={!tripData.origin.trim() || status === 'saved'}
        className={
          'inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ' +
          className
        }
      >
        {label}
      </button>
      {errorMessage ? <span className="text-xs text-red-700">{errorMessage}</span> : null}
    </div>
  );
}
