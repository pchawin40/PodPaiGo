# PodPaiGo Event Parking Rules

When working on PodPaiGo routing, parking, recommendation, or destination-classification logic, treat sports games, stadiums, arenas, concerts, conventions, and large venues as event trips.

## Event venue detection

A destination should be treated as an event venue when any of the following are true:

* Venue category includes stadium, arena, ballpark, field, coliseum, convention center, amphitheater, theater, concert hall, expo center, raceway, fairgrounds, or major event venue.
* Destination name includes terms like stadium, arena, field, ballpark, coliseum, center, theatre, theater, amphitheatre, amphitheater, speedway, raceway, or convention center.
* Destination is a known sports/event venue such as Lumen Field, T-Mobile Park, Climate Pledge Arena, Allegiant Stadium, Soldier Field, MetLife Stadium, SoFi Stadium, AT&T Stadium, etc.
* User trip text includes phrases like game, match, concert, event, Seahawks, Raiders, Bears, Giants, NFL, MLB, NBA, NHL, soccer, football, baseball, basketball, hockey, or tailgate.
* Destination and travel time are close to a scheduled event window, if event/schedule data is available.

## Event parking behavior

For event venues, do not recommend street/meter parking as the primary option unless there is strong verified evidence that it is allowed and practical for the event window.

Street/meter parking around stadiums should be treated as:

* low confidence,
* likely restricted,
* likely expensive,
* likely unavailable,
* possibly time-limited,
* possibly event-zone controlled,
* risky for towing or tickets.

Default event parking priority:

1. Official venue parking or prepaid event parking
2. Verified nearby paid lots/garages
3. Transit/light rail/park & ride
4. Rideshare/dropoff
5. Street/meter parking only as fallback

## Hero recommendation rules

If the destination is an event venue or sports game:

* Do not use "Free customer parking likely."
* Do not use "Street/meter parking likely" as the main hero.
* Do not use customer parking inference from nearby restaurants/retail.
* Do not treat a stadium like a normal local business.
* Do not assume free parking unless official event parking data says so.
* Prefer "Book event parking first" when official/prepaid parking exists.
* Prefer "Use transit or prepaid parking" when both are reasonable.
* Prefer "Take transit" when transit is cheaper and avoids event traffic.
* Prefer "Use rideshare" only when parking is unavailable/expensive or user selected no-parking preference.
* Show paid parking as event parking, not normal destination parking.

Suggested hero titles:

* "Book event parking first"
* "Use prepaid event parking"
* "Use transit or event parking"
* "Avoid street parking for this event"
* "Take transit to the game"
* "Use rideshare pickup/dropoff"

Suggested parking outlook copy:

"Event parking likely. Street parking may be restricted, full, time-limited, or tow-enforced during games and events. Use official/prepaid parking, transit, or verified lots."

## Sports game examples

These should trigger event parking behavior:

* Seahawks game at Lumen Field
* Seahawks vs Raiders game in Las Vegas at Allegiant Stadium
* Seahawks vs Bears game at Soldier Field
* Seahawks vs Giants game at MetLife Stadium
* Mariners game at T-Mobile Park
* Kraken game at Climate Pledge Arena
* Any NFL, MLB, NBA, NHL, MLS, college football, concert, or large event venue trip

## Event timing

If the user provides a game time or event time, include event buffers:

* Arrive 60–120 minutes early for NFL games.
* Add event traffic buffer.
* Add walking buffer from lot/transit/dropoff.
* Add exit congestion warning after the event.
* If event time is unknown, still classify the venue as event-sensitive but use cautious wording.

## Recommendation cards

For event venues, visible cards should include:

* Event parking / prepaid parking
* Paid garage/lot
* Transit
* Rideshare
* Park & Ride, when useful
* Street/meter parking only under "Fallback" or "More options"

Street/meter card copy should say:

"Risky during events. Check posted signs, event-zone rules, time limits, and towing restrictions."

## Tests required

Any change to event/stadium parking logic must include tests for:

1. Stadium destination should not produce "Free customer parking likely."
2. Stadium destination should not make street/meter parking the best overall recommendation.
3. Sports game text should trigger event parking mode.
4. Event parking or prepaid parking should be eligible to win.
5. Transit should be eligible to win for stadium trips.
6. Rideshare should be eligible to win when user chooses no-parking.
7. Street/meter should only appear as fallback unless strong evidence exists.
8. Airport parking logic must remain separate from event parking logic.
9. Normal suburban customer parking logic must still work for restaurants, grocery stores, retail, gyms, churches, schools, and clinics.

# PodPaiGo Agent Instructions

## Mandatory Change Memory Rule

After every meaningful code change, the agent must update this file before finishing.

A meaningful change includes:
- new feature
- bug fix
- data model change
- API route change
- UI behavior change
- test behavior change
- environment/config change
- deployment/debugging discovery
- known regression or unresolved issue

The update must include:
1. Date/time if available
2. Short summary of what changed
3. Files changed
4. Why the change was made
5. Tests run and result
6. Any known remaining issues
7. Next recommended step

Do not remove prior history unless explicitly asked.
Keep summaries concise but specific enough that a future AI agent can continue without guessing.

## Required End-of-Task Format

At the end of every task, append a new entry under "Recent Change Log" using this format:

---

# Current PodPaiGo State

## Product focus

PodPaiGo is an airport and city trip parking/route optimizer. Current focus is:

- reliable route timing,
- live parking provider data,
- Google Places/Google review metadata,
- general-trip and airport-trip parking recommendations,
- event/stadium parking safety,
- API cost control,
- monetization foundations through booking/referral flows.

## Active priorities

1. Restore Google review/rating chips on parking result cards.
2. Restore origin-to-parking-lot drive time for general/city parking results.
3. Make time breakdowns honest when a route leg is missing.
4. Add diagnostics for missing route, review, price, and provider data.
5. Add API cost guardrails before paid monetization.
6. Add booking/outbound click tracking before subscriptions.
7. Keep airport parking, city parking, and event parking logic separate.

## Current known issues

### General/city parking route time

General-trip parking cards can show total time, park/check-in time, and walk-to-destination time while still showing `Drive to lot: —`.

This usually means the app has calculated:

- park/check-in time,
- walk from lot to destination,

but has **not attached origin-to-parking-lot drive duration** upstream.

The fix should happen in general-trip parking enrichment, not only in UI fallback.

Expected data fields include one or more of:

- `driveToLotMinutes`
- `routeLegs.originToLot.durationMinutes`
- `routeLegs.driveToLot.durationMinutes`
- `parkingRoute.durationMinutes`

### Google reviews on parking cards

Google review chips may disappear from general/city parking result cards even when Google Places infrastructure exists.

Relevant files/features include:

- `app/api/parking-reviews/route.ts`
- `app/results/ParkingReviewsModal.tsx`
- `lib/parking/googlePlaceMatch.ts`
- `lib/parking/reviewSummary.ts`
- `__tests__/googlePlaceReviewsGuard.test.ts`

Expected card fields may include:

- `googlePlaceId`
- `googleRating`
- `googleReviewCount`
- `reviewScore`
- `reviewCount`
- `placeRating`
- `userRatingsTotal`
- `reviewsSummary`

Do not show fake ratings. Only show Google review/rating chips when real rating/review data exists.

## Debugging expectations

When debugging parking result regressions, agents should trace the full data path:

1. API/provider result
2. Normalization/mapping
3. Route enrichment
4. Google place matching/review enrichment
5. Recommendation option object
6. Badge/chip generation
7. Results card render
8. Details & evidence render

Do not fix missing upstream data with only UI fallback unless the upstream data truly cannot be fetched.

## Testing expectations

When fixing route/review/parking regressions, add targeted tests for the affected trip type.

For general/city parking, tests should cover:

- parking option with origin and lot address receives drive-to-lot minutes,
- time breakdown shows Drive to lot instead of `—`,
- total time is not presented as complete when drive-to-lot is missing,
- Google rating chip renders when rating/review data exists,
- Google rating chip does not duplicate,
- airport parking behavior remains separate,
- event/stadium parking behavior remains separate.

---

# Recent Change Log

Add new entries below this line. Do not delete prior entries unless explicitly asked.

### 2026-06-09 — Parking review and drive-to-lot regressions still visible

