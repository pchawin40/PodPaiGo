'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from '../../lib/analytics/trackEvent';

export default function HomeAnalytics() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackEvent('home_viewed');
  }, []);

  return null;
}
