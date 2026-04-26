import { resolveDynamicParkingPrice } from '../lib/providers/dynamicParkingPricing';

describe('dynamic parking pricing', () => {
  test('returns fallback pricing for WallyPark when live crawl is blocked', async () => {
    const result = await resolveDynamicParkingPrice('wallypark');

    console.log('Dynamic WallyPark price:', result);

    expect(result.lotKey).toBe('wallypark');
    expect(result.price).toBe(32);
    expect(result.status).toBe('fallback');
    expect(result.priceConfidence).toBe('medium');
  });

  test('returns fallback pricing for MasterPark when live crawl has no price', async () => {
    const result = await resolveDynamicParkingPrice('masterpark');

    console.log('Dynamic MasterPark price:', result);

    expect(result.lotKey).toBe('masterpark');
    expect(result.price).toBe(34);
    expect(result.status).toBe('fallback');
    expect(result.priceConfidence).toBe('medium');
  });
});