**Summary**
- User verified in localhost UI that Google review chips are still missing on general-trip parking cards.
- User also verified that drive-to-lot remains blank in Details & evidence.
- Current result can show total time, park/check-in time, and walk time, but origin-to-parking-lot drive duration is missing upstream.
- Prior fallback/display work was not enough because the route duration is not attached to the parking option.

**Files involved**
- `app/results/ResultsContent.tsx`
- `app/results/ParkingSmartPick.tsx`
- `lib/parking/routeDisplay.ts`
- `lib/parking/routeMinutes.ts`
- `lib/parking/googlePlaceMatch.ts`
- `lib/parking/reviewSummary.ts`
- `app/api/parking-reviews/route.ts`

**Known issues**
- General/city-trip parking options may be skipping origin-to-lot route enrichment.
- Google place review metadata may not be attached to general-trip parking result cards.
- UI should not label partial time as complete total when drive-to-lot is missing.

**Next step**
- Debug upstream general-trip parking enrichment.
- Ensure each parking option with origin and lot address/coords receives `driveToLotMinutes` or `routeLegs.originToLot.durationMinutes`.
- Ensure general-trip parking cards receive Google place rating/review summary when available.
- Add targeted tests for general-trip parking route time and Google rating chip rendering.

### 2026-06-09 18:25 PDT — General-trip parking route enrichment fixed upstream

**Summary**
- Changed general/city parking route enrichment from an all-or-nothing timeout to per-lot enrichment with an origin-to-lot fallback.
- General-trip parking options now keep/attach `driveToLotMinutes`, `routeLegs.originToLot.durationMinutes`, `distanceMiles` when available, and route source values such as `google-routes`, `cache`, or `fallback`.
- Updated Google review/debug handling so the Securities Building Garage rendered-card debug log can emit again when Google review fields or generated badges change.
- Preserved valid drive-to-lot fields when client-side Google Place enrichment adds matching Google coordinates.
- Updated ranked parking card breakdowns to show partial totals and row display text when drive-to-lot is missing.

**Files changed**
- `lib/providers.ts`
- `lib/__tests__/providersParkingAirport.test.ts`
- `app/results/ResultsContent.tsx`
- `app/results/ParkingSmartPick.tsx`

**Why**
- The real `/results?type=general-trip...` UI showed `Drive to lot: —` for the Securities Building Garage because route enrichment could time out before attaching origin-to-lot fields upstream.
- Google review chips were still not visible, so rendered-card diagnostics needed to show whether fields are missing upstream, missing after Google match, or ignored by badge/action generation.

**Tests run and result**
- `npm test -- --runTestsByPath lib/__tests__/providersParkingAirport.test.ts --runInBand` passed, 9 tests. Jest still printed its existing open-handle warning after this provider test file.
- `npm test -- --runTestsByPath __tests__/routeMinutes.test.ts app/results/__tests__/ParkingSmartPick.test.tsx --runInBand` passed, 21 tests.
- `npm test -- --runTestsByPath app/api/parking/live-refresh/__tests__/route.test.ts lib/parking/__tests__/priorityBadges.test.ts --runInBand` passed, 4 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Needs visual verification in localhost/Vercel with live provider and Google Place credentials to confirm the Securities Building Garage now shows an actual drive-to-lot duration or a clear fallback/partial state.
- Temporary rendered-card debug logs remain for Securities Building Garage and should be removed or gated after the review-chip regression is verified.

**Next recommended step**
- Re-run the same general-trip UI search, inspect the browser/server console for `[parking-results] rendered parking option review debug`, and confirm whether the Google review fields are now present and displayed.

### 2026-06-09 18:37 PDT — Parking review modal summary-only state fixed

**Summary**
- Fixed the review-modal data path where Google rating/count could be present but individual review rows were missing.
- `/api/parking-reviews` now returns top-level `placeId`/`googlePlaceId`, `rating`, `reviewCount`, `googleMapsUri`/`googleMapsUrl`, attribution, and `reviews`.
- Added temporary server debug log `[parking-reviews debug]` and client debug log `[ParkingReviewsModal data]` outside test mode.
- Changed Google review details lookup so `purpose: 'reviews'` does not stop at a coordinate-only place-id cache record with no snippets.
- Updated `ParkingReviewsModal` to show individual review cards when `reviews[]` exists, show summary-only copy when rating/count exists but snippets are empty, and reserve the no-review message for truly missing/zero review data.

**Files changed**
- `app/api/parking-reviews/route.ts`
- `app/results/ParkingReviewsModal.tsx`
- `app/results/__tests__/ParkingReviewsModal.test.tsx`
- `lib/parking/googlePlacesCache.ts`
- `__tests__/googlePlaceReviewsGuard.test.ts`

**Why**
- User verified the modal header and card showed a Google rating summary for `1935 2nd Ave. Lot`, but the modal body incorrectly said `No Google reviews available for this listing.`
- The root cause was both misleading modal copy for summary-only Google data and a review lookup cache shortcut that could skip live review details when only coordinates/rating were cached.

**Tests run and result**
- `npm test -- --runTestsByPath __tests__/googlePlaceReviewsGuard.test.ts app/results/__tests__/ParkingReviewsModal.test.tsx --runInBand` passed, 21 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Temporary debug logs remain and should be removed or gated after live UI verification confirms review snippets or the summary-only state behave correctly.
- Google Places may legitimately return rating/count without review snippets for some listings; the modal now states that accurately.

**Next recommended step**
- Reopen the `1935 2nd Ave. Lot` review modal in localhost/Vercel and inspect `[parking-reviews debug]` plus `[ParkingReviewsModal data]` for `reviewsLength` and `firstReview`.

### 2026-06-09 18:41 PDT — Reviewer profile images hidden in review modal

**Summary**
- Removed reviewer profile `<img>` rendering from `ParkingReviewsModal`.
- Review rows now use a small initials avatar derived from reviewer name, preventing broken Google profile image icons.
- Kept reviewer name, star rating, relative time, review text, Google attribution, and Google Maps review link.

**Files changed**
- `app/results/ParkingReviewsModal.tsx`
- `app/results/__tests__/ParkingReviewsModal.test.tsx`

**Why**
- User verified review rows now load, but reviewer profile photo URLs render as broken image icons.
- Until image loading can be validated, the modal should not render third-party reviewer profile images.

**Tests run and result**
- `npm test -- --runTestsByPath app/results/__tests__/ParkingReviewsModal.test.tsx --runInBand` passed, 8 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Reviewer profile photos are intentionally hidden for now.
- If profile photos are reintroduced later, image URL validation and an `onError` fallback must be added before rendering `<img>`.

**Next recommended step**
- Reopen a parking review modal with Google review rows and confirm no broken image icon appears on mobile or desktop.

### 2026-06-09 18:45 PDT — Review modal initials avatars styled

**Summary**
- Kept the image-free reviewer avatar approach in `ParkingReviewsModal`.
- Replaced plain light initials circles with deterministic dark/branded gradient avatars based on reviewer name.
- Added subtle borders/ring styling while keeping initials in light text for contrast.

**Files changed**
- `app/results/ParkingReviewsModal.tsx`

**Why**
- User verified the no-profile-photo approach works but plain initials avatars looked too bare in dark modal contexts.
- Review rows needed a cleaner branded avatar treatment without reintroducing broken image risk.

**Tests run and result**
- `npm test -- --runTestsByPath app/results/__tests__/ParkingReviewsModal.test.tsx --runInBand` passed, 8 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Reviewer profile photos remain intentionally hidden.
- No class-specific avatar tests were added because existing tests assert initials and no `<img>`, not styling classes.

**Next recommended step**
- Visually verify review modal rows in dark and light contexts on mobile and desktop.

### 2026-06-09 19:08 PDT — Admin-only gates for internal features

**Summary**
- Added a shared admin guard backed by `ADMIN_EMAILS` and reused it across admin/internal APIs.
- Protected `/api/admin/*`, parking diagnostics, and parking inventory/discovery maintenance endpoints server-side.
- Added an admin route boundary for `/admin/*` pages and replaced browser-side `ADMIN_EMAILS` checks with a server-verified admin status hook.
- Hid internal route/provider/debug panels and temporary review/photo debug traces from normal beta users.
- Hardened debug UI flags so public production builds do not trust client-side debug/admin flags.

