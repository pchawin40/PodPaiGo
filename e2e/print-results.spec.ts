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

function resultsUrl() {
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
    departureDate: futureDate(1),
    departureTime: '20:00',
  });

  return `/results?${search.toString()}`;
}

test('export results pdf', async ({ page }) => {
  await page.goto(resultsUrl());

  await page.waitForLoadState('networkidle');

  await expect(page.getByText(/smart parking pick/i)).toBeVisible({
    timeout: 30000,
  });

  await page.emulateMedia({ media: 'print' });

  await page.pdf({
    path: 'artifacts/results-page.pdf',
    format: 'Letter',
    printBackground: true,
  });
});