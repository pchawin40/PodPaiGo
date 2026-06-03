# Vercel Google photos/reviews live test (safe caps)

Use this checklist when enabling Google Places **photos** and **reviews** on a Vercel preview or production deployment without surprise quota burn.

## Preconditions

- `GOOGLE_MAPS_SERVER_API_KEY` is set in Vercel (server-only).
- `DISABLE_GOOGLE_PLACES=false` only if you also intend live discovery/details (photos/reviews still need their own flags).
- Photo bytes are **never** stored in Supabase; only in-memory proxy cache (`PLACE_PHOTO_MEDIA_CACHE_TTL_HOURS`, default 24h).
- `place_id` and cached review metadata may persist in Supabase with TTL; treat as Google-sourced cache, not first-party content.

## Safe enable (photos + reviews, minimal burn)

Set in Vercel → Project → Settings → Environment Variables (Preview first):

| Variable | Live-test value | Purpose |
|----------|-----------------|--------|
| `DISABLE_GOOGLE_PLACE_PHOTOS` | `false` | Opt-in live PhotoMedia |
| `DISABLE_GOOGLE_PLACE_REVIEWS` | `false` | Opt-in live reviews |
| `MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST` | `1` | At most one PhotoMedia call per HTTP request |
| `MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST` | `1` | At most one review fetch per HTTP request |
| `MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST` | `1` | Reviews consume a details slot |
| `MAX_GOOGLE_PLACES_CALLS_PER_REQUEST` | `2` | Total Places budget per request |
| `MAX_GOOGLE_SEARCHTEXT_PER_REQUEST` | `0` | Keep discovery off during photo/review test |
| `DISABLE_GOOGLE_PARKING_DISCOVERY` | `true` | No SearchText parking discovery |
| `PLACE_PHOTO_MEDIA_CACHE_TTL_HOURS` | `24` | Short-lived in-memory photo proxy cache |

Leave `DISABLE_GOOGLE_PLACES=true` if you are **only** testing photos/reviews on lots that already have `googlePlaceId` / cached metadata.

## Rollback (safe mode defaults)

Restore these to stop live Google photo/review calls immediately:

| Variable | Rollback value |
|----------|----------------|
| `DISABLE_GOOGLE_PLACE_PHOTOS` | `true` |
| `DISABLE_GOOGLE_PLACE_REVIEWS` | `true` |
| `MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST` | `0` |
| `MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST` | `0` |
| `MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST` | `0` |
| `MAX_GOOGLE_PLACES_CALLS_PER_REQUEST` | `0` |
| `MAX_GOOGLE_SEARCHTEXT_PER_REQUEST` | `0` |
| `DISABLE_GOOGLE_PLACES` | `true` |
| `DISABLE_GOOGLE_PARKING_DISCOVERY` | `true` |

Redeploy or wait for env propagation after changes.

## Logs to verify (development / `DEBUG_LOGS=true`)

On each instrumented request you should see:

- Startup: `[google-places-config] livePlaces=... photos=... caps=...`
- Per request: `[google-places-config] request <route> used=<search>/<details>/<photoMedia>/<total> reviews=<n> blocked=<n>`

Confirm `photoMediaUsed` and `reviewsUsed` stay within caps during manual testing.

## Manual Vercel checklist

1. Deploy with **safe enable** table above on Preview.
2. Open results for a lot with known `googlePlaceId` (SEA test lot).
3. **Photos**: card shows Google attribution + “Photo via Google Maps”; Network tab shows at most one `places.googleapis.com/.../media` per page load (second loads should hit `X-Place-Photo-Cache: hit` or skip live).
4. **Reviews**: open reviews modal — author, star rating, relative time visible; footer shows “Data from Google Maps”.
5. Toggle **rollback** env vars, redeploy, confirm UI shows:
   - “Google photos unavailable in safe mode” when a photo name exists but live photos are off.
   - “Google reviews unavailable in safe mode” when no cached reviews.
   - “Showing cached/provider data” when cached reviews or parking remain.
6. Confirm no new rows in `parking_lot_photos` with `image_url` pointing at `/api/google-place-photo` or Google media URLs.

## Related code

- Guards: `lib/parking/googlePlacesGuard.ts`
- Caps: `lib/apiUsage/placesRequestLimits.ts`, `lib/apiUsage/placesRequestBudget.ts`
- Photo proxy: `app/api/google-place-photo/route.ts`, `lib/parking/placeMediaCache.ts`
- Reviews API: `app/api/parking-reviews/route.ts`
- UI: `app/results/ParkingLotVisual.tsx`, `app/results/ParkingReviewsModal.tsx`