**Files changed**
- `lib/auth/admin.ts`
- `lib/admin/adminAuth.ts`
- `app/components/useAdminStatus.ts`
- `app/admin/AdminRouteBoundary.tsx`
- `app/admin/layout.tsx`
- `app/admin/analytics/page.tsx`
- `app/admin/parking-diagnostics/page.tsx`
- `app/admin/parking-submissions/AdminParkingSubmissionsClient.tsx`
- `app/api/admin/status/route.ts`
- `app/api/admin/analytics/route.ts`
- `app/api/admin/parking-submissions/route.ts`
- `app/api/admin/refresh-apr/route.ts`
- `app/api/parking/diagnostics/route.ts`
- `app/api/parking/discover/route.ts`
- `app/api/parking/inventory/route.ts`
- `app/api/cron/discover-parking/route.ts`
- `app/components/SiteHeader.tsx`
- `app/account/AccountDashboard.tsx`
- `app/results/ResultsContent.tsx`
- `app/results/ParkingSmartPick.tsx`
- `lib/utils/debug.ts`
- Related tests under `app/api/admin`, `app/components`, `app/results`, `lib/admin`, `lib/utils`, and `__tests__`.

**Why**
- Normal beta users should not see admin dashboards, diagnostics, provider refresh tools, raw analytics, route/provider debug UI, admin nav links, or admin API data.
- Admin access needed a single server-side source of truth using signed-in user email allowlisted by `ADMIN_EMAILS`.

**Tests run and result**
- `npm test -- --runTestsByPath lib/admin/__tests__/adminAuth.test.ts lib/utils/__tests__/debug.test.ts app/api/admin/status/__tests__/route.test.ts app/api/admin/parking-submissions/__tests__/route.test.ts app/api/admin/refresh-apr/__tests__/route.test.ts app/components/__tests__/SiteHeader.test.tsx app/results/__tests__/ParkingSmartPick.test.tsx __tests__/userParkingSpacesSecurity.test.ts --runInBand` passed, 54 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Admin status is checked by multiple client components, so admin pages may make duplicate `/api/admin/status` requests.
- `CRON_SECRET` should be set for scheduled parking discovery refreshes; otherwise the guarded discovery endpoint will reject unauthenticated calls outside local debug mode.

**Next recommended step**
- Verify in Vercel with a non-admin beta account and an allowlisted admin account that admin nav, `/admin/*`, `/api/admin/*`, parking diagnostics, and debug panels are hidden or accessible as expected.

### 2026-06-09 19:29 PDT — Beta analytics, feedback, reserve tracking, and recommendation guardrails

**Summary**
- Added lightweight beta analytics events for recommendation search lifecycle, parking result views, parking details expansion, reserve/route/walk clicks, Google review opens, Google Maps review clicks, new trip clicks, feedback, cache hits/misses, and rate-limit hits.
- Made reserve/outbound parking tracking use `sendBeacon` with fetch fallback and sanitized outbound metadata.
- Added a `Send feedback` modal on results pages plus `/api/feedback` storage and an admin-protected `/api/admin/feedback` inbox endpoint.
- Added in-memory rate limiting and short TTL response caching for `/api/recommendations`, keyed by session/IP and hashed request body only.

**Files changed**
- `app/results/ResultsContent.tsx`
- `app/results/ParkingProviderActions.tsx`
- `app/results/ParkingReviewsModal.tsx`
- `app/results/BetaFeedbackButton.tsx`
- `app/api/recommendations/route.ts`
- `app/api/feedback/route.ts`
- `app/api/admin/feedback/route.ts`
- `app/api/monetization/outbound-click/route.ts`
- `lib/apiUsage/recommendationsGuard.ts`
- `lib/analytics/analyticsTypes.ts`
- `lib/analytics/sanitizeAnalytics.ts`
- `lib/analytics/validateAnalyticsEvent.ts`
- `lib/analytics/trackEvent.ts`
- `lib/analytics/serverTrackEvent.ts`
- `lib/feedback/betaFeedback.ts`
- `lib/monetization/trackOutboundClick.ts`
- Tests under `__tests__`, `app/api/recommendations/__tests__`, `app/results/__tests__`, and `lib/analytics/__tests__`.

**Why**
- GitHub issue #5 needs beta-safe analytics, booking click tracking, user feedback capture, and cost guardrails before wider beta usage.
- Analytics metadata must avoid full home addresses, raw origins, raw provider payloads, and non-admin exposure of internal data.

**Tests run and result**
- `npm test -- --runTestsByPath __tests__/analyticsEventRoute.test.ts lib/analytics/__tests__/sanitizeAnalytics.test.ts app/results/__tests__/ParkingProviderActions.test.tsx app/results/__tests__/BetaFeedbackButton.test.tsx __tests__/feedbackRoute.test.ts app/api/recommendations/__tests__/route.test.ts app/results/__tests__/ParkingReviewsModal.test.tsx --runInBand` passed, 25 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- `/api/recommendations` cache and rate limits are in-memory per server process, so they are beta guardrails rather than distributed enforcement.
- Feedback is stored in `analytics_events`; a dedicated feedback table can be added later if moderation/workflow needs grow.
- No scoring, ranking, parking provider fetching, Stripe, or paywall logic was changed.

**Next recommended step**
- Configure `RECOMMENDATIONS_RATE_LIMIT_WINDOW_MS`, `RECOMMENDATIONS_RATE_LIMIT_MAX`, and `RECOMMENDATIONS_CACHE_TTL_SECONDS` for Vercel beta, then verify analytics and feedback rows in Supabase with a non-admin beta account.

### 2026-06-09 20:24 PDT — Feedback admin email notifications

**Summary**
- Added server-side Resend email notifications for valid `/api/feedback` submissions.
- Notifications are sent to `ADMIN_EMAILS` after validation and feedback storage handling.
- Missing `RESEND_API_KEY`, missing `FEEDBACK_FROM_EMAIL`, missing admin recipients, or Resend failures do not fail feedback submission.
- Email content includes issue type, message, optional submitted email, sanitized page URL, result/trip type, provider/lot, timestamp, and user agent.

**Files changed**
- `.env.example`
- `app/api/feedback/route.ts`
- `lib/feedback/feedbackEmail.ts`
- `__tests__/feedbackRoute.test.ts`
- `lib/feedback/__tests__/feedbackEmail.test.ts`
- `AGENTS.md`

**Why**
- Admins need immediate beta feedback notifications without exposing `ADMIN_EMAILS` to the client and without making feedback submission dependent on email provider availability.

**Tests run and result**
- `npm test -- --runTestsByPath __tests__/feedbackRoute.test.ts lib/feedback/__tests__/feedbackEmail.test.ts --runInBand` passed, 9 tests.
- `npm run build` passed.

**Known remaining issues**
- Email notification delivery uses Resend REST directly and is best-effort; delivery failures are logged server-side only.
- Feedback remains stored in `analytics_events`; a dedicated feedback workflow/table can be added later if needed.

**Next recommended step**
- Set `RESEND_API_KEY`, `FEEDBACK_FROM_EMAIL`, and `ADMIN_EMAILS` in Vercel, then submit a beta feedback item and confirm the admin email arrives.

### 2026-06-09 20:53 PDT — Weather, validation report RLS, and PAE parking bounds fixes

**Summary**
- Weather lookups now carry explicit unavailable reasons and diagnostics from weather.gov through the recommendation response.
- Full trip details only shows `Forecast becomes available closer to your trip.` for true forecast-window misses, not provider failures or missing coordinates.
- Quick Go-shaped general trips with usable destination coordinates now fetch near-term weather, including first available hourly forecast when the requested time is just before the first provider period.
- Parking validation reports now insert through the server-side service role API path instead of anon/auth RLS writes.
- PAE airport parking searches now use a tighter default max distance and Google Places search radius, excluding Tacoma-area lots upstream before ranking/rendering.

**Files changed**
- `app/api/parking/validation-report/route.ts`
- `app/results/ResultsContent.tsx`
- `lib/recommendationEngine.ts`
- `lib/types.ts`
- `lib/weather/nws.ts`
- `lib/weather/types.ts`
- `lib/weather/display.ts`
- `lib/parking/airportValidation.ts`
- `lib/providers/parking/providers/googlePlaces/airportSearch.ts`
- `lib/providers/parking/providers/inventory/provider.ts`
- `supabase/migrations/20260610120000_parking_validation_reports_server_insert.sql`
- `lib/weather/__tests__/nws.test.ts`
- `lib/weather/__tests__/display.test.ts`
- `lib/__tests__/recommendationEngineTrafficDestination.test.ts`
- `__tests__/parkingFeedbackFoundation.test.ts`
- `__tests__/parkingValidationReportRoute.test.ts`
- `lib/parking/__tests__/airportValidation.test.ts`
- `lib/providers/parking/providers/googlePlaces/__tests__/airportSearch.test.ts`
- `AGENTS.md`

