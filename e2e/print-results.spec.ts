import { test, expect } from '@playwright/test';

const origin =
  '19944 Colleens Ln SE, Monroe, WA 98272, USA';

function futureDate(daysFromNow = 1) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

// Generates a URL for the results page with specified search parameters.
function resultsUrl() {
  const departureDate = futureDate(1); // tomorrow
  const parkingCheckOutDate = futureDate(8); // week after tomorrow

  const search = new URLSearchParams({
    type: 'one-way-departure',
    origin,
    destination: 'Central Terminal',
    airport: 'SEA',
    intent: 'flying-out',
    transport: 'car',
    bags: 'no',
    security: 'standard',
    flightType: 'domestic',
    cabin: 'economy',
    departureDate,
    departureTime: '20:00',
    parkingCheckInDate: departureDate,
    parkingCheckOutDate,
    parkingDuration: String(7 * 24 * 60),
    sort: 'cheapest',
  });

  return `/results?${search.toString()}`;
}

test('export results pdf', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'PDF export is only supported in Chromium');
  await page.goto(resultsUrl());

  await expect(
    page.getByText('More parking options', { exact: true })
  ).toBeVisible({ timeout: 30000 });

  await expect(
    page.getByText('Smart parking pick', { exact: true })
  ).toBeVisible({ timeout: 30000 });

  await page.waitForTimeout(1500);

  await page.emulateMedia({ media: 'print' });

  await page.pdf({
    path: 'artifacts/results-page.pdf',
    format: 'Letter',
    printBackground: true,
  });
});