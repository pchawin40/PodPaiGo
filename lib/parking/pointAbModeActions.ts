export type DestinationModeAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
};

function detailsAction(
  onDetails: () => void,
  detailsSectionId?: string,
  detailsExpanded?: boolean,
): DestinationModeAction {
  return {
    label: 'Details',
    onClick: onDetails,
    ariaControls: detailsSectionId,
    ariaExpanded: detailsExpanded ?? false,
  };
}

function unavailableDetailsAction(
  onDetails: () => void,
  detailsSectionId?: string,
  detailsExpanded?: boolean,
): DestinationModeAction {
  return {
    label: 'Why unavailable',
    onClick: onDetails,
    ariaControls: detailsSectionId,
    ariaExpanded: detailsExpanded ?? false,
  };
}

export function buildPointAbModeActions(input: {
  mode: 'destination-customer' | 'parking' | 'street-meter' | 'rideshare' | 'transit' | 'park-ride';
  routeToParkingUrl?: string | null;
  parkingToDestinationUrl?: string | null;
  streetMeterDirectionsUrl?: string | null;
  rideshareUrl?: string | null;
  transitRouteUrl?: string | null;
  transitScheduleUrl?: string | null;
  parkRideRulesUrl?: string | null;
  parkRideDirectionsUrl?: string | null;
  parkRideTransitUrl?: string | null;
  parkRideTransitPlannerUrl?: string | null;
  parkRideViable?: boolean;
  onDetails: () => void;
  detailsSectionId?: string;
  detailsExpanded?: boolean;
}): DestinationModeAction[] {
  switch (input.mode) {
    case 'destination-customer':
      return [
        input.routeToParkingUrl
          ? { label: 'Open directions', href: input.routeToParkingUrl }
          : { label: 'Open directions', disabled: true },
        detailsAction(input.onDetails, input.detailsSectionId, input.detailsExpanded),
      ];
    case 'street-meter':
      return [
        input.streetMeterDirectionsUrl
          ? { label: 'Open directions', href: input.streetMeterDirectionsUrl }
          : { label: 'Open directions', disabled: true },
        detailsAction(input.onDetails, input.detailsSectionId, input.detailsExpanded),
      ];
    case 'parking':
      return [
        input.routeToParkingUrl
          ? { label: 'Route to parking', href: input.routeToParkingUrl }
          : { label: 'Route to parking', disabled: true },
        input.parkingToDestinationUrl
          ? { label: 'Parking to destination', href: input.parkingToDestinationUrl }
          : { label: 'Parking to destination', disabled: true },
        detailsAction(input.onDetails, input.detailsSectionId, input.detailsExpanded),
      ];
    case 'rideshare':
      return [
        input.rideshareUrl
          ? { label: 'View ride estimates', href: input.rideshareUrl }
          : { label: 'View ride estimates', onClick: input.onDetails },
        input.routeToParkingUrl
          ? { label: 'Route', href: input.routeToParkingUrl }
          : { label: 'Route', onClick: input.onDetails },
        detailsAction(input.onDetails, input.detailsSectionId, input.detailsExpanded),
      ];
    case 'transit':
      return [
        input.transitRouteUrl
          ? { label: 'Open transit route', href: input.transitRouteUrl }
          : { label: 'Open transit route', onClick: input.onDetails },
        input.transitScheduleUrl
          ? { label: 'Compare schedule', href: input.transitScheduleUrl }
          : { label: 'Compare schedule', onClick: input.onDetails },
        detailsAction(input.onDetails, input.detailsSectionId, input.detailsExpanded),
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
          input.parkRideRulesUrl
            ? { label: 'Rules', href: input.parkRideRulesUrl }
            : detailsAction(input.onDetails, input.detailsSectionId, input.detailsExpanded),
        ];
      }

      return [
        input.parkRideRulesUrl
          ? { label: 'Check lot rules', href: input.parkRideRulesUrl }
          : { label: 'Check lot rules', onClick: input.onDetails },
        unavailableDetailsAction(
          input.onDetails,
          input.detailsSectionId,
          input.detailsExpanded,
        ),
        input.parkRideTransitPlannerUrl
          ? { label: 'Open transit planner', href: input.parkRideTransitPlannerUrl }
          : input.parkRideTransitUrl
            ? { label: 'Open transit planner', href: input.parkRideTransitUrl }
            : { label: 'Open transit planner', onClick: input.onDetails },
      ];
  }
}