**Why**
- Production Quick Go/full details weather could show the out-of-window message for generic weather failures or missing destination coordinates.
- Parking report inserts were failing against `parking_validation_reports` RLS policies.
- PAE airport parking searches could surface far-away lots, including Tacoma-area results, instead of staying geographically bounded to Everett/PAE.

**Tests run and result**
- `npm test -- --runTestsByPath lib/weather/__tests__/nws.test.ts lib/weather/__tests__/display.test.ts lib/__tests__/recommendationEngineTrafficDestination.test.ts __tests__/parkingFeedbackFoundation.test.ts __tests__/parkingValidationReportRoute.test.ts lib/parking/__tests__/airportValidation.test.ts lib/providers/parking/providers/googlePlaces/__tests__/airportSearch.test.ts --runInBand` passed, 63 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Weather lookup timeout is an engine-level timeout; the underlying fetch may still finish in the background.
- `parking_validation_reports` production DB needs the new migration applied so direct anon/auth inserts are revoked and service-role API insert is the intended path.
- PAE default max airport parking radius is 8 miles and can be overridden with `PARKING_MAX_DISTANCE_MILES_PAE`.

**Next recommended step**
- Deploy the migration and verify in production: Quick Go/full details weather for a near-term trip, parking report submission, and PAE parking results with no Tacoma-area lots.

### 2026-06-09 21:10 PDT — Cron fail-closed, public API rate limits, and ParkWhiz price cleanup

**Summary**
- Cron parking discovery and refresh routes now fail closed with 401 in production when `CRON_SECRET` is unset, while local/dev can still run without the secret.
- Added shared bounded in-memory public endpoint rate limiting and applied it to feedback, parking validation reports, parking reviews, and weather.
- Added per-key feedback admin email throttling so accepted feedback is still stored but repeated submissions do not inbox-bomb admins.
- Replaced parking reviews' unconditional debug console log with the existing `debugLog` gate.
- ParkWhiz live quotes now use `parkwhiz-live` price provenance, and ParkWhiz quotes with no provider price are dropped instead of becoming `$999` sentinel options.
- Bounded `/api/recommendations` in-memory response cache and rate-limit map to prevent unbounded growth.

**Files changed**
- `app/api/cron/discover-parking/route.ts`
- `app/api/cron/refresh-parking/route.ts`
- `app/api/feedback/route.ts`
- `app/api/parking-reviews/route.ts`
- `app/api/parking/validation-report/route.ts`
- `app/api/weather/route.ts`
- `app/api/recommendations/route.ts`
- `lib/auth/cron.ts`
- `lib/apiUsage/inMemoryRateLimiter.ts`
- `lib/apiUsage/publicRateLimit.ts`
- `lib/apiUsage/feedbackEmailThrottle.ts`
- `lib/apiUsage/recommendationsGuard.ts`
- `lib/providers/parkWhiz.ts`
- `lib/types.ts`
- `lib/access/pricingLadder.ts`
- `__tests__/feedbackRoute.test.ts`
- `__tests__/publicEndpointRateLimit.test.ts`
- `app/api/cron/__tests__/auth.test.ts`
- `app/api/recommendations/__tests__/route.test.ts`
- `lib/parking/__tests__/destinationSearch.test.ts`
- `lib/access/__tests__/pricingLadder.test.ts`
- `__tests__/parkingPriceDisplay.test.ts`
- `AGENTS.md`

**Why**
- Scheduled production cron endpoints should not become unauthenticated when a secret is missing.
- Public beta endpoints need lightweight abuse protection without changing scoring, ranking, provider fetching, or paywall behavior.
- Feedback email notifications should remain best-effort and not become an admin inbox abuse vector.
- Normal production logs should not include parking review debug payloads unless debug logging is enabled.
- ParkWhiz no-price quotes must not be displayed, sorted, or scored as fake high-price options.

**Tests run and result**
- `npm test -- --runTestsByPath __tests__/feedbackRoute.test.ts __tests__/publicEndpointRateLimit.test.ts app/api/cron/__tests__/auth.test.ts app/api/recommendations/__tests__/route.test.ts lib/parking/__tests__/destinationSearch.test.ts lib/access/__tests__/pricingLadder.test.ts __tests__/parkingPriceDisplay.test.ts` passed, 48 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Public endpoint rate limits, feedback email throttling, and recommendation cache/rate-limit caps are in-memory per server process, not distributed across Vercel instances.
- Production should set `CRON_SECRET`; without it, cron routes now intentionally reject requests in production.

**Next recommended step**
- Configure beta env values for `CRON_SECRET`, `PUBLIC_API_RATE_LIMIT_WINDOW_MS`, `PUBLIC_API_RATE_LIMIT_MAX`, `PUBLIC_API_RATE_LIMIT_MAX_ENTRIES`, `FEEDBACK_EMAIL_THROTTLE_MS`, `RECOMMENDATIONS_CACHE_MAX_ENTRIES`, and `RECOMMENDATIONS_RATE_LIMIT_MAX_ENTRIES`, then verify cron auth and 429 responses in Vercel.

### 2026-06-09 21:45 PDT — Quick Go missing destination coordinates (route + weather) fixed

**Summary**
- Root-caused Monroe → Brighton Jones Quick Go showing no route time and weather "needs a confirmed destination location."
- Two misleading signals corrected:
  - `google_usage_summary` `routes:0`/`geocoding:0` was a measurement artifact — those daily counters in `googlePlacesDailyBudget` were never incremented (`recordGooglePlacesDailyCall` only ever maps to `searchText`/`getPlace`/`photoMedia`). Real Routes/Geocoding usage lives in `recordApiUsage`/`getApiUsageDiagnostics`. Now `recordApiUsage('google_routes'|'geocoding')` also bumps the snapshot counters, so the summary reflects reality.
  - `UNKNOWN|...` place-match cache keys are just the airport-code slot defaulting for non-airport trips; unrelated.
- Real root cause: named destinations selected from `/api/geocode/autocomplete` carry a `place_id` but no lat/lng, and `applyQuickGoDestinationToSearchParams` dropped the `place_id`. The destination reached the engine as text only, so `mainDestinationLatLng` was undefined → weather `missing-coordinates` and fragile route timing dependent on the Geocoding API (which can be unauthorized/blocked while Places-based parking still works).
- Fixes (server + client, per user choice):
  - Added `destinationPlaceId` plumbing mirroring `originPlaceId` (`TripData`, Quick Go selection/param-key/apply/read, `parseTripDataFromSearchParams` read + reverse write).
  - Engine `resolveTripCoordinate` now resolves coords from `place_id` (via budget-guarded `getPlace`) before falling back to text geocoding; call sites pass `originPlaceId`/`destinationPlaceId`.
  - New `resolveGooglePlaceCoordinates(placeId)` helper in `googlePlacesCache.ts` and new `GET /api/geocode/place` endpoint.
  - `QuickGoPanel` resolves coordinates on submit when the destination has a `place_id` but no lat/lng, so coords land in the results URL immediately.

**Files changed**
- `lib/parking/googlePlacesCache.ts` (new `resolveGooglePlaceCoordinates`)
- `lib/types.ts`, `lib/trip/quickGo.ts`, `lib/trip/searchParams.ts` (destinationPlaceId plumbing)
- `lib/recommendationEngine.ts` (place_id coord resolution + call sites)
- `app/api/geocode/place/route.ts` (new endpoint)
- `app/components/QuickGoPanel.tsx` (client coord resolution on submit)
- `lib/apiUsage/guard.ts` (recordApiUsage bumps routes/geocoding daily counters)
- `lib/parking/googlePlacesConfig.ts` (summary comment; snapshot now accurate)
- Tests: `lib/trip/__tests__/quickGoDestinationCoords.test.ts`, `lib/__tests__/recommendationEngineDestinationPlaceId.test.ts`, `app/api/geocode/place/__tests__/route.test.ts`, `lib/parking/__tests__/googleUsageSummary.test.ts`

