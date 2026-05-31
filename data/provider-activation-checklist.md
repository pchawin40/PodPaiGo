# Parking Provider Activation Checklist

## Quick activation order

1. Set `GOOGLE_MAPS_SERVER_API_KEY` and enable Places API (New)
2. Set `DATABASE_URL` (Postgres / Supabase pooler)
3. Set `DISABLE_PARKING_DB_CACHE=false`
4. Run `POST /api/parking/discover` for each hub airport
5. Run `GET /api/admin/refresh-apr?checkInDate=&checkOutDate=` for SEA
6. Open `/admin/parking-diagnostics` and run full coverage audit

## GOOGLE_MAPS_SERVER_API_KEY

**Local:** Add to `.env.local`. Enable Places API (New) on your GCP project.

**Production:** Add to hosting env vars. Restrict key to Places API.

**Verify:** Diagnostics → Google Places status = Healthy, results > 0.

## DATABASE_URL

**Local:** `DATABASE_URL=postgresql://...` or `LOCAL_DATABASE_URL=...`

**Production:** Supabase transaction pooler URL (port 6543).

**Verify:** No `DATABASE_URL is not configured` in audit logs.

## DISABLE_PARKING_DB_CACHE

**Local / Production:** Set to `false` or remove variable once DB works.

**Verify:** Inventory + Snapshot providers enabled on diagnostics page.

## Inventory requirements

**Local:** `POST /api/parking/discover` with `{"airportCode":"SEA"}` (repeat per hub).

**Production:** Schedule `/api/cron/discover-parking`.

**Verify:** `GET /api/parking/inventory?airportCode=SEA` returns count > 0.

## APR requirements

**Local:** Same DB activation + `GET /api/admin/refresh-apr?checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD`

**Production:** Schedule APR refresh for SEA.

**Verify:** SEA audit shows `apr > 0`.

## ParkWhiz

No API key. Requires check-in/check-out dates on search. Works today at major hubs.

**Verify:** `parkwhiz` results > 0 in diagnostics probe.
