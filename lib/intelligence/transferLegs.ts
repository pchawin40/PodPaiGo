import {
    ParkingOption,
    Recommendation,
    RideshareOption,
    TransitOption,
    TransferLeg,
    TripData,
} from '../types';
import {
    isParkingRouteUnavailable,
    parkingRouteUnavailableReason,
} from '../parking/routeStatus';

export function buildParkingTransferLegs(
    option: ParkingOption,
    trip: TripData
): TransferLeg[] {
    if (isParkingRouteUnavailable(option)) {
        return [
            {
                type: 'drive',
                from: trip.origin,
                to: option.name,
                durationMinutes: undefined,
                confidence: 'unavailable',
                note: parkingRouteUnavailableReason(option),
            },
        ];
    }

    const legs: TransferLeg[] = [
        {
            type: 'drive',
            from: trip.origin,
            to: option.name,
            durationMinutes: option.distance,
            confidence: option.routeTrustStatus ?? option.trustStatus,
            note:
                option.routeTrustStatus === 'live'
                    ? 'Live route duration when available.'
                    : 'Estimated drive time.',
        },
    ];

    const transferMinutes =
        option.transferToTerminalMinutes ??
        option.shuttleMinutes ??
        option.walkingMinutes ??
        option.checkpointWalkMinutes;

    if (option.transferType === 'shuttle') {
        legs.push({
            type: 'shuttle',
            from: option.name,
            to: 'SEA terminal',
            durationMinutes: transferMinutes,
            confidence: 'estimated',
            note: option.shuttleWaitMinutes
                ? `Includes estimated shuttle timing. Typical wait: ~${option.shuttleWaitMinutes} min.`
                : 'Shuttle timing depends on wait time and provider reliability.',
        });
    } else {
        legs.push({
            type: 'walk',
            from: option.name,
            to: 'SEA terminal',
            durationMinutes: transferMinutes,
            confidence: 'estimated',
            note:
                option.transferType === 'airport-garage'
                    ? 'Airport garage terminal connection.'
                    : 'Terminal walk estimate.',
        });
    }

    if (option.recommendedCheckpoint) {
        legs.push({
            type: 'terminal',
            from: 'SEA terminal',
            to: option.recommendedCheckpoint.name,
            durationMinutes: option.recommendedCheckpoint.minutes,
            confidence: 'estimated',
            note: option.recommendedCheckpoint.reason,
        });
    }

    return legs;
}

export function buildRideshareTransferLegs(
    option: RideshareOption,
    trip: TripData
): TransferLeg[] {
    return [
        {
            type: 'rideshare',
            from: trip.origin,
            to: 'SEA dropoff area',
            durationMinutes: option.duration,
            confidence: option.routeTrustStatus ?? option.trustStatus,
            note:
                option.routeTrustStatus === 'live'
                    ? 'Live route duration when available.'
                    : 'Estimated rideshare route duration.',
        },
        {
            type: 'terminal',
            from: 'SEA dropoff area',
            to: 'Check-in / TSA',
            durationMinutes: 4,
            confidence: 'estimated',
            note: 'Short terminal transfer estimate.',
        },
    ];
}

export function buildTransitTransferLegs(
    option: TransitOption,
    trip: TripData
): TransferLeg[] {
    return [
        {
            type: 'transit',
            from: trip.origin,
            to: 'SeaTac/Airport Station',
            durationMinutes: option.duration,
            confidence: option.routeTrustStatus ?? option.trustStatus,
            note:
                option.routeTrustStatus === 'live'
                    ? 'Transit directions from route provider when available.'
                    : 'Estimated transit route duration.',
        },
        {
            type: 'walk',
            from: 'SeaTac/Airport Station',
            to: 'SEA terminal',
            durationMinutes: 8,
            confidence: 'estimated',
            note: 'Walk from airport station to terminal.',
        },
    ];
}

export function addTransferLegsToRecommendation(
    recommendation: Recommendation,
    trip: TripData
): Recommendation {
    return {
        ...recommendation,
        parking: recommendation.parking.map((option) => ({
            ...option,
            transferLegs: buildParkingTransferLegs(option, trip),
        })),
        rideshare: recommendation.rideshare.map((option) => ({
            ...option,
            transferLegs: buildRideshareTransferLegs(option, trip),
        })),
        transit: recommendation.transit.map((option) => ({
            ...option,
            transferLegs: buildTransitTransferLegs(option, trip),
        })),
    };
}
