# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: print-results.spec.ts >> export results pdf
- Location: e2e/print-results.spec.ts:44:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('More parking options', { exact: true })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText('More parking options', { exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]: SEA
        - heading "You should leave at 5:13 PM" [level=1] [ref=e8]
        - paragraph [ref=e9]: Central Terminal • flying out • TSA 20m
        - generic [ref=e10]: Live traffic + airport timing + parking pricing analyzed
        - generic [ref=e11]:
          - generic [ref=e12]: Recommended inside-airport arrival by
          - generic [ref=e13]: 6:30 PM
          - generic [ref=e14]:
            - generic [ref=e15]: "Bags: No"
            - generic [ref=e16]: "Security: TSA"
            - generic [ref=e17]: "Flight: Domestic"
            - generic [ref=e18]: "Cabin: Economy"
          - generic [ref=e19]: Recommended airport arrival time matters more than traffic today.
      - generic [ref=e20]:
        - button "Edit trip" [ref=e21]
        - link "New trip" [ref=e22] [cursor=pointer]:
          - /url: /trip
    - generic [ref=e23]:
      - generic [ref=e24]:
        - generic [ref=e25]: Origin
        - generic [ref=e26]: 19944 Colleens Ln SE, Monroe, WA 98272, USA
      - generic [ref=e27]:
        - generic [ref=e28]: Destination
        - generic [ref=e29]: Central Terminal
      - generic [ref=e30]:
        - generic [ref=e31]: Traffic estimate
        - generic [ref=e32]: 51 min
        - generic [ref=e33]:
          - text: Live traffic data · Updated just now
          - generic [ref=e34]: "Typical: 51 min-53 min"
    - generic [ref=e36]:
      - generic [ref=e37]: Price legend
      - generic [ref=e38]:
        - generic [ref=e39]:
          - generic [ref=e40]: Live
          - generic [ref=e41]: Pulled from provider/API
        - generic [ref=e42]:
          - generic [ref=e43]: Estimated
          - generic [ref=e44]: Calculated or based on typical rates
        - generic [ref=e45]:
          - generic [ref=e46]: From / day
          - generic [ref=e47]: Daily rate; trip total may vary by length of stay
        - generic [ref=e48]:
          - generic [ref=e49]: Check live price
          - generic [ref=e50]: App does not have reliable live pricing yet; open provider to confirm
    - generic [ref=e52]:
      - button "Easiest Lowest stress" [ref=e53]:
        - generic [ref=e54]: Easiest
        - generic [ref=e55]: Lowest stress
      - button "Cheapest Lowest cost" [ref=e56]:
        - generic [ref=e57]: Cheapest
        - generic [ref=e58]: Lowest cost
      - button "Fastest Shortest time" [ref=e59]:
        - generic [ref=e60]: Fastest
        - generic [ref=e61]: Shortest time
    - generic [ref=e63]:
      - generic [ref=e64]: Smart parking pick
      - generic [ref=e65]:
        - generic [ref=e66]:
          - heading "Skyway Inn Airport Parking" [level=2] [ref=e67]
          - generic [ref=e68]:
            - generic [ref=e69]: Best Overall
            - generic [ref=e70]: Shuttle
            - generic [ref=e71]: Verified Link
          - generic [ref=e72]: $30/day
          - generic [ref=e73]: "Est. total: $210 for 7 days"
          - generic [ref=e74]: Drive 50 min + shuttle 12 min
          - generic [ref=e75]: Leave by 6:19 PM to arrive on time
          - generic [ref=e76]: Recommended because it balances price, convenience, and booking confidence.
          - generic [ref=e77]: Popular SEA traveler choice today
        - generic [ref=e78]:
          - link "View deal" [ref=e79] [cursor=pointer]:
            - /url: https://airportparkingreservations.com/lot-skyway-inn-airport-parking-sea
          - link "View route" [ref=e80] [cursor=pointer]:
            - /url: https://www.google.com/maps/dir/?api=1&origin=19944%20Colleens%20Ln%20SE%2C%20Monroe%2C%20WA%2098272%2C%20USA&destination=Skyway%20Inn%20Airport%20Parking%2C%20SeaTac%2C%20WA&travelmode=driving
    - generic [ref=e81]:
      - group [ref=e82]:
        - generic "Compare booking options" [ref=e83] [cursor=pointer]
      - group [ref=e84]:
        - generic "Need rideshare instead? Show ride prices" [ref=e85] [cursor=pointer]
      - generic [ref=e87]:
        - generic [ref=e88]:
          - heading "Transit options" [level=3] [ref=e89]
          - paragraph [ref=e90]: Pricing + links, best-effort and may vary.
        - generic [ref=e91]:
          - generic [ref=e93]:
            - generic [ref=e94]: 🚆
            - generic [ref=e95]:
              - generic [ref=e98]: Sound Transit Trip Planner
              - generic [ref=e100]: High confidence
              - link "Open planner" [ref=e102] [cursor=pointer]:
                - /url: https://www.soundtransit.org/tripplanner
          - generic [ref=e104]:
            - generic [ref=e105]: 🗺️
            - generic [ref=e106]:
              - generic [ref=e109]: Google Maps Transit Directions
              - generic [ref=e111]: Medium confidence
              - link "Open" [ref=e113] [cursor=pointer]:
                - /url: https://www.google.com/maps/dir/?api=1&origin=19944%20Colleens%20Ln%20SE%2C%20Monroe%2C%20WA%2098272%2C%20USA&destination=Seattle-Tacoma%20International%20Airport%20(SEA)%2C%2017801%20International%20Blvd%2C%20SeaTac%2C%20WA%2098158&travelmode=transit
    - link "Plan another trip" [ref=e115] [cursor=pointer]:
      - /url: /trip
  - button "Open Next.js Dev Tools" [ref=e121] [cursor=pointer]:
    - img [ref=e122]
  - alert [ref=e125]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const origin =
  4  |   '19944 Colleens Ln SE, Monroe, WA 98272, USA';
  5  | 
  6  | function futureDate(daysFromNow = 1) {
  7  |   const date = new Date();
  8  |   date.setDate(date.getDate() + daysFromNow);
  9  | 
  10 |   const y = date.getFullYear();
  11 |   const m = String(date.getMonth() + 1).padStart(2, '0');
  12 |   const d = String(date.getDate()).padStart(2, '0');
  13 | 
  14 |   return `${y}-${m}-${d}`;
  15 | }
  16 | 
  17 | // Generates a URL for the results page with specified search parameters.
  18 | function resultsUrl() {
  19 |   const departureDate = futureDate(1); // tomorrow
  20 |   const parkingCheckOutDate = futureDate(8); // week after tomorrow
  21 | 
  22 |   const search = new URLSearchParams({
  23 |     type: 'one-way-departure',
  24 |     origin,
  25 |     destination: 'Central Terminal',
  26 |     airport: 'SEA',
  27 |     intent: 'flying-out',
  28 |     transport: 'car',
  29 |     bags: 'no',
  30 |     security: 'standard',
  31 |     flightType: 'domestic',
  32 |     cabin: 'economy',
  33 |     departureDate,
  34 |     departureTime: '20:00',
  35 |     parkingCheckInDate: departureDate,
  36 |     parkingCheckOutDate,
  37 |     parkingDuration: String(7 * 24 * 60),
  38 |     sort: 'cheapest',
  39 |   });
  40 | 
  41 |   return `/results?${search.toString()}`;
  42 | }
  43 | 
  44 | test('export results pdf', async ({ page }) => {
  45 |   await page.goto(resultsUrl());
  46 | 
  47 |   await expect(
  48 |     page.getByText('More parking options', { exact: true })
> 49 |   ).toBeVisible({ timeout: 30000 });
     |     ^ Error: expect(locator).toBeVisible() failed
  50 | 
  51 |   await expect(
  52 |     page.getByText('Smart parking pick', { exact: true })
  53 |   ).toBeVisible({ timeout: 30000 });
  54 | 
  55 |   await page.waitForTimeout(1500);
  56 | 
  57 |   await page.emulateMedia({ media: 'print' });
  58 | 
  59 |   await page.pdf({
  60 |     path: 'artifacts/results-page.pdf',
  61 |     format: 'Letter',
  62 |     printBackground: true,
  63 |   });
  64 | });
```