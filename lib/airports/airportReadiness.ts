import { CabinClass, FlightType, SecurityOption } from '../types';

export type AirportReadinessInput = {
  checkingBags: boolean;
  securityOption: SecurityOption;
  flightType: FlightType;
  cabin: CabinClass;
};

export type AirportReadinessResult = {
  bufferMinutes: number;
  assumptions: string[];
};

export function calculateAirportReadinessBuffer(
  input: AirportReadinessInput
): AirportReadinessResult {
  const assumptions: string[] = [];

  let buffer =
    input.flightType === 'international'
      ? input.checkingBags
        ? 180
        : 150
      : input.checkingBags
        ? 105
        : 75;

  assumptions.push(
    input.flightType === 'international'
      ? 'International flight'
      : 'Domestic flight'
  );

  assumptions.push(
    input.checkingBags
      ? 'Checked bags: add check-in/drop-off time'
      : 'No checked bags'
  );

  if (input.securityOption === 'precheck') {
    buffer -= 15;
    assumptions.push('TSA PreCheck: faster security estimate');
  }

  if (input.securityOption === 'clear') {
    buffer -= 10;
    assumptions.push('CLEAR: faster ID/security entry estimate');
  }

  if (input.securityOption === 'clear-precheck') {
    buffer -= 25;
    assumptions.push('CLEAR + PreCheck: fastest security estimate');
  }

  if (input.cabin === 'premium') {
    const reduction = input.checkingBags ? 10 : 5;
    buffer -= reduction;
    assumptions.push('Premium cabin: slightly faster check-in estimate');
  } else {
    assumptions.push('Economy cabin');
  }

  const minimum = input.flightType === 'international' ? 120 : 60;
  buffer = Math.max(minimum, buffer);

  assumptions.push(`Recommended airport-ready buffer: ${buffer} minutes`);

  return {
    bufferMinutes: buffer,
    assumptions,
  };
}