import type { BagPlan } from '../types';

export function resolveBagPlan(input: {
  bagPlan?: BagPlan | null;
  checkingBags?: boolean;
}): BagPlan {
  if (input.bagPlan === 'checked' || input.bagPlan === 'oversized' || input.bagPlan === 'none') {
    return input.bagPlan;
  }

  return input.checkingBags ? 'checked' : 'none';
}

export function bagPlanAddsMinutes(bagPlan: BagPlan): number {
  if (bagPlan === 'checked') return 25;
  if (bagPlan === 'oversized') return 40;
  return 0;
}

export function bagPlanExplanation(bagPlan: BagPlan): string | null {
  if (bagPlan === 'checked') {
    return 'Checked bag selected: added 25 minutes before security.';
  }

  if (bagPlan === 'oversized') {
    return 'Oversized/special item selected: added 40 minutes before security.';
  }

  return null;
}

export function bagPlanLabel(bagPlan: BagPlan): string {
  if (bagPlan === 'checked') return 'Checked bag';
  if (bagPlan === 'oversized') return 'Oversized / special item';
  return 'No checked bag';
}

export function parseBagPlanParam(value: string | null | undefined): BagPlan {
  if (value === 'checked' || value === 'oversized' || value === 'none') {
    return value;
  }

  return 'none';
}
