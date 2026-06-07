import { buildPointAbQuickReadMessage } from '../pointAbQuickRead';

const formatMinutes = (minutes: number) => `${minutes} min`;

describe('buildPointAbQuickReadMessage', () => {
  test('uses parking-hidden copy when no visible cheapest or fastest modes remain', () => {
    expect(
      buildPointAbQuickReadMessage({
        parkingHidden: true,
        cheapest: null,
        fastest: null,
        formatMinutes,
      }),
    ).toBe('Parking is hidden. Compare rideshare, transit, or directions for this trip.');
  });

  test('summarizes only visible options when parking is hidden', () => {
    expect(
      buildPointAbQuickReadMessage({
        parkingHidden: true,
        cheapest: { key: 'transit', label: 'Transit', cost: 3.25 },
        fastest: { key: 'rideshare', label: 'Rideshare', minutes: 28 },
        transitCostDisplay: { primary: '$3.25 est.' },
        formatMinutes,
      }),
    ).toBe(
      'Parking is hidden. Transit is cheapest at $3.25 est.. Rideshare is fastest around 28 min.',
    );
  });

  test('keeps standard cheapest/fastest copy when parking is visible', () => {
    expect(
      buildPointAbQuickReadMessage({
        parkingHidden: false,
        cheapest: { key: 'parking', label: 'Destination parking', cost: 12 },
        fastest: { key: 'rideshare', label: 'Rideshare', minutes: 24 },
        formatMinutes,
      }),
    ).toBe(
      'Destination parking is cheapest around $12. Rideshare is fastest around 24 min.',
    );
  });

  test('leads with selected fastest winner when sort is fastest', () => {
    expect(
      buildPointAbQuickReadMessage({
        parkingHidden: false,
        sort: 'fastest',
        selected: { key: 'rideshare', label: 'Rideshare', minutes: 43 },
        cheapest: { key: 'transit', label: 'Transit', cost: 3.25 },
        fastest: { key: 'rideshare', label: 'Rideshare', minutes: 43 },
        transitCostDisplay: { primary: '$3.25 est.' },
        formatMinutes,
      }),
    ).toBe('Rideshare is fastest around 43 min. Transit is cheapest at $3.25 est..');
  });

  test('falls back to missing-data copy when parking is visible but modes are incomplete', () => {
    expect(
      buildPointAbQuickReadMessage({
        parkingHidden: false,
        cheapest: null,
        fastest: null,
        formatMinutes,
      }),
    ).toBe('Some live route or price data is missing, so confirm final pricing before booking.');
  });
});
