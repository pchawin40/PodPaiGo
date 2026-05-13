import { expect, test } from '@playwright/test';

const origin =
  'Country Crescent Boulevard, Monroe, Snohomish County, Washington, 98272, United States';

function resultsUrl(params: Record<string, string>) {
  const search = new URLSearchParams({
    type: 'one-way-departure',
    origin,
    destination: 'Central Terminal',
    airport: 'SEA',
    intent: 'flying-out',
    transport: 'all',
    bags: 'no',
    security: 'standard',
    flightType: 'domestic',
    cabin: 'economy',
    ...params,
  });

  return `/results?${search.toString()}`;
}

function localDate(daysFromNow = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function futureDate(daysFromNow = 1) {
  return localDate(daysFromNow);
}

function todayDate() {
  return localDate(0);
}

function timeMinutesFromNow(minutesFromNow: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);

  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

function impossibleFlightParams() {
  return {
    departureDate: todayDate(),
    departureTime: timeMinutesFromNow(-30),
  };
}

test.describe('Results page QA', () => {
  test('clean trip results route loads stored trip data', async ({ page }, testInfo) => {
    const tripId = `e2e-${testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const legacyUrl = resultsUrl({
      departureDate: futureDate(1),
      departureTime: '23:30',
    });
    const query = legacyUrl.split('?')[1] || '';

    await page.goto('/');
    await page.evaluate(
      ({ id, storedQuery }) => {
        window.localStorage.setItem(
          `podpaigo-trip-${id}`,
          JSON.stringify({
            version: 1,
            createdAt: new Date().toISOString(),
            tripData: Object.fromEntries(new URLSearchParams(storedQuery).entries()),
            query: storedQuery,
          })
        );
      },
      { id: tripId, storedQuery: query }
    );

    await page.goto(`/results/${tripId}`);

    await expect(page).toHaveURL(new RegExp(`/results/${tripId}`));
    await expect(page.getByText('Cheapest', { exact: true })).toBeVisible({
      timeout: 30000,
    });
  });

  test('Cheapest sort persists after refresh', async ({ page }) => {
    await page.goto(
      resultsUrl({
        departureDate: futureDate(1),
        departureTime: '23:30',
      })
    );

    await page.getByText('Cheapest', { exact: true }).click();

    await expect(page).toHaveURL(/sort=cheapest/);

    await page.reload();

    await expect(page).toHaveURL(/sort=cheapest/);
    await expect(page.getByText('Cheapest', { exact: true })).toBeVisible();
  });

  test('future flight should show viable options', async ({ page }) => {
    await page.goto(
      resultsUrl({
        departureDate: futureDate(1),
        departureTime: '23:30',
      })
    );

    await expect(
      page.getByText(
        /no viable|no reliable|airport-ready on time|not enough time|too late/i
      )
    ).not.toBeVisible();

    await expect(
      page.getByText(/Good timing|Tight timing/).first()
    ).toBeVisible();
  });

  test('human-readable durations appear', async ({ page }) => {
    await page.goto(
      resultsUrl({
        departureDate: futureDate(1),
        departureTime: '23:30',
      })
    );

    await expect(page.getByText(/\d+h\s+\d+m/).first()).toBeVisible();
  });

  test('impossible same-day flight still renders results page without crashing', async ({
    page,
  }) => {
    await page.goto(resultsUrl(impossibleFlightParams()));

    await expect(page.getByText('Cheapest', { exact: true })).toBeVisible();
    await expect(page.getByText('Fastest', { exact: true })).toBeVisible();
    await expect(page.getByText('Easiest', { exact: true })).toBeVisible();
  });

  test('impossible same-day flight does not show old no-viable card', async ({
    page,
  }) => {
    await page.goto(resultsUrl(impossibleFlightParams()));

    await expect(
      page.getByRole('heading', {
        name: /No reliable option gets you airport-ready on time/i,
      })
    ).not.toBeVisible();
  });

  test('provider sections are hidden by default for impossible same-day flight', async ({
    page,
  }) => {
    await page.goto(resultsUrl(impossibleFlightParams()));

    await expect(page.getByText('Parking providers')).not.toBeVisible();
    await expect(page.getByText('Ride providers')).not.toBeVisible();
    await expect(page.getByText('Transit options')).not.toBeVisible();
  });

  test.skip('high-risk toggle reveals high-risk options', async () => {
    // TODO: Re-enable after production UI has stable selectors/test ids.
  });

  test.skip('uses improved high-risk wording', async () => {
    // TODO: Re-enable after production UI has stable selectors/test ids.
  });

  // Note: The "Review details" text is only visible after clicking the star badge, so we check that in the next test.
  test('smart parking pick renders without crashing', async ({ page }) => {
    await page.goto(
      resultsUrl({
        departureDate: futureDate(1),
        departureTime: '23:30',
      })
    );

    await expect(page.getByText('SMART PARKING PICK')).toBeVisible({
      timeout: 30000,
    });
  });

  // Note: This test is meant to catch any regressions where APR rates are mistakenly labeled as live/verified.
  test('APR wording does not claim confirmed live availability', async ({ page }) => {
    await page.goto(
      resultsUrl({
        departureDate: futureDate(1),
        departureTime: '20:00',
      })
    );

    await expect(page.getByText(/Live APR price/i)).not.toBeVisible();
    await expect(page.getByText(/Live Deal/i)).not.toBeVisible();
    await expect(page.getByText(/Live\/best available rate/i)).not.toBeVisible();
  });
});
