export type AprBrowserPriceResult = {
  bookingUrl: string;
  lotId: number | null;
  livePrice: number | null;
};

type AprSearchArgs = {
  checkInDate?: string;
  checkOutDate?: string;
};

function formatAprDate(dateString: string): string {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function extractAprDataFromUrl(url: string): {
  lotId: number | null;
  livePrice: number | null;
} {
  const decoded = decodeURIComponent(url);

  const idMatch = decoded.match(/pr1=.*?id(\d+)/i);
  const priceMatch = decoded.match(/pr1=.*?~pr([0-9]+(?:\.[0-9]{1,2})?)(?:~|&|$)/i);

  return {
    lotId: idMatch?.[1] ? Number(idMatch[1]) : null,
    livePrice: priceMatch?.[1] ? Number(priceMatch[1]) : null,
  };
}

function fallbackLotIdFromAprUrl(url: string): number | null {
  const normalized = url.toLowerCase();

  if (normalized.includes('skyway-inn-airport-parking-sea')) return 226;
  if (normalized.includes('jiffy-airport-parking-sea')) return 262;
  if (normalized.includes('seattle-masterpark-lot-b-sea')) return 117;
  if (normalized.includes('extra-car')) return 97;

  return null;
}

export async function extractVisibleAprPrice(page: any): Promise<number | null> {
  return page.evaluate(() => {
    const parseMoney = (value: string | null | undefined) => {
      if (!value) return null;
      const match = value.replace(/,/g, '').match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
      return match?.[1] ? Number(match[1]) : null;
    };

    const bodyText = document.body.innerText.replace(/\s+/g, ' ');

    const patterns = [
      /from\s+\$([0-9]+(?:\.[0-9]{1,2})?)\s+per day/i,
      /\$([0-9]+(?:\.[0-9]{1,2})?)\s+per day/i,
    ];

    for (const regex of patterns) {
      const match = bodyText.match(regex);
      if (match?.[1]) {
        const price = Number(match[1]);
        if (price >= 5 && price <= 80) return price;
      }
    }

    return null;
  });
}

async function extractAprPageData(page: any): Promise<{
  lotId: number | null;
  rate: number | null;
}> {
  return page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script')).map(
      (s) => s.textContent || ''
    );

    const joined = scripts.join('\n');

    const idMatch =
      joined.match(/"parkinglot":\{[\s\S]*?"id":(\d+)/) ||
      joined.match(/parkinglot\/(\d+)\/search/i);

    const rateMatches = [
      joined.match(/"rates":"[^"]*?from \$([0-9]+(?:\.[0-9]+)?)/),
      joined.match(/"average_7_day_rate":"?([0-9]+(?:\.[0-9]+)?)"?/),
      joined.match(/"average_1_day_rate":"?([0-9]+(?:\.[0-9]+)?)"?/),
      joined.match(/"parkinglot":\{[\s\S]*?"rate":([0-9]+(?:\.[0-9]+)?)/),
      joined.match(/"rate_usd":([0-9]+(?:\.[0-9]+)?)/),
    ];

    const rateMatch = rateMatches.find(Boolean);

    return {
      lotId: idMatch?.[1] ? Number(idMatch[1]) : null,
      rate: rateMatch?.[1] ? Number(rateMatch[1]) : null,
    };
  });
}