**Why**
- Restore honest route timing and weather for general/city Quick Go trips whose destination was chosen from autocomplete, without depending on a separate Geocoding API call, and stop the always-zero diagnostics from misleading future debugging.

**Tests run and result**
- `npx jest --runTestsByPath lib/trip/__tests__/quickGoDestinationCoords.test.ts lib/__tests__/recommendationEngineDestinationPlaceId.test.ts app/api/geocode/place/__tests__/route.test.ts lib/parking/__tests__/googleUsageSummary.test.ts --runInBand` → 12 passed.
- Regression: `recommendationEngineTrafficDestination`, `quickGo`, `searchParamsFlightDate`, `destinationSearch`, `lib/apiUsage`, `providersParkingAirport`, `app/api/recommendations`, `QuickGoPanel` → all passed (80 + 44 + 11).
- `npm run build` passed (`/api/geocode/place` registered). `git diff --check` clean.

**Known remaining issues**
- `/api/geocode/place` and the engine `place_id` resolver consume one budget-guarded `getPlace` call per uncached named destination (replaces the prior failing geocode; counts against `GOOGLE_GETPLACE_DAILY_LIMIT`).
- Typed destinations with neither coords nor `place_id` still rely on the server text geocode; if the Geocoding API key is unauthorized/blocked, those remain coordinate-less (separate env/config concern).

**Next recommended step**
- Re-run the Monroe → Brighton Jones Quick Go in localhost/Vercel: confirm the results URL now carries `destinationPlaceId` (or `destinationLat/Lng`), route time and weather render, and `google_usage_summary` shows non-zero `routes`/`geocoding` when live calls happen.

### 2026-06-09 21:58 PDT — Smart Recommendation street/meter card overflow + misleading $0 quick read fixed

**Summary**
- Fixed Smart Recommendation card overflow for general/city trips (e.g. Brighton Jones / downtown Seattle). The Street / meter card no longer jams the long Seattle paid-hours paragraph into the compact Cost tile.
- Street/meter compact `costNote` is now a short, scannable label (`Verify signs` when verification is required, otherwise `Check meter`; events keep `Risky during events`). The long parking-outlook paragraph moved to a new `detailNote` field surfaced in Details/evidence (`StreetParkingPlanNote`), which now also carries the `details-street-meter` scroll id.
- Quick read no longer presents uncertain street/meter as a confident "cheapest around $0". When street/meter is cheapest but its price is not trustworthy (medium/low confidence, verify-required, or $0/unknown), the copy hedges to the cheapest reliable option ("Cheapest reliable option appears to be Paid garage/lot around $12. Street / meter parking may be cheaper if legal and available.") or to "Street / meter may be cheapest, but signs and paid-hour rules need verification." when no reliable alternative exists.
- Added defensive `line-clamp-2 break-words` on the cost-tile note in `OptionComparisonCard` and the inline airport card so any future long copy cannot overflow the metric tile.
- Airport, city, and event/stadium parking logic kept separate; no backend provider fetching changed.

**Files changed**
- `lib/parking/pointAbQuickRead.ts` (hedged cheapest clause + new optional inputs `cheapestUncertainStreetMeter`, `reliableAlternative`)
- `lib/parking/pointAbRanking.ts` (short street/meter `costNote`, new `detailNote`, `cheapestStreetMeterUncertain` + `cheapestReliableAlternative` on the result)
- `app/results/ResultsContent.tsx` (pass new quick-read inputs, plumb `detailNote`, render long outlook + scroll id in `StreetParkingPlanNote`, clamp inline cost note)
- `app/components/OptionComparisonCard.tsx` (clamp/break the cost-tile note)
- `lib/parking/__tests__/streetMeterSmartCard.test.ts` (new)
- `app/components/__tests__/OptionComparisonCard.test.tsx` (cost-tile clamp test)
- `AGENTS.md`

**Why**
- The Street / meter card overflowed because `meterPricing` `costNote` (the long `localStreetParkingRules.detail` paragraph) was rendered directly inside the small Cost metric tile.
- A $0 free/uncertain street estimate made it the "cheapest" winner, producing the misleading "Street / meter parking is cheapest around $0" quick read even though signs and downtown paid-hour rules are unverified.

**Tests run and result**
- `npx jest --runTestsByPath lib/parking/__tests__/streetMeterSmartCard.test.ts lib/parking/__tests__/pointAbQuickRead.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/parking/__tests__/streetMeterParking.test.ts app/components/__tests__/OptionComparisonCard.test.tsx --runInBand` → passed (72 tests).
- Regression: `pointAbCanonicalFlow`, `pointAbOptionScoring`, `pointAbLocalTripCleanup`, `parkAndRidePointAb`, `ResultsContentHookOrder`, `ParkingSmartPick` → passed (72 tests).
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- `streetMeterParking.verifyRequired` is effectively always true today, so street/meter is treated as uncertain whenever it is cheapest; that is intentional product behavior but means the hedged copy nearly always applies for street/meter winners.
- Needs visual verification in localhost/Vercel that the Brighton Jones / downtown Seattle Street / meter card now shows a short Cost note and that the full Seattle paid-hours paragraph appears in the parking-plan Details section.

**Next recommended step**
- Re-run the Brighton Jones / downtown Seattle general trip in the UI: confirm no card text overflow, the Cost tile shows `Verify signs`/`Check meter`, the quick read no longer says "cheapest around $0", and the long outlook renders under the Street parking note in Details.

### 2026-06-09 22:20 PDT — Google Places cache write flooding + unstable cache keys fixed

**Summary**
- Root cause of `cache_write_queue_depth { pendingWrites: 38 }` + repeated `cache_write_failed`/timeout spam on a downtown Seattle general-trip search: ParkWhiz/general-trip lot ids embed a request-specific UUID/option-id suffix (e.g. `destination-parkwhiz-parkwhiz-65141-<optionId>`), which fragmented the Google Places cache key per request, so the same lot enqueued dozens of distinct cache writes that each missed cache and timed out.
- Cache key now drops unstable UUID/request-specific ids and prefers a stable identity: clean numeric DB id, else `<provider>-<stableLocationId>` extracted from marketplace synthetic ids (e.g. `parkwhiz-65141`), else normalized name + address. The `name:`/`addr:` portions are byte-identical to the old format, so existing cached rows for non-synthetic-id lots still match (no migration miss storm). Airport (`SEA|…`) vs city (`UNKNOWN|…`) namespaces stay separate.
- Cache write queue now: (a) coalesces in-flight/pending writes by stable cacheKey so duplicates share one write; (b) is bounded by `GOOGLE_PLACES_CACHE_WRITE_MAX_PENDING` (default 50) and drops the lowest-priority pending write when full (coords/photos/reviews/fresh rank highest); (c) keeps writes best-effort/non-blocking; (d) replaces per-write `cache_write_queue_depth` and per-key `cache_write_failed` logs with a single throttled `cache_write_queue_pressure` summary (active/pending/dropped/coalesced/failed/timedOut).
- `resolveParkingGooglePlace` now coalesces concurrent identical lookups (cacheKey + lookup profile) in-flight, so a cache-read timeout cannot fan out into repeated DB reads/live calls for the same place during one search. Cache-read failures are aggregated into one throttled `cache_read_failures` summary instead of one warning per lot.
- Did not change recommendation scoring/ranking, did not increase Google API quota/call volume, and kept airport/city/event parking logic separate.

**Files changed**
- `lib/parking/googlePlaceMatchUtils.ts` (stable cache key + new `deriveStableParkingLotIdToken`)
- `lib/parking/googlePlacesCacheWrite.ts` (coalesce by key, bounded queue + low-priority drop, summarized pressure logging, priority helper, expanded test state)
- `lib/parking/googlePlacesCache.ts` (in-flight resolve dedup, throttled cache-read-failure logging, reset helper)
- `lib/parking/__tests__/googlePlacesCacheKeyStability.test.ts` (new)
- `__tests__/googlePlacesCacheWrite.test.ts` (coalesce / cap-drop / failure tests)
- `__tests__/googlePlacesCacheWriteIntegration.test.ts` (concurrent resolve dedup + single coalesced write)
- `AGENTS.md`

**Why**
- One results page should not enqueue dozens of duplicate Supabase cache writes or print a scary failure line per lot; the duplicate writes were caused by unstable cache keys plus an unbounded, non-deduped write queue.

