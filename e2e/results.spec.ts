import { expect, test } from '@playwright/test';

const origin =
  'Country Crescent Boulevard, Monroe, Snohomish County, Washington, 98272, United States';

function resultsUrl(params: Record<string, string>) {
  const search = new URLSearchParams({
    type: 'one-way-departure',
    origin,
    destination: 'Central Terminal',
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

function futureDate(daysFromNow = 1) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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
});