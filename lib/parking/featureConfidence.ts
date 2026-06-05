import type {
  ParkingFeatureConfidence,
  ParkingFeatureKey,
  ParkingOption,
} from '../types';

export type ParkingFeatureMeta = {
  key: ParkingFeatureKey;
  label: string;
  confidence: ParkingFeatureConfidence;
  sourceLabel: string;
  passesStrictFilter: boolean;
};

function optionSourceText(option: ParkingOption): string {
  return `${option.providerSource || ''} ${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();
}

function optionText(option: ParkingOption): string {
  return [
    option.name,
    option.address,
    option.type,
    option.transferType,
    ...(option.bestFor || []),
    ...(option.assumptions || []),
  ]
    .join(' ')
    .toLowerCase();
}

function defaultSourceLabel(option: ParkingOption): string {
  const source = optionSourceText(option);
  if (source.includes('community')) return 'user verified';
  if (source.includes('official')) return 'official seed';
  if (source.includes('google')) return 'Google Places';
  return option.bookingProvider || option.sourceName || 'provider';
}

function explicitConfidence(
  option: ParkingOption,
  key: ParkingFeatureKey,
): ParkingFeatureConfidence | null {
  return option.featureConfidence?.[key] ?? null;
}

function confidenceForClaim(
  option: ParkingOption,
  key: ParkingFeatureKey,
  hasStrongClaim: boolean,
  hasWeakClaim: boolean,
): ParkingFeatureConfidence {
  const explicit = explicitConfidence(option, key);
  if (explicit) return explicit;
  if (!hasStrongClaim && !hasWeakClaim) return 'unknown';

  const source = optionSourceText(option);
  if (source.includes('community') || option.validationConfidence === 'high') return 'verified';
  if (source.includes('parkwhiz') || source.includes('airportparkingreservations')) {
    return 'provider_claimed';
  }
  if (source.includes('official')) return 'provider_claimed';
  return hasStrongClaim ? 'provider_claimed' : 'inferred';
}

function featureLabel(key: ParkingFeatureKey, confidence: ParkingFeatureConfidence): string {
  if (confidence === 'verified') {
    switch (key) {
      case 'evCharging':
        return 'EV charging';
      case 'covered':
        return 'Covered';
      case 'secured':
        return 'Secured';
      case 'shuttle':
        return 'Shuttle included';
      case 'valet':
        return 'Valet';
      case 'selfPark':
        return 'Self-park';
    }
  }

  if (confidence === 'provider_claimed') {
    switch (key) {
      case 'evCharging':
        return 'EV charging claimed';
      case 'covered':
        return 'Covered claimed';
      case 'secured':
        return 'Secured claimed';
      case 'shuttle':
        return 'Shuttle included';
      case 'valet':
        return 'Valet claimed';
      case 'selfPark':
        return 'Self-park claimed';
    }
  }

  if (confidence === 'inferred') {
    switch (key) {
      case 'valet':
        return 'Verify valet';
      case 'evCharging':
        return 'Verify EV charging';
      case 'covered':
        return 'Verify covered';
      case 'secured':
        return 'Verify security';
      case 'shuttle':
        return 'Verify shuttle';
      case 'selfPark':
        return 'Verify self-park';
    }
  }

  return 'Feature unknown';
}

export function getParkingFeatureMeta(
  option: ParkingOption,
  key: ParkingFeatureKey,
): ParkingFeatureMeta {
  const text = optionText(option);
  const sourceLabel = defaultSourceLabel(option);

  const hasStrongClaim = (() => {
    switch (key) {
      case 'covered':
        return option.covered === true;
      case 'shuttle':
        return option.transferType === 'shuttle';
      case 'selfPark':
        return !text.includes('valet') && (text.includes('self park') || text.includes('self-park'));
      case 'secured':
        return text.includes('secured') || text.includes('secure') || text.includes('gated');
      case 'evCharging':
        return text.includes('ev charging') || text.includes('electric vehicle charging');
      case 'valet':
        return text.includes('valet');
    }
  })();

  const hasWeakClaim = (() => {
    switch (key) {
      case 'covered':
        return text.includes('garage') || text.includes('indoor') || text.includes('covered');
      case 'shuttle':
        return text.includes('shuttle');
      case 'selfPark':
        return text.includes('self');
      case 'secured':
        return text.includes('security');
      case 'evCharging':
        return text.includes('ev') || text.includes('charging') || text.includes('electric');
      case 'valet':
        return text.includes('valet');
    }
  })();

  const confidence = confidenceForClaim(option, key, hasStrongClaim, hasWeakClaim);

  return {
    key,
    label: featureLabel(key, confidence),
    confidence,
    sourceLabel,
    passesStrictFilter: confidence === 'verified' || confidence === 'provider_claimed',
  };
}

export function getVisibleParkingFeatureBadges(option: ParkingOption): ParkingFeatureMeta[] {
  const keys: ParkingFeatureKey[] = ['covered', 'shuttle', 'evCharging', 'secured', 'valet'];

  return keys
    .map((key) => getParkingFeatureMeta(option, key))
    .filter((meta) => meta.confidence !== 'unknown');
}
