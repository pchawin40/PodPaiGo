# Airport Parking Coverage Report

Generated: 2026-05-31T05:58:04.345Z
Trip dates: 2026-06-14 → 2026-06-17

## Environment
- Google API: yes
- Inventory enabled: yes
- ParkWhiz discovery: yes
- APR enabled: yes

## Summary
4/9 airports at grade C or below; 1 at D/F.

**Recommended next provider:** Enable inventory DB + run /api/parking/discover cron for each hub airport

**Poor coverage (D/F):** PAE

## SEA — Grade A
- Merged options: 15
- Raw provider options: 20
- Active providers: 4
- Live prices: 14 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=8, apr=5, snapshot=6, marketplace=1
- Missing/empty: inventory, google
- Notes: APR cache available for SEA only. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 100 | 0 | 0 | 0 | healthy |
| parkwhiz | 568 | 8 | 8 | 0 | healthy |
| google | 280 | 0 | 0 | 0 | healthy |
| apr | 83 | 5 | 0 | 5 | healthy |
| snapshot | 84 | 6 | 6 | 0 | healthy |
| marketplace | 43 | 1 | 0 | 1 | healthy |

## PAE — Grade F
- Merged options: 1
- Raw provider options: 1
- Active providers: 1
- Live prices: 0 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=0, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, parkwhiz, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. ParkWhiz returned 0 — may need dates, API timeout, or sparse market coverage. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 22 | 0 | 0 | 0 | healthy |
| parkwhiz | 122 | 0 | 0 | 0 | healthy |
| google | 131 | 0 | 0 | 0 | healthy |
| apr | 7 | 0 | 0 | 0 | healthy |
| snapshot | 22 | 0 | 0 | 0 | healthy |
| marketplace | 7 | 1 | 0 | 1 | healthy |

## LAX — Grade A
- Merged options: 37
- Raw provider options: 37
- Active providers: 2
- Live prices: 36 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=36, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 12 | 0 | 0 | 0 | healthy |
| parkwhiz | 387 | 36 | 36 | 0 | healthy |
| google | 34 | 0 | 0 | 0 | healthy |
| apr | 1 | 0 | 0 | 0 | healthy |
| snapshot | 12 | 0 | 0 | 0 | healthy |
| marketplace | 0 | 1 | 0 | 1 | healthy |

## JFK — Grade B
- Merged options: 18
- Raw provider options: 18
- Active providers: 2
- Live prices: 17 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=17, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 50 | 0 | 0 | 0 | healthy |
| parkwhiz | 266 | 17 | 17 | 0 | healthy |
| google | 39 | 0 | 0 | 0 | healthy |
| apr | 1 | 0 | 0 | 0 | healthy |
| snapshot | 49 | 0 | 0 | 0 | healthy |
| marketplace | 1 | 1 | 0 | 1 | healthy |

## ORD — Grade C
- Merged options: 9
- Raw provider options: 9
- Active providers: 2
- Live prices: 8 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=8, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 13 | 0 | 0 | 0 | healthy |
| parkwhiz | 195 | 8 | 8 | 0 | healthy |
| google | 37 | 0 | 0 | 0 | healthy |
| apr | 1 | 0 | 0 | 0 | healthy |
| snapshot | 13 | 0 | 0 | 0 | healthy |
| marketplace | 0 | 1 | 0 | 1 | healthy |

## ATL — Grade C
- Merged options: 8
- Raw provider options: 8
- Active providers: 2
- Live prices: 7 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=7, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 4 | 0 | 0 | 0 | healthy |
| parkwhiz | 173 | 7 | 7 | 0 | healthy |
| google | 35 | 0 | 0 | 0 | healthy |
| apr | 0 | 0 | 0 | 0 | healthy |
| snapshot | 4 | 0 | 0 | 0 | healthy |
| marketplace | 0 | 1 | 0 | 1 | healthy |

## DFW — Grade C
- Merged options: 7
- Raw provider options: 7
- Active providers: 2
- Live prices: 6 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=6, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 5 | 0 | 0 | 0 | healthy |
| parkwhiz | 239 | 6 | 6 | 0 | healthy |
| google | 37 | 0 | 0 | 0 | healthy |
| apr | 1 | 0 | 0 | 0 | healthy |
| snapshot | 5 | 0 | 0 | 0 | healthy |
| marketplace | 1 | 1 | 0 | 1 | healthy |

## LAS — Grade B
- Merged options: 13
- Raw provider options: 13
- Active providers: 2
- Live prices: 12 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=12, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 5 | 0 | 0 | 0 | healthy |
| parkwhiz | 304 | 12 | 12 | 0 | healthy |
| google | 45 | 0 | 0 | 0 | healthy |
| apr | 1 | 0 | 0 | 0 | healthy |
| snapshot | 7 | 0 | 0 | 0 | healthy |
| marketplace | 0 | 1 | 0 | 1 | healthy |

## MCO — Grade B
- Merged options: 16
- Raw provider options: 16
- Active providers: 2
- Live prices: 15 | Estimated: 1
- Provider counts: inventory=0, google=0, parkwhiz=15, apr=0, snapshot=0, marketplace=1
- Missing/empty: inventory, google, apr, snapshot
- Notes: APR provider enabled but returns no lots outside SEA. Marketplace adds link-only SpotHero card (not live inventory).

| Provider | Duration (ms) | Results | Live | Est | Status |
|----------|---------------|---------|------|-----|--------|
| inventory | 16 | 0 | 0 | 0 | healthy |
| parkwhiz | 204 | 15 | 15 | 0 | healthy |
| google | 42 | 0 | 0 | 0 | healthy |
| apr | 0 | 0 | 0 | 0 | healthy |
| snapshot | 16 | 0 | 0 | 0 | healthy |
| marketplace | 0 | 1 | 0 | 1 | healthy |
