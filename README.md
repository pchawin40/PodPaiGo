# PodPaiGo

PodPaiGo is a travel decision companion for airport trips, city destinations, events, and point-to-point travel. It compares drive time, parking, transit, rideshare, timing, weather, and cost in one place — with honest labels for live, estimated, cached, and provider-linked data.

**Product status:** public beta / pre-launch. The app is free during beta. Paid plans are planned later; no billing is active yet.

## What PodPaiGo does

- **Airport trips** — parking, leave-by timing, TSA/checklist context, terminal guidance, rideshare, transit, and weather where available
- **Quick Go / city trips** — drive time, destination garages and lots, street/meter outlook, Park & Ride backups, rideshare, and transit
- **Event and stadium trips** — cautious event-parking guidance; street/meter is not promoted as the primary option unless evidence supports it
- **Accounts** — Supabase sign-in, saved trips, and beta feedback
- **Partner readiness** — outbound provider click tracking and optional affiliate/deep-link attribution when configured

## Core honesty rules

PodPaiGo is built to be partner-demo safe:

- **Never fake prices** — estimated, cached, and live prices stay clearly labeled
- **Live vs estimated vs cached** — UI and ranking copy distinguish provider-live, official, cached/from, estimated, and fallback data
- **Separate trip logic** — airport parking, city/general parking, and event/stadium parking logic stay separate
- **Confirm with providers** — users should always verify final price, availability, and posted parking signs before parking or booking

Suggested public disclosure:

> Parking prices, availability, travel times, and street rules can change. PodPaiGo labels data as live, estimated, cached, or provider-linked where possible. Always confirm final price, availability, and posted parking signs before parking.

## Data sources

| Source | Used for | Notes |
|--------|----------|-------|
| Google Routes | Drive time, route timing | Budget-guarded; may fall back to estimates |
| Google Places | Parking discovery, reviews, photos | Often disabled locally via safe-mode env vars |
| Weather.gov (NWS) | Trip weather context | Near-term forecasts when coordinates and timing allow |
| ParkWhiz | Live bookable parking quotes | Where API access and quotes are available |
| AirportParkingReservations (APR) | Cached/from airport parking rates | SEA-focused cache; confirm live checkout price |
| SpotHero / marketplace links | Provider comparison links | Generic or search deep links; not claimed as live inventory |
| Inventory / cached parking | Saved lots when live refresh is paused | Labeled as cached or fallback |
| Street/meter rules modules | City outlook guidance | Seattle rules today; signs always win |

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Auth / data:** Supabase Auth + Postgres migrations
- **Architecture:** Domain logic in `lib/`, UI in `app/`

## Getting started

### Prerequisites

- Node.js 18+
- npm
- Optional: Supabase project for auth, saved trips, analytics, and parking cache
- Optional: Postgres/Supabase `DATABASE_URL` for parking inventory and provider cache

### Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Restart the dev server after changing `.env.local`.

### Environment variables overview

See `.env.example` for the full list. Common groups:

**Auth / site**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAILS=you@example.com
```

**Google APIs (safe mode defaults in `.env.example`)**

```env
GOOGLE_MAPS_SERVER_API_KEY=
DISABLE_GOOGLE_PLACES=true
DISABLE_GOOGLE_PARKING_DISCOVERY=true
GOOGLE_ROUTES_DAILY_LIMIT=100
```

**Production guardrails**

```env
CRON_SECRET=                # required in production for cron routes
RESEND_API_KEY=               # optional beta feedback email notifications
FEEDBACK_FROM_EMAIL=
PARKWHIZ_AFFILIATE_ID=        # optional partner attribution
```

**Parking provider affiliate params** — optional; if unset, original provider URLs are preserved. See `.env.example` under “Parking provider outbound affiliate/referral attribution”.

### Supabase migrations

SQL migrations live in `supabase/migrations/`. Apply in timestamp order to your Supabase/Postgres project.

Using Supabase CLI:

```bash
supabase db push
```

Or run migration files manually in the Supabase SQL editor. Recent migrations include user auth, API usage tracking, monetization outbound clicks, parking validation reports, and parking provider tables.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm test` | Run Jest test suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript check |

## Project structure

```
app/
  page.tsx                 Landing page
  trip/page.tsx            Full trip planner
  quick-go/                Fast destination checks
  results/                 Recommendation results
  pricing/                 Public beta pricing page
  account/                 Profile + saved trips
  admin/                   Admin-only tools (server-gated)
lib/
  recommendationEngine.ts  Trip recommendation orchestration
  providers.ts           Parking/route/provider enrichment
  parking/                 Airport, city, and event parking logic
  monetization/            Outbound click + provider URL attribution
  marketing/publicCopy.ts  Shared public beta disclosure copy
supabase/migrations/       SQL migrations
AGENTS.md                  Agent instructions + change log
```

## Manual testing checklist

Before a demo, partner call, or deploy:

1. **Quick Go general trip** — named destination from autocomplete, route time, weather, parking cards, honest price labels
2. **SEA airport trip** — parking comparison, leave-by timing, provider CTAs, no fake live labels on cached APR rows
3. **PAE airport trip** — geographically bounded airport parking; no far-away Tacoma-area lots
4. **Event/stadium trip** — e.g. Lumen Field / Seahawks; event parking prioritized over street/meter hero copy
5. **Feedback submission** — Send feedback modal stores event and optional admin email notification
6. **Outbound click tracking** — Reserve/Compare opens provider link and posts to `/api/monetization/outbound-click`
7. **Admin gating** — non-admin users do not see Admin nav or `/admin/*` data
8. **Pricing page** — says free during beta; no Stripe/placeholder dev copy

Automated checks:

```bash
npm test
npm run build
```

## Deployment notes (Vercel)

- Set `CRON_SECRET` in production so cron discovery/refresh routes fail closed when unauthenticated
- Configure API cost guardrails: `GOOGLE_*_DAILY_LIMIT`, `RECOMMENDATIONS_RATE_LIMIT_*`, `PUBLIC_API_RATE_LIMIT_*`
- Set `ADMIN_EMAILS` for admin-only pages and internal APIs
- Apply Supabase migrations before enabling parking validation reports or monetization tables
- Keep `DISABLE_GOOGLE_*` flags tuned for beta cost control; enable live providers deliberately per environment

## Partner / monetization status

- **Outbound click tracking** — implemented via `/api/monetization/outbound-click`
- **Affiliate / deep-link attribution** — centralized provider URL builder; optional env-configured affiliate params
- **No fake commission claims** — PodPaiGo does not claim active subscriptions, live inventory everywhere, or guaranteed partner revenue

## For AI agents

Read `AGENTS.md` before changing routing, parking, recommendation, airport/city/event logic, or monetization behavior. Update the Recent Change Log after meaningful code changes.

Key constraints:

- Keep airport, city, and event parking logic separate
- Do not fake prices or label estimated/static pricing as live
- Do not expose admin/debug UI to normal beta users
- Add targeted tests for behavior changes; run `npm test` and `npm run build`

## Privacy and roadmap

- Privacy: in-app [Privacy](/privacy) page
- Product direction: [Roadmap](/roadmap)
- Pricing / beta status: [Pricing](/pricing)