async function fetchAprSelectedDatePriceFromPage(
  page: any,
  args: {
    lotId: number;
    checkInDate?: string;
    checkOutDate?: string;
  }
): Promise<number | null> {
  if (!args.checkInDate || !args.checkOutDate) return null;

  const result = await page.evaluate(
    async ({
      lotId,
      checkindate,
      checkoutdate,
    }: {
      lotId: string;
      checkindate: string;
      checkoutdate: string;
    }) => {
      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
      };

      await fetch('/sanctum/csrf-cookie', {
        method: 'GET',
        credentials: 'include',
      }).catch(() => null);

      const xsrfToken = getCookie('XSRF-TOKEN');
      const token =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;

      const res = await fetch(`/parkinglot/${lotId}/search/${token}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json;charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest',
          ...(xsrfToken ? { 'x-xsrf-token': xsrfToken } : {}),
        },
        body: JSON.stringify({
          checkindate,
          checkoutdate,
          checkintime: '12:00:00',
          checkouttime: '12:00:00',
        }),
      });

      const text = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      const rawRate =
        data?.parkinglot?.rate ??
        data?.parkinglot?.price ??
        data?.parkinglot?.products?.data?.[0]?.rate ??
        data?.products?.data?.[0]?.rate ??
        data?.rate ??
        null;

      const rate = Number(rawRate);

      return {
        status: res.status,
        ok: res.ok,
        rate: Number.isFinite(rate) && rate > 0 ? rate : null,
        preview: text.slice(0, 300),
      };
    },
    {
      lotId: args.lotId,
      checkindate: formatAprDate(args.checkInDate),
      checkoutdate: formatAprDate(args.checkOutDate),
    }
  );

  console.log('[APR selected-date API]', {
    lotId: args.lotId,
    status: result?.status,
    ok: result?.ok,
    rate: result?.rate,
    preview: result?.preview,
  });

  return result?.rate ?? null;
}

export async function resolveAprLotsWithBrowser(
  urls: string[],
  args?: AprSearchArgs
): Promise<AprBrowserPriceResult[]> {
  const { chromium } = await import('playwright');

  const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();

    async function resolveOne(url: string): Promise<AprBrowserPriceResult> {
      const page = await context.newPage();

      let lotId: number | null = null;
      let livePrice: number | null = null;

      const maybeExtract = (requestUrl: string) => {
        const extracted = extractAprDataFromUrl(requestUrl);

        if (extracted.lotId) lotId = extracted.lotId;

        if (extracted.livePrice && extracted.livePrice >= 5 && extracted.livePrice <= 80) {
          livePrice = extracted.livePrice;
        }

        const searchMatch = requestUrl.match(/parkinglot\/(\d+)\/search/i);
        if (searchMatch?.[1]) lotId = Number(searchMatch[1]);
      };

      page.on('request', (req) => maybeExtract(req.url()));
      page.on('response', (res) => maybeExtract(res.url()));

      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });

        await page
          .locator('#onetrust-accept-btn-handler')
          .click({ timeout: 2500 })
          .catch(() => null);

        await page.waitForTimeout(4000);

        const visiblePrice = await extractVisibleAprPrice(page);
        if (visiblePrice && visiblePrice >= 5 && visiblePrice <= 80) {
          livePrice = visiblePrice;
        }

        const aprPageData = await extractAprPageData(page);

        if (aprPageData.lotId) lotId = aprPageData.lotId;

        if (!lotId) lotId = fallbackLotIdFromAprUrl(url);

        if (!livePrice && aprPageData.rate && aprPageData.rate >= 5 && aprPageData.rate <= 80) {
          livePrice = aprPageData.rate;
        }

        if (lotId && args?.checkInDate && args?.checkOutDate) {
          const selectedDatePrice = await fetchAprSelectedDatePriceFromPage(page, {
            lotId,
            checkInDate: args.checkInDate,
            checkOutDate: args.checkOutDate,
          });

          if (selectedDatePrice && selectedDatePrice >= 5 && selectedDatePrice <= 80) {
            livePrice = selectedDatePrice;
          }
        }

        console.log('[APR resolved]', {
          url,
          lotId,
          livePrice,
        });
      } catch (error) {
        console.warn('[APR browser resolve failed]', {
          url,
          error,
        });
      } finally {
        await page.close().catch(() => { });
      }

      return {
        bookingUrl: url,
        lotId,
        livePrice,
      };
    }

    return await Promise.all(uniqueUrls.map((url) => resolveOne(url)));
  } finally {
    await browser.close().catch(() => { });
  }
}