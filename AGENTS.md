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

---

# Final Response Requirement for Agents

Before responding to the user, the agent must confirm one of these:

- `AGENTS.md updated with this change.`
- `AGENTS.md did not need an update because no code/project state changed.`
- `AGENTS.md could not be updated; copy-paste changelog entry provided below.`

If code changed and none of the above is true, the task is incomplete.
