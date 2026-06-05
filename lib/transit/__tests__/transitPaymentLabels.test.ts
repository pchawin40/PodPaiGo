import {
  getTransitPassCoveredLabel,
  getTransitPassOptionLabel,
  isWashingtonTransitRegion,
} from '../transitPaymentLabels';

describe('transitPaymentLabels', () => {
  test('SEA uses generic transit pass label', () => {
    expect(getTransitPassOptionLabel({ airportCode: 'SEA' })).toBe('Transit pass / employer pass');
    expect(getTransitPassCoveredLabel({ airportCode: 'SEA' })).toBe('Covered by transit pass');
    expect(isWashingtonTransitRegion({ airportCode: 'SEA' })).toBe(true);
  });

  test('PAE and WA region use generic transit pass label', () => {
    expect(getTransitPassOptionLabel({ airportCode: 'PAE' })).toBe('Transit pass / employer pass');
    expect(getTransitPassOptionLabel({ region: 'WA' })).toBe('Transit pass / employer pass');
  });

  test('LAX, JFK, and unknown use generic transit pass label', () => {
    expect(getTransitPassOptionLabel({ airportCode: 'LAX' })).toBe('Transit pass / employer pass');
    expect(getTransitPassOptionLabel({ airportCode: 'JFK' })).toBe('Transit pass / employer pass');
    expect(getTransitPassOptionLabel({ airportCode: 'ORD' })).toBe('Transit pass / employer pass');
    expect(getTransitPassOptionLabel({})).toBe('Transit pass / employer pass');

    expect(getTransitPassCoveredLabel({ airportCode: 'LAX' })).toBe('Covered by transit pass');
    expect(getTransitPassCoveredLabel({ airportCode: 'JFK' })).toBe('Covered by transit pass');
    expect(getTransitPassCoveredLabel({})).toBe('Covered by transit pass');
  });
});