**Tests run and result**
- `npx jest --runTestsByPath lib/parking/__tests__/googlePlacesCacheKeyStability.test.ts __tests__/googlePlacesCacheWrite.test.ts __tests__/googlePlacesCacheWriteIntegration.test.ts lib/parking/__tests__/googlePlaceMatchUtils.test.ts --runInBand` → 21 passed.
- Regression: `googlePlacesCacheQuota`, `googlePlacesQuotaEfficiency`, `googlePlaceReviewsGuard`, `googlePlacePhotoRoute`, `destinationSearch`, `destinationSearchCache`, `googleUsageSummary` → 50 passed.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- The cache key intentionally does NOT switch its primary identity to `googlePlaceId` (placeId is discovered mid-flow); place-id identity is still covered by the existing `getCachedRecordByPlaceId` fallback, so adding it to the primary key would fragment rows without reducing live calls. Documented as a deliberate decision.
- Coalescing is first-write-wins per cacheKey: if a coords-only write is already in flight and a reviews write for the same lot is coalesced away, reviews persist on the next request (still shown in-memory this request via the request cache). Acceptable best-effort behavior.
- Queue cap, coalescing, and failure/read summaries are in-memory per server process (beta guardrails, not distributed across Vercel instances).

**Next recommended step**
- Re-run the downtown Seattle general-trip search in localhost/Vercel and confirm logs now show a single throttled `cache_write_queue_pressure` summary (low/zero pending), no per-lot `cache_write_failed` spam, and stable repeated cache keys (no UUID suffixes) for ParkWhiz lots. Tune `GOOGLE_PLACES_CACHE_WRITE_MAX_PENDING` if needed.

### 2026-06-09 22:42 PDT — Repeated live SearchText for the same no-match lot eliminated (negative cache)

**Summary**
- Even with stable cache keys, logs still showed repeated `[google-places-live] { endpoint: 'searchText', route: 'searchGooglePlace', reason: 'place_match_search_legacy' }` for the same no-match lot (e.g. `[A653] 1727 Harvard Ave. Lot`) within one downtown general-trip run. Root cause: the legacy SearchText path in `searchGooglePlace` is not query-cached, and `resolveParkingGooglePlace` did not remember a no-match, so every repeat lookup for a miss lot re-hit Google.
- Added a short-lived, process-level **negative match cache** keyed by the stable lot cacheKey (`GOOGLE_PLACES_NEGATIVE_MATCH_TTL_MS`, default 60s). After a live search returns no match (and no cached metadata), the lot key is remembered; subsequent non-discovery lookups for that key short-circuit and return null before any DB read or live SearchText. The TTL keeps it short-lived, and a later successful match clears the entry, so it never permanently blocks a future match.
- Discovery/review lookups (`requireDiscovery: true`) intentionally bypass the negative cache (both check and set), so review matching is never blocked by a prior standard-path miss.
- Concurrent identical lookups already share one in-flight `resolveParkingGooglePlace` promise (cacheKey + lookup profile); added an `inFlightShares` counter and a throttled `[google-places-cache] place_search_dedupe_summary` diagnostic (`negativeCacheSkips`, `inFlightShares`, `negativeCacheEntries`).
- The legacy SearchText guard log now includes the stable `cacheKey` (was `cacheKey: null`), so diagnostics can prove dedupe is working.
- Did not undo the stable-key fix, did not change scoring/ranking, did not increase Google call volume (this strictly reduces it), kept airport/city/event logic separate (negative cache is namespaced by the airport/city cacheKey), and cache read/write failures remain non-blocking.

**Files changed**
- `lib/parking/googlePlacesCache.ts` (negative match cache + TTL, in-flight share counter, `place_search_dedupe_summary`, stable cacheKey in legacy search guard log, `getGooglePlacesSearchDedupeStatsForTests`, reset helper)
- `__tests__/googlePlacesNegativeSearchCache.test.ts` (new)
- `AGENTS.md`

**Why**
- One result-generation run should not make repeated live SearchText calls for the same lot, especially when the first attempt already missed/no-matched; the legacy search path had no per-lot memoization.

**Tests run and result**
- `npx jest --runTestsByPath __tests__/googlePlacesNegativeSearchCache.test.ts --runInBand` → 5 passed (same no-match hits Google once; concurrent in-flight shared; negative cache expires after TTL; airport success not negatively cached; city no-match does not block same-named airport lot).
- Regression: `googlePlacesQuotaEfficiency`, `googlePlacesCacheWrite`, `googlePlacesCacheWriteIntegration`, `googlePlaceReviewsGuard`, `googlePlacesGuard`, `googlePlacesCacheKeyStability`, `destinationSearch`, `googleUsageSummary` → 72 passed total.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Negative cache is in-memory per server process (beta guardrail, not distributed across Vercel instances); default TTL 60s, override with `GOOGLE_PLACES_NEGATIVE_MATCH_TTL_MS`.
- A lot that is genuinely matchable but missed due to a transient blocked/budget-exhausted search is also negatively cached for the TTL window; it self-heals after expiry and discovery lookups bypass it.

**Next recommended step**
- Re-run the downtown Seattle general-trip search and confirm `place_match_search_legacy` no longer repeats for the same lot, the live search log now carries a non-null `cacheKey`, and `place_search_dedupe_summary` shows non-zero `negativeCacheSkips`/`inFlightShares`.

### 2026-06-09 22:55 PDT — Admin parking submissions load fixed for validation reports

**Summary**
- Fixed `/admin/parking-submissions` loading 500 after public parking validation report submissions moved to server-side service-role inserts into `parking_validation_reports`.
- Root cause: the admin route only read/moderated `user_parking_spaces` through the direct Postgres pool, while the public report route now writes `parking_validation_reports` through the Supabase service-role client. Environments without working `DATABASE_URL`, or with reports in only the validation table, could fail the admin list path.
- Admin submissions API now uses the server-side Supabase service-role client, lists both `parking_validation_reports` and legacy `user_parking_spaces`, maps validation reports into the existing safe admin card shape, tolerates null optional fields, and returns `200 { parking: [] }` for empty filters.
- Admin moderation first updates `parking_validation_reports.status`, then falls back to legacy `user_parking_spaces` moderation. Invalid statuses still fail validation before DB access.
- Errors are logged server-side with a generic client response; service-role key remains server-only, public users/non-admins remain blocked, and public validation report submission behavior is unchanged.

**Files changed**
- `app/api/admin/parking-submissions/route.ts`
- `app/api/admin/parking-submissions/__tests__/route.test.ts`
- `__tests__/userParkingSpacesSecurity.test.ts`
- `AGENTS.md`

**Why**
- Admins need to view submitted parking validation reports without a 500, while keeping reads/updates admin-only and keeping public submission inserts server-side.

**Tests run and result**
- `npx jest --runTestsByPath app/api/admin/parking-submissions/__tests__/route.test.ts __tests__/parkingValidationReportRoute.test.ts --runInBand` passed, 11 tests.
- `npx jest --runTestsByPath app/api/admin/parking-submissions/__tests__/route.test.ts __tests__/parkingValidationReportRoute.test.ts __tests__/userParkingSpacesSecurity.test.ts lib/parking/__tests__/userParkingSpacesTypes.test.ts lib/admin/__tests__/adminAuth.test.ts --runInBand` passed, 38 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- `parking_validation_reports` currently stores only `status` for moderation; rejection/needs-more-info notes from the admin UI are preserved for legacy `user_parking_spaces` but not persisted on validation reports because that table has no `rejection_reason`/review note column.
- If both `parking_validation_reports` and `user_parking_spaces` service-role reads fail, the admin API returns a generic `500 list_failed` and logs the server-side error message.

**Next recommended step**
- Verify in production with an allowlisted admin account: submit a parking validation report, open `/admin/parking-submissions`, confirm the row appears, test empty filters, and verify non-admin access remains denied.

### 2026-06-09 23:15 PDT — Centralized provider outbound URL builder with affiliate attribution

**Summary**
- Added `lib/monetization/providerUrls.ts` as the shared outbound URL builder for ParkWhiz, APR/AirportParkingReservations, and SpotHero/marketplace links.
- Server-side parking option enrichment now appends configured affiliate/sub-id/UTM params to `sourceLink` without changing pricing provenance, scoring, or live/cached labels.
- `ParkingProviderActions` now finalizes outbound URLs at click time with opaque click-correlation sub-ids when configured, and records `affiliateAttached`, `targetHost`, `priceSource`, and `outboundClickId` in outbound analytics metadata.
- Provider-specific reserve/view labels are now honest: ParkWhiz live → `Reserve`, APR → `Check live price`, SpotHero generic → `Compare on SpotHero`.
- SpotHero generic URLs can safely upgrade to the existing `/search?search=` deep-link pattern when only airport-parking landing pages exist.
- Documented optional affiliate env vars in `.env.example`; missing env vars preserve original provider URLs.

