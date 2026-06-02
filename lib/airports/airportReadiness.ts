import { bagPlanAddsMinutes, bagPlanExplanation, resolveBagPlan } from './bagPlan';
import { CabinClass, FlightType, SecurityOption, type BagPlan } from '../types';

export type AirportReadinessInput = {
  checkingBags?: boolean;
  bagPlan?: BagPlan;
  securityOption: SecurityOption;
  flightType: FlightType;
  cabin: CabinClass;
};

export type AirportReadinessResult = {
  bufferMinutes: number;
  assumptions: string[];
  bagPlan: BagPlan;
};

export function calculateAirportReadinessBuffer(
  input: AirportReadinessInput,
): AirportReadinessResult {
  const assumptions: string[] = [];
  const bagPlan = resolveBagPlan(input);

  let buffer = input.flightType === 'international' ? 150 : 75;

  assumptions.push(
    input.flightType === 'international' ? 'International flight' : 'Domestic flight',
  );

  const bagMinutes = bagPlanAddsMinutes(bagPlan);
  if (bagMinutes > 0) {
    buffer += bagMinutes;
    const explanation = bagPlanExplanation(bagPlan);
    if (explanation) assumptions.push(explanation);
  } else {
    assumptions.push('No checked bags');
  }

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
    buffer -= bagPlan === 'none' ? 5 : 10;
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
    bagPlan,
  };
}
