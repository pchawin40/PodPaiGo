'use client';

import { useEffect, useState } from 'react';
import { resolveGeolocationOrigin } from '../../lib/trip/quickGo';
import type { TripPlanningContext } from '../../lib/ai/tripPlanningConversation';
import { extractCityLabelFromAddress } from '../../lib/ai/tripPlanningConversation';

function canUseGeolocationNow(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

export function useTripPlanningLocation(): TripPlanningContext & {
  isLocating: boolean;
  refreshLocationLabel: () => Promise<void>;
} {
  const [geolocationAvailable, setGeolocationAvailable] = useState(false);
  const [geolocationDenied, setGeolocationDenied] = useState(false);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const refreshLocationLabel = async () => {
    if (!canUseGeolocationNow()) {
      setGeolocationAvailable(false);
      return;
    }

    setIsLocating(true);
    try {
      const selection = await resolveGeolocationOrigin();
      const label =
        selection.origin !== 'Current location'
          ? selection.origin
          : selection.originLabel;
      setCurrentLocationLabel(label || null);
      setGeolocationAvailable(true);
      setGeolocationDenied(false);
    } catch {
      setGeolocationDenied(true);
      setGeolocationAvailable(canUseGeolocationNow());
      setCurrentLocationLabel(null);
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (!canUseGeolocationNow()) {
      setGeolocationAvailable(false);
      return;
    }

    setGeolocationAvailable(true);

    const permissions = navigator.permissions;
    if (!permissions?.query) return;

    let cancelled = false;

    permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'denied') {
          setGeolocationDenied(true);
          return;
        }

        void refreshLocationLabel();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    geolocationAvailable,
    geolocationDenied,
    currentLocationLabel: currentLocationLabel
      ? extractCityLabelFromAddress(currentLocationLabel)
      : null,
    isLocating,
    refreshLocationLabel,
  };
}
