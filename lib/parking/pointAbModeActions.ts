export type DestinationModeAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

export function buildPointAbModeActions(input: {
  mode: 'parking' | 'rideshare' | 'transit' | 'park-ride';
  routeToParkingUrl?: string | null;
  parkingToDestinationUrl?: string | null;
  rideshareUrl?: string | null;
  transitRouteUrl?: string | null;
  transitScheduleUrl?: string | null;
  parkRideRulesUrl?: string | null;
  parkRideDirectionsUrl?: string | null;
  parkRideTransitUrl?: string | null;
  parkRideTransitPlannerUrl?: string | null;
  parkRideViable?: boolean;
  onDetails: () => void;
}): DestinationModeAction[] {
  switch (input.mode) {
    case 'parking':
      return [
        input.routeToParkingUrl
          ? { label: 'Route to parking', href: input.routeToParkingUrl }
          : { label: 'Route to parking', disabled: true },
        input.parkingToDestinationUrl
          ? { label: 'Parking to destination', href: input.parkingToDestinationUrl }
          : { label: 'Parking to destination', disabled: true },
        { label: 'Details', onClick: input.onDetails },
      ];
    case 'rideshare':
      return [
        input.rideshareUrl
          ? { label: 'View ride estimates', href: input.rideshareUrl }
          : { label: 'View ride estimates', onClick: input.onDetails },
        input.routeToParkingUrl
          ? { label: 'Route', href: input.routeToParkingUrl }
          : { label: 'Route', onClick: input.onDetails },
        { label: 'Details', onClick: input.onDetails },
      ];
    case 'transit':
      return [
        input.transitRouteUrl
          ? { label: 'Open transit route', href: input.transitRouteUrl }
          : { label: 'Open transit route', onClick: input.onDetails },
        input.transitScheduleUrl
          ? { label: 'Compare schedule', href: input.transitScheduleUrl }
          : { label: 'Compare schedule', onClick: input.onDetails },
        { label: 'Details', onClick: input.onDetails },
      ];
    case 'park-ride':
      if (input.parkRideViable) {
        return [
          input.parkRideDirectionsUrl
            ? { label: 'Route to lot', href: input.parkRideDirectionsUrl }
            : { label: 'Route to lot', disabled: true },
          input.parkRideTransitUrl
            ? { label: 'Transit to destination', href: input.parkRideTransitUrl }
            : { label: 'Transit to destination', disabled: true },
          { label: 'Details', onClick: input.onDetails },
        ];
      }

      return [
        input.parkRideRulesUrl
          ? { label: 'Check lot rules', href: input.parkRideRulesUrl }
          : { label: 'Check lot rules', onClick: input.onDetails },
        { label: 'Why unavailable', onClick: input.onDetails },
        input.parkRideTransitPlannerUrl
          ? { label: 'Open transit planner', href: input.parkRideTransitPlannerUrl }
          : input.parkRideTransitUrl
            ? { label: 'Open transit planner', href: input.parkRideTransitUrl }
            : { label: 'Open transit planner', onClick: input.onDetails },
      ];
  }
}
