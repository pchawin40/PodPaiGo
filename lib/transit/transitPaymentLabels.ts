import { getAirportById } from '../airports/catalog';

export type TransitPaymentRegionContext = {
  airportCode?: string | null;
  region?: string | null;
};

const WASHINGTON_AIRPORT_CODES = new Set(['SEA', 'PAE']);

export function resolveTransitPaymentRegionContext(
  input: TransitPaymentRegionContext = {},
): TransitPaymentRegionContext {
  const airportCode = String(input.airportCode || '')
    .trim()
    .toUpperCase();
  const explicitRegion = String(input.region || '')
    .trim()
    .toUpperCase();

  if (explicitRegion) {
    return {
      airportCode: airportCode || input.airportCode || null,
      region: explicitRegion,
    };
  }

  if (airportCode) {
    const airport = getAirportById(airportCode);
    if (airport?.state) {
      return { airportCode, region: airport.state.toUpperCase() };
    }
  }

  return {
    airportCode: airportCode || input.airportCode || null,
    region: null,
  };
}

export function isWashingtonTransitRegion(context: TransitPaymentRegionContext = {}): boolean {
  const resolved = resolveTransitPaymentRegionContext(context);
  const region = String(resolved.region || '').toUpperCase();
  if (region === 'WA') return true;

  const airportCode = String(resolved.airportCode || '').toUpperCase();
  return WASHINGTON_AIRPORT_CODES.has(airportCode);
}

export function getTransitPassOptionLabel(context: TransitPaymentRegionContext = {}): string {
  return isWashingtonTransitRegion(context)
    ? 'ORCA / employer pass'
    : 'Transit pass / employer pass';
}

export function getTransitPassPickerPrompt(context: TransitPaymentRegionContext = {}): string {
  return `Do you pay per ride, or do you have a ${getTransitPassOptionLabel(context).toLowerCase()}?`;
}

export function getTransitPassOptionButtonLabel(context: TransitPaymentRegionContext = {}): string {
  return `I have ${getTransitPassOptionLabel(context).toLowerCase()}`;
}

export function getTransitPassCoveredLabel(context: TransitPaymentRegionContext = {}): string {
  return isWashingtonTransitRegion(context)
    ? 'Covered by ORCA pass'
    : 'Covered by transit pass';
}

export function getTransitPassPriceNote(context: TransitPaymentRegionContext = {}): string {
  return isWashingtonTransitRegion(context)
    ? '$0 with ORCA / employer transit pass'
    : '$0 with transit pass / employer pass';
}

export function getTransitPassAssumption(context: TransitPaymentRegionContext = {}): string {
  return isWashingtonTransitRegion(context)
    ? 'Transit fare shown as $0 because ORCA / employer pass was selected.'
    : 'Transit fare shown as $0 because transit pass / employer pass was selected.';
}

export function getTransitPassAppliedBadge(context: TransitPaymentRegionContext = {}): string {
  return isWashingtonTransitRegion(context) ? 'ORCA pass applied' : 'Transit pass applied';
}
