import { extractPriceFromPage } from '../lib/providers/parkingPriceCrawler';
import { PROVIDER_LINKS } from '../lib/providerCatalog';

// Live integration suite: hits real provider pages over the network and can be
// slow/flaky. Skipped by default so it never blocks `npm test`. Opt in with
// RUN_LIVE_PARKING_CRAWLER_TESTS=true.
const runLiveCrawlerTests = process.env.RUN_LIVE_PARKING_CRAWLER_TESTS === 'true';
const describeLive = runLiveCrawlerTests ? describe : describe.skip;

describeLive('parking price crawler', () => {
  jest.setTimeout(30000);

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