import type { SeaCuratedHubDefinition } from './types';

export type { SeaCuratedHubDefinition };

export const NORTHGATE_HUB: SeaCuratedHubDefinition = {
  id: 'sea-northgate-park-link',
  displayName: 'Northgate Park + Link',
  hubPlaceName: 'Northgate Transit Center, Seattle, WA',
  lat: 47.7025,
  lng: -122.3274,
  strategyType: 'park_and_ride_transit',
  parking: {
    min: 0,
    max: 9,
    unit: 'trip_total',
    overnightRules:
      'Sound Transit park-and-ride overnight rules vary by lot. Verify time limits before leaving your car.',
    sourceNotes: 'Sound Transit P&R guidance; curated estimate 2026-05-30',
  },
  transit: {
    min: 3,
    max: 3,
    mode: 'link',
    sourceNotes: 'ORCA adult Link fare one-way; pass holders may pay $0',
  },
  timing: {
    linkRideMinutes: 45,
    walkToPlatformMinutes: 5,
    driveTimeFactorMinutes: 30,
  },
  confidence: 'medium',
  explanation: 'Best for cheapest trip, but check overnight parking rules.',
  bestFor: ['Budget travelers', 'Cheapest trip'],
  enabled: true,
};

export const SEA_CURATED_HUBS: SeaCuratedHubDefinition[] = [NORTHGATE_HUB];
