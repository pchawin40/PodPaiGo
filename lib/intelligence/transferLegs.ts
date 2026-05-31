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
import { getAirportById } from '../airports/catalog';

function resolveDestinationTerminalLabel(trip: TripData): string {
    const code = trip.airportCode?.toUpperCase();
    if (code) {
        const airport = getAirportById(code);
        if (airport) {
            return `${airport.id} terminal`;
        }
        return `${code} terminal`;
    }

    return 'destination terminal';
}

function resolveTransitStationLabel(trip: TripData): string {
    const code = trip.airportCode?.toUpperCase();
    if (code) {
        const airport = getAirportById(code);
        if (airport) {
            return `${airport.destinationName} Station`;
        }
        return `${code} Airport Station`;
    }

    return 'Airport Station';
}

function resolveDropoffAreaLabel(trip: TripData): string {
    const code = trip.airportCode?.toUpperCase();
    if (code) {
        return `${code} dropoff area`;
    }

    return 'dropoff area';
}

export function buildParkingTransferLegs(
    option: ParkingOption,
    trip: TripData
): TransferLeg[] {
    const terminalLabel = resolveDestinationTerminalLabel(trip);

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

    if (option.transferType === 'transit') {
        legs.push({
            type: 'transit',
            from: option.name,
            to: terminalLabel,
            durationMinutes: transferMinutes,
            confidence: 'estimated',
            note: 'Park-and-ride transit timing is estimated.',
        });
    } else if (option.transferType === 'shuttle') {
        legs.push({
            type: 'shuttle',
            from: option.name,
            to: terminalLabel,
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
            to: terminalLabel,
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
            from: terminalLabel,
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
    const dropoffLabel = resolveDropoffAreaLabel(trip);

    return [
        {
            type: 'rideshare',
            from: trip.origin,
            to: dropoffLabel,
            durationMinutes: option.duration,
            confidence: option.routeTrustStatus ?? option.trustStatus,
            note:
                option.routeTrustStatus === 'live'
                    ? 'Traffic-aware route duration; fare is estimated separately.'
                    : 'Estimated rideshare route duration.',
        },
        {
            type: 'terminal',
            from: dropoffLabel,
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
    const stationLabel = resolveTransitStationLabel(trip);
    const terminalLabel = resolveDestinationTerminalLabel(trip);

    return [
        {
            type: 'transit',
            from: trip.origin,
            to: stationLabel,
            durationMinutes: option.duration,
            confidence: option.routeTrustStatus ?? option.trustStatus,
            note:
                option.routeTrustStatus === 'live'
                    ? 'Transit directions from route provider when available.'
                    : 'Estimated transit route duration.',
        },
        {
            type: 'walk',
            from: stationLabel,
            to: terminalLabel,
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
