import type { EventParkingSignal } from '../types';

export const STATIC_EVENT_VENUE_WARNING_COPY =
  'This looks like an event venue. Street and meter parking may be restricted, full, time-limited, or tow-enforced during games and events. Confirm posted signs before relying on street parking.';

export function buildStaticEventVenueSignal(): EventParkingSignal {
  return {
    source: 'static-venue',
    status: 'venue-caution',
    confidence: 'low',
    warningCopy: STATIC_EVENT_VENUE_WARNING_COPY,
  };
}
