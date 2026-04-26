import { extractPriceFromPage } from '../lib/providers/parkingPriceCrawler';
import { PROVIDER_LINKS } from '../lib/providerCatalog';

describe('parking price crawler', () => {
  test('tries WallyPark SEA page', async () => {
    const result = await extractPriceFromPage({
      lotKey: 'wallypark',
      sourceUrl: PROVIDER_LINKS.wallyparkSea.url,
    });

    console.log('WallyPark crawler result:', result);

    expect(result).toBeDefined();
    expect(result.lotKey).toBe('wallypark');
  });

  test('tries MasterPark SEA page', async () => {
    const result = await extractPriceFromPage({
      lotKey: 'masterpark',
      sourceUrl: PROVIDER_LINKS.masterparkSea.url,
    });

    console.log('MasterPark crawler result:', result);

    expect(result).toBeDefined();
    expect(result.lotKey).toBe('masterpark');
  });

  test('tries AirportParkingReservations SEA page', async () => {
    const result = await extractPriceFromPage({
      lotKey: 'airportparkingreservations',
      sourceUrl: PROVIDER_LINKS.airportParkingReservationsSea.url,
    });

    console.log('AirportParkingReservations crawler result:', result);

    expect(result).toBeDefined();
    expect(result.lotKey).toBe('airportparkingreservations');
  });
});