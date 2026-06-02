# PodPaiGo

A smart airport companion for comparing parking, rideshare, transit, timing, and total trip cost — with account support, saved trips, and safe-mode API protection for local development.

## Features

- **Trip planning**: Airport and point-to-point style flows with leave-by timing
- **Mode comparison**: Parking, rideshare, taxi, and transit with confidence labels
- **Trip-level transit pricing**: Return-leg aware fare estimates on results pages
- **Safe-mode API protection**: Quota caps and disabled Google Places by default in local dev
- **Accounts**: Supabase email/password plus Google sign-in
- **Saved trips**: Save and reopen plans from your account page
- **AI trip assistant**: Mock parser by default with confirm-before-search flow
- **Airport command center**: Airport trip card, airline lookup, and airport guidance
- **TSA and weather context**: Security and weather-aware scoring where available

## Tech stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Auth / data**: Supabase Auth + Postgres migrations
- **Architecture**: Domain logic in `lib/` with provider and mock layers

## Getting started

### Prerequisites

- Node.js 18+
- npm
- Optional: Supabase project for auth/saved trips
- Optional: Postgres/Supabase database for parking cache and airport data

### Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

### Safe mode (recommended for local dev)

These defaults in `.env.example` keep paid Google APIs off unless you opt in:

```env
DISABLE_GOOGLE_PLACES=true
DISABLE_GOOGLE_PARKING_DISCOVERY=true
DISABLE_GOOGLE_PLACE_PHOTOS=true
MAX_GOOGLE_PLACES_CALLS_PER_REQUEST=0
MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST=0
MAX_GOOGLE_SEARCHTEXT_PER_REQUEST=0
MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST=0
```

See `.env.example` for route, geocoding, and live-quote caps.

### Supabase auth

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Google OAuth setup: see [docs/supabase-oauth-setup.md](docs/supabase-oauth-setup.md).

### AI trip assistant

```env
AI_ASSISTANT_PROVIDER=mock
DISABLE_AI_ASSISTANT=false
```

Live providers can be added later; mock mode is the safe default.

## Database migrations

SQL migrations live in `supabase/migrations/`.

Apply them to your Supabase/Postgres project in timestamp order, for example:

1. `20260530120000_national_airports_schema.sql`
2. `20260531120000_parking_provider_tables.sql`
3. `20260601120000_api_usage_and_route_snapshots.sql`
4. `20260601130000_places_cache_enhancements.sql`
5. `20260602120000_user_auth_foundation.sql`

Using Supabase CLI (if installed):

```bash
supabase db push
```

Or run the SQL files manually in the Supabase SQL editor.

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
  page.tsx              Landing page
  trip/page.tsx         Trip planning
  results/page.tsx      Recommendations
  account/page.tsx      Profile + saved trips
  login/page.tsx        Email/password + Google sign-in
  auth/callback/        Supabase OAuth callback
lib/
  recommendationEngine.ts
  auth/                 Saved trips, OAuth helpers, user profile
  transit/              Trip-level transit pricing helpers
  ai/                   Trip assistant parser
  airports/             Airport guide + airline lookup data
supabase/migrations/    SQL migrations
docs/                   Setup guides (OAuth, etc.)
```

## Testing and release checks

Before committing or deploying:

```bash
npm test
npm run build
```

## Privacy

See the in-app [Privacy](/privacy) page for account data, saved trips, OAuth, API caching, and Google Places usage when enabled.

## Roadmap

See [Roadmap](/roadmap) for implemented features and planned work.
