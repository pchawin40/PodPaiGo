import { ParkingOption } from '../types';

export function attachSeaCheckpointRoute(
  option: ParkingOption,
  bestCheckpoint?: {
    name: string;
    minutes: number;
    reason: string;
  } | null
): ParkingOption {
  if (!bestCheckpoint) return option;

  const name = option.name.toLowerCase();

  let checkpointWalkMinutes = 6;
  let routeNote = `Use ${bestCheckpoint.name} after reaching the terminal.`;

  if (option.type === 'official') {
    checkpointWalkMinutes = 4;
    routeNote = `Park in the SEA garage, then walk to ${bestCheckpoint.name}.`;
  }

  if (name.includes('reserved')) {
    checkpointWalkMinutes = 3;
    routeNote = `Reserved garage is closest. Walk to ${bestCheckpoint.name}.`;
  }

  if (option.type === 'off-airport') {
    checkpointWalkMinutes = 8;
    routeNote = `Take the shuttle to the terminal, then use ${bestCheckpoint.name}.`;
  }

  return {
    ...option,
    recommendedCheckpoint: bestCheckpoint,
    checkpointWalkMinutes,
    airportInsideRouteNote: routeNote,
    transferToTerminalMinutes:
      (option.transferToTerminalMinutes ?? 0) + checkpointWalkMinutes,
  };
}