**Files changed**
- `lib/monetization/providerUrls.ts` (new)
- `lib/monetization/__tests__/providerUrls.test.ts` (new)
- `lib/monetization/outboundClickTypes.ts`
- `lib/providers.ts`
- `lib/types.ts`
- `lib/analytics/sanitizeAnalytics.ts`
- `app/results/ParkingProviderActions.tsx`
- `app/results/ResultsContent.tsx`
- `.env.example`
- `AGENTS.md`

**Why**
- Outbound parking clicks were logged but provider URLs lacked consistent affiliate/referral/sub-id attribution, so clicks were not reliably monetizable.
- Affiliate IDs must stay env-configured server-side; URLs must not include raw origin addresses or secrets.

**Tests run and result**
- `npx jest --runTestsByPath lib/monetization/__tests__/providerUrls.test.ts lib/monetization/__tests__/parkingCtas.test.ts lib/monetization/__tests__/outboundClick.test.ts app/results/__tests__/ParkingProviderActions.test.tsx lib/analytics/__tests__/sanitizeAnalytics.test.ts __tests__/outboundClickRoute.test.ts --runInBand` passed, 25 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Affiliate/sub-id param names are not guessed; both `*_AFFILIATE_ID` and `*_AFFILIATE_PARAM` must be configured for provider-specific affiliate attachment.
- UTM params attach when affiliate params are attached or when `PODPAIGO_UTM_*` env vars are explicitly set.
- Click-correlation sub-ids append at click time only when a configured sub-id param name was exposed on the parking option from server enrichment.
- Needs live verification with real ParkWhiz/APR/SpotHero affiliate env values in Vercel to confirm partner attribution survives provider handoff and checkout.

**Next recommended step**
- Set `PARKWHIZ_AFFILIATE_ID`/`PARKWHIZ_AFFILIATE_PARAM` (and APR/SpotHero equivalents if available) in Vercel, run an airport and general-trip search, click Reserve/Compare, and confirm outbound URLs carry affiliate params while `/api/monetization/outbound-click` stores `affiliateAttached: true` with sanitized `targetHost`.

### 2026-06-09 23:45 PDT — Public beta polish for partner outreach (nav, pricing, README, disclosures)

**Summary**
- Cleaned public navbar: Admin remains admin-gated; desktop and mobile nav now share the same link set (Quick Go, Airports, How it works, Pricing, Roadmap, About) with a single primary CTA (`Plan trip`); mobile menu no longer duplicates Plan trip as a nav item.
- Rewrote `/pricing` as beta-friendly: free during beta, paid plans planned later, no billing active, honest live/estimated/cached pricing notes; removed Stripe/placeholder dev copy.
- Rewrote `README.md` for agents, developers, partners, and future repo context: product status, data sources, honesty rules, setup, testing checklist, deployment guardrails, and monetization status.
- Added shared public disclosure copy in `lib/marketing/publicCopy.ts` and surfaced it on home, pricing, and results footer.
- Polished About and How it works trust language (`public beta` instead of `early draft`).

**Files changed**
- `lib/marketing/publicCopy.ts` (new)
- `lib/marketing/__tests__/publicCopy.test.tsx` (new)
- `app/components/SiteHeader.tsx`
- `app/components/__tests__/SiteHeader.test.tsx`
- `app/pricing/page.tsx`
- `app/page.tsx`
- `app/about/page.tsx`
- `app/how-it-works/page.tsx`
- `app/results/ResultsContent.tsx`
- `README.md`
- `AGENTS.md`

**Why**
- Public app needed partner-demo-safe marketing copy and nav before parking provider outreach; dev-facing Stripe/placeholder language undermined trust.

**Tests run and result**
- `npx jest --runTestsByPath lib/marketing/__tests__/publicCopy.test.tsx app/components/__tests__/SiteHeader.test.tsx --runInBand` passed, 9 tests.
- `npm run build` passed.
- `git diff --check` passed.
- README changes validated by review; no separate README test file added.

**Known remaining issues**
- Results page header CTA intentionally remains `New trip` on `/results` while the global default CTA is `Plan trip`.
- Home hero still uses `Plan a trip` button label on the landing page; global header CTA is `Plan trip`.
- Roadmap and privacy pages were not rewritten in this pass.

**Next recommended step**
- Do a quick visual pass on mobile nav + pricing + results footer in localhost, then use the README testing checklist before the first partner outreach email or demo.

### 2026-06-09 23:10 PDT — About page name origin story added

**Summary**
- Added a short `Why PodPaiGo?` section to the About page explaining the Thai-English origin of the name from `ปลอดภัย Go`, meaning `go safely`.
- Kept the tone personal but professional, and left the existing public-beta/data-transparency language intact.

**Files changed**
- `app/about/page.tsx`
- `AGENTS.md`

**Why**
- The public About page needed a concise, partner-safe origin story that explains the name without sounding gimmicky and better reflects the product mission.

**Tests run and result**
- No dedicated test added; this was a copy-only About page change and the page did not already have targeted tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- The About page still uses static copy only; there is no shared About-specific content module yet.

**Next recommended step**
- Do a quick visual review of the About page in localhost to confirm the Thai text renders cleanly and the new section spacing feels balanced on mobile and desktop.

### 2026-06-10 — Ask PodPaiGo multi-intent, event venue, lodging origin, and driving preferences

**Summary**
- Reworked Ask PodPaiGo / AI Trip Planner from a single-trip parser into a multi-intent trip assistant. A free-text message is now segmented into one or more structured `TripIntent`s; each wraps the existing `ParsedTripAssistantResult` so it still flows through the existing conversation, review, and search-params machinery.
- Travel-context awareness: "staying at the Bellagio … in vegas" now sets the trip origin to the lodging (`Bellagio Hotel & Casino, Las Vegas`, origin source manual) instead of defaulting to home/current location, so the assistant no longer asks "starting near Monroe?" for a Vegas trip.
- Event/stadium inference: team + city resolves a concrete venue (e.g. Seahawks @ Las Vegas / "raiders stadium" → Allegiant Stadium), sets `destinationKind: 'event'`, attaches `eventContext`, asks for the game time as a soft slot (satisfiable by a cautious "arrive ~90 min early" default — never invents a real game time), and routes search params as an event venue (no destination/customer parking; street/meter only as trailing fallback in compare modes).
- Carpool/HOV/Express Pass/toll-lane preferences are extracted into structured `drivingPreferences`. HOV eligibility is never asserted as fact: `hovLaneEligible` is only `yes` when a 2+ occupancy is stated, otherwise `unknown`, and copy/assumptions tell the user to confirm posted lane rules. When carpool/HOV/Express Pass intent is present without an occupancy, the assistant asks "How many people will be in the car?" as the next best detail (soft `passengerCount` slot). Preferences map onto the existing additive drive-route URL params (`avoidTolls`, `hasTollPass`, `hovEligible`, `vehicleOccupancy`, `showExpressLaneNotes`) without touching scoring/ranking.
- Multi-intent UX: when several trips are detected, the assistant shows trip cards + "Plan …" buttons ("Plan SEA trip", "Plan <city> stadium trip"), keeps the others available, and does not merge them. Correction recovery: the reject/"No" origin flow now offers the origin recovered from the original message ("Use Bellagio …") instead of a blank address box.
- Existing single-trip airport, event, and normal point-A-to-B flows are unchanged; the multi-intent layer is additive and enrichment runs on top of either the mock or OpenAI parse.

**Files changed**
- New: `lib/ai/tripIntentTypes.ts`, `lib/ai/tripIntents.ts`, `lib/ai/eventVenueInference.ts`, `lib/ai/drivingPreferences.ts`, `lib/ai/lodgingContext.ts`.
- New tests: `lib/ai/__tests__/tripIntents.test.ts`, `lib/ai/__tests__/eventVenueInference.test.ts`, `lib/ai/__tests__/drivingPreferences.test.ts`, `lib/ai/__tests__/multiIntentConversation.test.ts`.
- Modified: `lib/ai/tripParseTypes.ts` (DrivingPreferences/EventContext types + optional `tripCity`/`drivingPreferences`/`eventContext` fields), `lib/ai/tripPlanningConversation.ts` (event-aware acknowledgment/game-time question, `passengerCount` question, `eventTime`/`passengerCount` priority slots, `buildMultiIntentTurn`, `select_intent` action, `TripPlanningIntentCard`, suggested-origin recovery), `lib/ai/normalizeParsedTrip.ts` (soft event/passenger slots + new-field passthrough), `lib/ai/parsedTripToSearchParams.ts` (event params + additive drive-route params), `lib/ai/openaiTripParser.ts` (prompt hints only, no schema change), `app/api/ai/parse-trip/route.ts` (returns `intents`/`originalText`/`primaryIntentId`), `app/components/TripAssistantChat.tsx` (intent cards), `app/components/PodPaiGoAssistant.tsx` and `app/components/TripAssistantPanel.tsx` (extracted-intents state, multi-intent turn, select handling, suggested origin).

**Why**
- Ask PodPaiGo previously collapsed multi-need messages into one route, defaulted Vegas-lodging trips to the home origin (Monroe), did not infer stadium venues, and had no structured carpool/HOV/toll handling. Goal: an all-in-one trip decision assistant that splits intents, respects travel context, treats events under event-parking rules, and is honest about HOV/toll eligibility.

**Tests run and result**
- `npx jest --runTestsByPath lib/ai/__tests__/tripIntents.test.ts lib/ai/__tests__/eventVenueInference.test.ts lib/ai/__tests__/drivingPreferences.test.ts lib/ai/__tests__/multiIntentConversation.test.ts --runInBand` → 39 passed (scenarios A–H).
- `npx jest --runTestsByPath app/components/__tests__/PodPaiGoAssistant.test.tsx app/components/__tests__/TripAssistantConfirm.test.tsx lib/ai/__tests__/tripPlanningConversation.test.ts --runInBand` → 50 passed.
- Regression sweep `npx jest lib/ai lib/trip/__tests__/quickGo lib/trip/__tests__/searchParams app/components/__tests__/PodPaiGoAssistant app/components/__tests__/TripAssistantConfirm` → 250 passed, 1 failed. The single failure is the pre-existing `lib/ai/__tests__/liveAiSafety.test.ts` `/pricing` copy assertion ("Future Pro" / "Stripe subscriptions are not enabled yet"); it fails with these changes stashed too (the pricing page copy was rewritten in an earlier commit) and is unrelated to this work.
- `npm run build` → compiled successfully. `git diff --check` → clean. `npx tsc --noEmit` → no type errors in touched source files (only pre-existing test-file type errors elsewhere).

**Known remaining issues**
- The pre-existing `liveAiSafety.test.ts` pricing-copy assertions are stale and should be updated to match the rewritten `/pricing` page (separate from this change).
- Event game time is a cautious soft slot; if the user does not provide a real time, routing uses a placeholder departure time with event buffers/warnings rather than a real schedule (we intentionally do not fetch or invent game times).
- The team/venue knowledge base in `eventVenueInference.ts` is a curated list (Seahawks, Raiders, Mariners, Kraken, Bears, Giants, Rams/Chargers, 49ers, Cowboys, Broncos, Cardinals, plus venue-name detection); unknown teams fall back to keeping the user's destination text while still treating the trip as event-sensitive.
- Multi-segment messages re-parse extra segments with the deterministic mock parser (free, no provider call); only the single-segment case reuses a configured live (OpenAI) parse.

**Next recommended step**
- Visually verify in localhost with a signed-in account: (1) the Vegas event example shows Bellagio → Allegiant Stadium and asks game time (not Monroe); (2) the multi-intent SeaTac + Vegas example shows two trip cards with distinct Plan buttons; (3) the carpool/Express Pass SeaTac example asks passenger count and shows the "Confirm HOV/toll rules" caveat; then confirm an event trip's results page applies event-parking rules and a carpool trip carries the drive-route params.

### 2026-06-10 — Fixed stale pricing-copy test after beta pricing rewrite

**Summary**
- Updated the stale `pricing page` assertion in `lib/ai/__tests__/liveAiSafety.test.ts` that still expected the pre-rewrite wording (`Future Pro`, `Stripe subscriptions are not enabled yet`).
- The `/pricing` page was earlier rewritten to be beta-friendly (free during beta, a separate "Planned later" paid section, no active billing) and no longer contains the old Stripe/Future Pro strings.
- The test now asserts on stable strings that literally appear in the rewritten `app/pricing/page.tsx` source and capture the same intent: `Free`, `Planned later`, and `no subscriptions active`. Renamed the test to "renders free beta and planned-later sections with no active billing".
- No product code changed — the page already communicates the free + planned-later + no-active-billing message; this was purely a stale-test fix.

**Files changed**
- `lib/ai/__tests__/liveAiSafety.test.ts`

**Why**
- The pricing page rewrite left this assertion checking removed copy, so the suite reported a false failure unrelated to any product regression.

**Tests run and result**
- `npx jest --runTestsByPath lib/ai/__tests__/liveAiSafety.test.ts --runInBand` → 7 passed.
- `npm run build` → compiled successfully.
- `git diff --check` → clean.

**Known remaining issues**
- None for this change. The pricing page copy lives in `app/pricing/page.tsx` plus `lib/marketing/publicCopy.ts`; the test only reads the page source, so it intentionally asserts on literal in-page strings rather than the imported marketing constants.

**Next recommended step**
- If the pricing page copy is reworded again, update these literal assertions (or move pricing-copy verification to a rendered-component test) so they stay in sync.

### 2026-06-10 09:54 PDT — Parking map modal mobile fallback and loader hardening

**Summary**
- Hardened the parking map modal against missing/invalid `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, Google Maps script load failures, and Google auth/referrer failures.
- The modal now waits for a visible paint frame before initializing, resizes/recenters after mount, and uses a stable mobile map height.
- Added a friendly fallback state: `Map could not load. Open in Google Maps instead.` with a primary Google Maps link plus per-lot open links using destination/lot coordinates or address.
- Added production-safe, once-per-reason diagnostics without logging API keys or script URLs.
- Documented the Vercel public browser key name, Maps JavaScript API requirement, and required production/localhost HTTP referrers in `.env.example`.
- Did not change recommendation scoring/ranking or mix airport, city, and event parking logic.

**Files changed**
- `app/results/ParkingLotsMap.tsx`
- `lib/googleMapsLoader.ts`
- `app/results/__tests__/ParkingLotsMap.test.tsx`
- `lib/__tests__/googleMapsLoader.test.ts`
- `.env.example`
- `AGENTS.md`

**Why**
- Production mobile could show the Google Maps "Oops! Something went wrong" auth/referrer overlay inside the parking map modal, leaving users with no useful map action.
- The UI needed to fail gracefully when the public browser key, Maps JavaScript API, or allowed referrer configuration is missing or wrong.

**Tests run and result**
- `npm test -- --runTestsByPath app/results/__tests__/ParkingLotsMap.test.tsx lib/__tests__/googleMapsLoader.test.ts --runInBand` passed, 8 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ResultsContentHookOrder.test.tsx lib/parking/__tests__/pointAbRanking.test.ts lib/providers/parking/providers/googlePlaces/__tests__/destinationSearch.test.ts lib/__tests__/providersParkingAirport.test.ts --runInBand` passed, 92 tests. Jest still printed the existing open-handle warning after this provider-heavy set.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- Production still needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configured in Vercel with Maps JavaScript API enabled and HTTP referrers including `https://podpaigo.com/*` and `https://www.podpaigo.com/*`; otherwise the fallback will show by design.
- No live mobile browser verification against `podpaigo.com` was run in this local environment.

**Next recommended step**
- Set/verify the Vercel public browser key and referrer restrictions, redeploy, then open a production results page on a phone and confirm the parking map renders; temporarily break the key/referrer in preview to confirm the fallback CTA appears.

---

# Final Response Requirement for Agents

Before responding to the user, the agent must confirm one of these:

- `AGENTS.md updated with this change.`
- `AGENTS.md did not need an update because no code/project state changed.`
- `AGENTS.md could not be updated; copy-paste changelog entry provided below.`

If code changed and none of the above is true, the task is incomplete.
