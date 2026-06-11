Read AGENTS.md first and follow it exactly.

Task:
Refresh only the generated/current-state portion of AGENTS.md.

Rules:
- Do not delete or rewrite Event Parking Rules.
- Do not delete or rewrite Mandatory Change Memory Rule.
- Do not delete or rewrite Required End-of-Task Format.
- Do not delete Recent Change Log history.
- Only update the section between:
  <!-- AGENT_STATE_START -->
  and
  <!-- AGENT_STATE_END -->
- If those markers do not exist, add them around the Current PodPaiGo State section.
- Summarize current product focus, active priorities, current known issues, and beta validation checklist based on the most recent changelog entries.
- Remove stale “active” issues that recent changelog entries show were fixed.
- Keep it concise and operational for future agents.

After updating:
- Append a short Recent Change Log entry saying AGENTS.md current-state summary was refreshed.
- Run git diff --check.
- Final response must include: AGENTS.md updated with this change.

<!-- AGENT_STATE_START -->
# Current PodPaiGo State

**Product focus**
- Beta trip-planning results experience for airport, point A→B/city, and Quick Go trips, prioritizing fast scanning: one concise recommended answer, honest price/time caveats, and compact Compare options rows where full details are needed.

**Active priorities**
- Route-mode timing must stay honest and source-aware: rideshare is a car ride and must never look faster than the main origin→destination drive route. A distance-band fallback (e.g. an airport band applied to a long intercity trip) is re-based on the known main drive time plus pickup wait, and shows "Open app for live estimate" / no concrete duration when no reliable drive route exists. Rideshare timing reconciliation happens once at the engine level so Compare options, Quick Go Best Way, option scoring, and Full Trip Details tell the same timing story. Never fake a precise duration when the underlying route leg is missing, stale, estimated-only, or impossible.
- Results-page UX clarity: "Recommended" hero should read as a direct answer (title, inline metrics, why line, primary CTA), not a dashboard of boxed tiles.
- Compare options should scan like a compact table/scoreboard with fixed desktop columns: Option, Status, Cost, Time, Note, Action.
- Each compare row should expose one quiet action only: available rows use View, unavailable rows use Why?; no duplicate Details controls and no row-level pro/con mini expanders.
- Quick Go Best Way must use practical total origin-to-destination timing: estimated/fallback intercity transit and local Park & Ride corridor estimates must not win over known drive/rideshare unless the user explicitly selected transit-only.
- Quick Go best-way picks should still honor materially faster verified local transit/rideshare, preserve concrete parking labels when a parking option wins, and use synthetic "Drive" for free/customer-parking or impractical-transit trips.
- Public filter UI should stay visible, user-facing, and compact; keep technical filter/evidence language out of the main results page.
- Keep pros/cons, timing breakdowns, and evidence in lower Details sections/expanders; compact rows should not read as report cards.
- Preserve pricing honesty everywhere: live / estimated / official rate range / check provider / open app / check route must remain explicit.
- Keep airport parking, city/general parking, and event/stadium parking logic separate; never fake or mislabel live prices.
- Public/non-admin surfaces must stay free of debug/env diagnostics (debug UI gate is admin AND debug flag).

**Current known issues**
- Rideshare long-distance timing fix (re-base on main drive route; never faster than driving; suppress fake duration for unconfirmed distance-band fallbacks) is covered by rideshare estimate, mode-timing, and point A→B ranking unit tests plus the production build; no live Bend route/browser validation was run.
- Recent visual changes (admin outreach preview wrapping, results recalculating loader, concise Recommended hero, fixed-column vertically centered Compare options scoreboard rows, simplified parking filters) are verified by DOM/class tests and production build only; no live browser/mobile screenshot pass yet.
- Quick Go Bend/intercity transit suppression is covered by resolver, Quick Go view, Park & Ride, and point A→B ranking tests; no live Bend route/browser validation was run for the latest resolver guard.
- Parking lot list cards below the hero are still fairly dense; future passes can move more per-lot details behind expanders.
- Pre-existing unit failures unrelated to timing remain in OptionComparisonCard layout (parkAndRidePointAb), TripRecalculatingLoader reduced-motion, inventory provider airport scoping, and parking route live-limit suites; they fail identically on a clean tree.

**Beta validation checklist**
- Long-distance point A→B (e.g. Monroe/Seattle-area → Bend, OR): rideshare time equals the main drive route plus pickup wait (not a ~1h 17m distance-band estimate), drive / drive+park stay the timed routes, transit stays "Check route", paid garage/lot reads as the full trip chain with an `est.` label (never a 12-min local leg), and Park & Ride shows an "Unavailable" badge with "Not estimated" time when not confirmed; the same timing appears in the Recommended hero, Compare options, and Full Trip Details.
- Local point A→B: rideshare may legitimately read slightly slower than the raw drive (drive route + pickup), can still win on convenience, and verified faster transit/rideshare is preserved.
- Quick Go results: free/customer parking still recommends Drive when appropriate, concrete parking winners show `Drive + park · [lot]`, materially faster verified local rideshare/transit options are not overwritten by generic Drive, transit-only stays honored, Bend-style estimated intercity transit does not appear as a 1h Best Way, and a distance-band rideshare estimate does not win Best Way as faster than driving.
- General/city Park & Ride: local corridor estimates remain usable for valid metro trips, but intercity destinations outside the corridor show Park & Ride not confirmed / no transit to destination and cannot win Best Way.
- Non-admin SEA airport results: no env/config diagnostic text; options render normally.
- /admin/outreach desktop + mobile: long preview wraps inside the card with internal scrolling only.
- Results Recalculate: loader animation smooth in light/dark; reduced-motion shows a static, readable state.
- Airport + city results: Recommended hero shows title, inline cost/time/confidence metrics, why line, primary CTA, and Compare options scroll.
- Compare options: airport and city rows align to the same fixed desktop columns as the header, desktop cells are vertically centered, selected option is highlighted without becoming huge, each row has only one quiet action (View or Why?), row hover/pointer affordance is present, no compact-row Details/pro-con mini box appears, and long notes/cost notes clamp without overflow.
- Parking filters: public results show a visible compact "Filter parking" section with feature chips, user-facing helper copy, and no developer terms like inferred claims / provider-claimed / strict filters.
- Honesty checks: rideshare without live quote says Open app for live price; transit/Park & Ride unconfirmed states remain explicit; official airport price ranges read as estimates with daily-rate basis and confirm-with-airport caveat.
<!-- AGENT_STATE_END -->

# Recent Change Log

### 2026-06-10 19:10 PDT — Results SEA curated access diagnostic hidden from non-admin users

**Summary**
- Tightened the ResultsContent internal debug UI gate from admin OR debug flag to admin AND debug flag.
- The SEA curated access diagnostic, including `SEA_CURATED_ACCESS` and `.env.local` setup language, no longer appears for normal/non-admin results users even if a public debug env flag is enabled.
- The diagnostic remains available for allowlisted admins when debug/admin diagnostics are intentionally enabled.
- Added focused ResultsContent tests for non-admin hidden behavior and admin-debug visible behavior.

**Files changed**
- `app/results/ResultsContent.tsx`
- `app/results/__tests__/ResultsContentHookOrder.test.tsx`
- `AGENTS.md`

**Why**
- Developer setup diagnostics were visible on the normal user-facing results page and made missing curated SEA access options look broken.
- Non-admin beta users should see normal available options or simple fallbacks, not env/config instructions.

**Tests run and result**
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/results/__tests__/ParkingSmartPick.test.tsx lib/utils/__tests__/debug.test.ts --runInBand` passed, 49 tests.
- `npm test -- --runTestsByPath __tests__/parkAndRideAccess.test.ts lib/access/__tests__/seaCurated.test.ts lib/access/__tests__/recommendationAccessStrategies.test.ts --runInBand` passed, 16 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- AGENTS.md had already been replaced in the working tree with a prior AGENTS-maintenance instruction block before this changelog update; this task did not restore or rewrite that unrelated change.

**Next recommended step**
- Verify a normal SEA airport results page in localhost/Vercel with a non-admin beta user and confirm no env/config diagnostic text appears while results options still render normally.

### 2026-06-10 19:16 PDT — Admin outreach preview wrapping fixed

**Summary**
- Updated `/admin/outreach` layout so the composer and preview stack on narrower screens and only split into two columns on extra-wide screens.
- Added `min-w-0` shrink behavior to the composer and preview cards.
- Made the plain-text preview wrap with `whitespace-pre-wrap`, `break-words`, and `overflow-wrap:anywhere`, with a stable `max-h-[36rem]` and internal scrolling.
- Made metadata rows break long email addresses/subjects safely.
- Increased the body textarea editing area and kept it resizable.
- Added a focused component test for long preview text wrapping classes and helper-copy rendering.

**Files changed**
- `app/admin/outreach/page.tsx`
- `app/admin/outreach/__tests__/page.test.tsx`
- `AGENTS.md`

**Why**
- Long outreach email body text and URLs could overflow the preview card, making the admin composer look broken and causing the preview area to visually collide with the test-send helper copy.

**Tests run and result**
- `npm test -- --runTestsByPath app/admin/outreach/__tests__/page.test.tsx app/admin/__tests__/AdminNav.test.tsx --runInBand` passed, 4 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- No browser screenshot/manual visual verification was run; coverage is DOM/class-based plus production build.

**Next recommended step**
- Open `/admin/outreach` on desktop and mobile widths and confirm a long partner template preview wraps inside the preview card with internal vertical scrolling only.

### 2026-06-10 20:00 PDT — Results recommended-plan hero and price-copy clarity pass

**Summary**
- Renamed the results hero badge from `Smart recommendation` to `Recommended plan` and added a recommended-plan summary strip under the title: Cost, Time, Confidence, and Main caveat tiles, a short `Why this won:` line (top pros of the winning mode), a primary action button (existing per-mode action), and a `Compare options` button that scrolls to the mode comparison grid (`#compare-options-grid`, now labeled with a small "Compare options" heading).
- The summary strip only renders when the selected mode row exists, is not hidden by preference, and is not unavailable; it reuses existing ranking output and changes no scoring/recommendation logic.
- Clarified official airport parking price ranges in `formatParkingPriceLine`: an official price *range* now reads `Estimated $X–$Y total` with an `Official rate range` badge and a secondary line `Based on ~$A–$B/day × N days. Final price depends on the garage and rate you choose. Confirm with the airport.` (non-airport official sources say "Confirm on the official site."). Exact official totals still read `Official $X total`.
- All price secondary lines now read `Based on $A/day × N days` instead of the ambiguous `$A/day for N days`; estimated/provider-final lines keep the `Provider controls final price.` suffix.
- Clearer unconfirmed states on airport mode cards: transit shows `Transit route not confirmed` when no reliable transit route exists, and Park & Ride shows `Park & Ride not confirmed for this trip` when no validated lot/route exists (overnight copy unchanged); badge/verdict mapping untouched.
- Collapsed the ParkingSmartPick `Booking helper` check-in/check-out block into a `<details>` expander (`Booking helper · check-in & check-out times`) to reduce default card density; Copy times and all content preserved inside.
- Rideshare (`Open app for live price`), ParkWhiz live, APR cached/from, SpotHero compare labeling, and the parking-lots-map fallback were audited and confirmed already honest; no logic changes there.
- Refreshed the AGENTS.md current-state summary inside new `<!-- AGENT_STATE_START --> / <!-- AGENT_STATE_END -->` markers (see separate entry below).

**Files changed**
- `app/results/ResultsContent.tsx`
- `app/results/ParkingSmartPick.tsx`
- `lib/access/pricingLadder.ts`
- `__tests__/parkingPriceDisplay.test.ts`
- `app/results/__tests__/ResultsContentHookOrder.test.tsx`
- `app/results/__tests__/ParkingSmartPick.test.tsx`
- `AGENTS.md`

**Why**
- First-time users could not answer "what is the plan, why, what does it cost, how long, what next, what is uncertain" within seconds: the hero gave only a title and one sentence before dumping 4–6 dense mode cards, and `Official $36–$84 total` / `~$12–$28/day for 3 days` read as contradictory prices instead of an explained estimate.

**Tests run and result**
- `npm test -- --runTestsByPath __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts app/results/__tests__/ParkingSmartPick.test.tsx --runInBand` passed, 34 tests (includes new official-range explanation test and new booking-helper collapsed test).
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx app/results/__tests__/ParkingLotsMap.test.tsx app/components/__tests__/OptionComparisonCard.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx --runInBand` passed, 60 tests (includes new airport recommended-plan hero test; map fallback, rideshare open-app, and provider label tests still green).
- `npm test -- --runTestsByPath lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts __tests__/parkAndRideAccess.test.ts` passed, 53 tests (street/meter uncertainty, event/stadium hero, long-distance, and Park & Ride honesty unchanged).
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- No live browser/mobile screenshot verification of the new hero strip; coverage is DOM/copy-based plus production build.
- Parking lot list cards below the hero are still fairly dense; a future pass could move more per-lot fields behind expanders like the Smart Pick card already does.

**Next recommended step**
- Open an SEA airport result and a city point A→B result on mobile width and confirm the Recommended plan strip reads in ~10 seconds, the primary CTA and Compare options scroll work, and the official garage estimate copy reads clearly in light/dark mode.

### 2026-06-10 20:00 PDT — AGENTS.md current-state summary refreshed

**Summary**
- Added `<!-- AGENT_STATE_START --> / <!-- AGENT_STATE_END -->` markers with a new Current PodPaiGo State section (product focus, active priorities, current known issues, beta validation checklist) summarized from the most recent changelog entries; no changelog history was deleted.

### 2026-06-10 20:17 PDT — Compact compare options rows

**Summary**
- Reworked airport and point A→B Compare options from tall report cards into compact row-style cards with mode pictograms, status badges, cost, time, one caveat, and small CTAs.
- Moved default pros/cons and timing breakdowns behind Details for compact rows while keeping external details links for point A→B mode sections.
- Reused the shared comparison component for airport and city/general results; scoring, ranking, provider pricing, airport/city/event separation, and unavailable-state logic were not changed.
- Refreshed the AGENTS.md current-state summary for the compact comparison pass.

**Files changed**
- `app/components/OptionComparisonCard.tsx`
- `app/components/__tests__/OptionComparisonCard.test.tsx`
- `app/results/ResultsContent.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/components/__tests__/OptionComparisonCard.test.tsx --runInBand` passed, 14 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts --runInBand` passed, 89 tests.
- `npm run build` passed.

### 2026-06-10 20:26 PDT — Compact compare options layout polished

**Summary**
- Tuned the compact option card into a cleaner responsive row: icon, title/badge/subtitle/stats in the content column, with primary and Details/unavailable actions in a dedicated right-side desktop action column.
- Standardized compact stat labels to Cost, Time, and Caveat; long caveats and notes clamp/wrap without horizontal overflow.
- Kept unavailable and hidden cards dimmed/readable, selected rows highlighted, and pros/cons/timing details hidden until Details.
- Refreshed the AGENTS.md current-state summary for the compact layout polish.

**Files changed**
- `app/components/OptionComparisonCard.tsx`
- `app/components/__tests__/OptionComparisonCard.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/components/__tests__/OptionComparisonCard.test.tsx --runInBand` passed, 15 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts --runInBand` passed, 89 tests.
- `npm run build` passed.

### 2026-06-10 20:33 PDT — Results compare options simplified into scoreboard rows

**Summary**
- Simplified the Recommended plan hero from four boxed metric tiles into a concise answer: Recommended title, inline cost/time/confidence metrics, one why line, and primary/Compare options CTAs.
- Converted Compare options rows toward a scoreboard/table pattern with column header context, compact icon/option/status/cost/time/note/action cells, and one quiet action per row instead of large per-option blue CTAs.
- Reduced the overnight Park & Ride warning box into a smaller note while preserving the expandable explanation when requested.
- Preserved scoring, ranking, provider pricing, route logic, airport/city/event separation, unavailable states, and price-honesty copy.
- Refreshed the AGENTS.md current-state summary for the scoreboard compare-options pass.

**Files changed**
- `app/components/OptionComparisonCard.tsx`
- `app/components/__tests__/OptionComparisonCard.test.tsx`
- `app/results/ResultsContent.tsx`
- `app/results/__tests__/ResultsContentHookOrder.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/components/__tests__/OptionComparisonCard.test.tsx app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts --runInBand` passed, 104 tests.
- `npm test -- --runTestsByPath __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx --runInBand` passed, 39 tests.
- `npm run build` passed.

### 2026-06-10 20:47 PDT — Compare options fixed-column alignment polished

**Summary**
- Added a shared desktop grid template for Compare options rows and headers so Option, Status, Cost, Time, Note, and Action columns align consistently.
- Moved the icon into the Option cell, kept status/cost/time/note/action in fixed-width controlled columns, and added tabular number styling to cost/time cells.
- Normalized row actions to one control: available rows show `View`, unavailable rows show `Why?`; duplicate `Details` controls were removed while detail targets remain accessible through the single action.
- Preserved scoring, ranking, provider pricing, route logic, airport/city/event separation, unavailable states, and price-honesty copy.
- Refreshed the AGENTS.md current-state summary for the fixed-column alignment pass.

**Files changed**
- `app/components/OptionComparisonCard.tsx`
- `app/components/__tests__/OptionComparisonCard.test.tsx`
- `app/results/ResultsContent.tsx`
- `app/results/__tests__/ResultsContentHookOrder.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/components/__tests__/OptionComparisonCard.test.tsx app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts --runInBand` passed, 104 tests.
- `npm test -- --runTestsByPath __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx --runInBand` passed, 39 tests.
- `npm run build` passed.

### 2026-06-10 20:51 PDT — Compare options row vertical centering polished

**Summary**
- Added desktop-only vertical centering to Compare options row cells so option icon/text, status badge, cost, time, note, and action controls align to the row middle.
- Kept mobile stacked layout readable by limiting the stronger centering to the desktop breakpoint.
- Preserved selected/winning highlight, unavailable dimming, single-action row behavior, and all scoring/pricing/routing logic.
- Refreshed the AGENTS.md current-state summary for the vertical alignment pass.

**Files changed**
- `app/components/OptionComparisonCard.tsx`
- `app/components/__tests__/OptionComparisonCard.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/components/__tests__/OptionComparisonCard.test.tsx --runInBand` passed, 15 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx --runInBand` passed, 128 tests.
- `npm run build` passed.

### 2026-06-10 20:55 PDT — Parking filters copy simplified

**Summary**
- Replaced the technical public `Parking filters` copy with a compact `Filter parking` control.
- Made parking feature filters collapsed by default when no filters are active, while keeping active saved filters visible.
- Replaced developer-facing explanation with `Some features may need confirmation with the provider.`
- Preserved parking filter logic, provider/scoring/ranking behavior, airport/city/event separation, and pricing.
- Refreshed the AGENTS.md current-state summary for the filter-copy cleanup.

**Files changed**
- `app/components/TravelPreferencesPanel.tsx`
- `app/results/__tests__/ResultsContentHookOrder.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx --runInBand` passed, 34 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/OptionComparisonCard.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts lib/parking/__tests__/parkingFilters.test.ts app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx --runInBand` passed, 148 tests.
- `npm run build` passed.

### 2026-06-10 21:00 PDT — Compare options row interactions simplified

**Summary**
- Removed the separate compact-row `Details` button and inline pro/con/timing mini expander from Compare options rows.
- Kept one visible row action only: available rows show `View`, unavailable/not-confirmed rows show `Why?`, with detail-section targets still used for scrolling/focus behavior.
- Added row hover/pointer affordance while preserving selected-row highlighting, unavailable dimming, fixed-column alignment, price/source honesty, and airport/city/event behavior.
- Refreshed the AGENTS.md current-state summary for the one-action compare-row cleanup.

**Files changed**
- `app/components/OptionComparisonCard.tsx`
- `app/components/__tests__/OptionComparisonCard.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/components/__tests__/OptionComparisonCard.test.tsx --runInBand` passed, 15 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts lib/parking/__tests__/parkingFilters.test.ts app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx --runInBand` passed, 133 tests.
- `npm run build` passed.

### 2026-06-10 21:03 PDT — Parking filters kept visible with simpler copy

**Summary**
- Changed the public Parking filters UI back from a collapsible disclosure to an always-visible compact section.
- Kept all feature chips visible and replaced the helper with `Narrow lots by features. Always confirm details with the provider.`
- Reduced visual weight with compact padding, smaller helper text, and tighter chip spacing.
- Preserved existing filter behavior, provider/scoring/ranking logic, airport/city/event separation, pricing, and backend behavior.
- Refreshed the AGENTS.md current-state summary for the visible filter cleanup.

**Files changed**
- `app/components/TravelPreferencesPanel.tsx`
- `app/results/__tests__/ResultsContentHookOrder.test.tsx`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx lib/parking/__tests__/parkingFilters.test.ts --runInBand` passed, 39 tests.
- `npm test -- --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/components/__tests__/OptionComparisonCard.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx __tests__/parkAndRideAccess.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/__tests__/RecommendationStatus.test.ts __tests__/parkingPriceDisplay.test.ts lib/access/__tests__/pricingLadder.test.ts lib/parking/__tests__/priceDisplay.test.ts lib/parking/__tests__/parkingTrustCleanup.test.ts lib/parking/__tests__/parkingFilters.test.ts app/results/__tests__/ParkingSmartPick.test.tsx app/results/__tests__/ProviderPricingCards.test.tsx --runInBand` passed, 148 tests.
- `npm run build` passed.

### 2026-06-10 21:16 PDT — Quick Go smart recommendation pick fixed

**Summary**
- Updated Quick Go best-way resolution so a materially faster ranked smart option is not overwritten by generic Drive.
- Preserved concrete parking labels when a parking smart pick wins, while keeping synthetic Drive for free/customer-parking trips without a stronger ranked option.
- AGENTS.md current-state summary was refreshed.

**Files changed**
- `lib/trip/quickGo.ts`
- `lib/trip/__tests__/quickGo.test.ts`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath lib/trip/__tests__/quickGo.test.ts --runInBand` passed, 36 tests.
- `npm test -- --runTestsByPath app/components/__tests__/QuickGoResultsView.test.tsx --runInBand` passed, 25 tests.
- `git diff --check` passed.

### 2026-06-10 21:27 PDT — Quick Go intercity transit Best Way guard

**Summary**
- Quick Go Best Way now applies the existing transit-practicality guard before trusting a ranked transit option.
- Estimated/fallback intercity transit, such as Monroe/Seattle-area origin to Bend, OR with a suspicious short transit duration, is filtered out of default Best Way and falls back to Drive when a drive time is known.
- Verified local transit can still win when it is genuinely faster, and transit-only preference still honors transit.
- AGENTS.md current-state summary was refreshed.

**Files changed**
- `lib/trip/quickGo.ts`
- `lib/trip/__tests__/quickGo.test.ts`
- `AGENTS.md`

**Tests run and result**
- `npm test -- --runTestsByPath lib/trip/__tests__/quickGo.test.ts --runInBand` passed, 39 tests.
- `npm test -- --runTestsByPath app/components/__tests__/QuickGoResultsView.test.tsx lib/parking/__tests__/pointAbRanking.test.ts lib/parking/__tests__/parkRideResolver.test.ts --runInBand` passed, 78 tests.
- `npm test -- --runTestsByPath __tests__/domain.test.ts lib/parking/__tests__/transitPracticality.test.ts lib/parking/__tests__/pointAbOptionScoring.test.ts --runInBand` passed, 26 tests.
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- No live browser route validation was run for the Bend example.

### 2026-06-10 21:45 PDT — Rideshare route-mode timing correctness audit and fix

**Summary**
- Fixed long-distance rideshare timing: a point A→B / general trip like Monroe/Seattle-area → Bend, OR no longer shows a ~1h 17m rideshare time against a 6h+ drive. The 1h 17m came from the airport distance-band fallback (`distant` band = 72 min + 5 min pickup) being applied when the rideshare route call was unavailable.
- Added `routeConfirmed` (real route vs distance-band fallback) and `timingDerivedFromDrive` to `RideshareOption`; `buildRideshareEstimateOptions` now sets `routeConfirmed: !usedFallback`.
- Added `reconcileRideshareDriveTiming(option, mainDriveMinutes)` in `lib/rideshare/estimate.ts`: a rideshare ride is a car drive, so when the option's drive leg is shorter than the known main origin→destination drive route, the drive leg is re-based on the main drive time plus the existing pickup wait (round-trip scope preserved). Only timing fields change; pricing is untouched. An assumption line documents the re-based source.
- Applied the reconciliation once in `recommendationEngine` where rideshare options are enriched, using `effectiveTrafficEstimate` (skipped when the main route is unavailable). This single correction propagates to Compare options, Quick Go Best Way (`option.duration`), point A→B option scoring, `knownDriveMinutesForTransit`, and Full Trip Details so they all tell the same timing story.
- Hardened `resolveRideshareTiming` (point A→B): the rideshare drive leg is `max(main drive, option drive)`; a confirmed option route is trusted when no main drive is known; an unconfirmed distance-band fallback with no main drive returns no timing so the UI shows "Open app for live estimate" instead of a fake precise duration. The total is always recomputed as `drive + pickup` (×scope) for internal consistency.
- Dropped the stale `?? input.rideDuration` fallback in `pointAbRanking` so a suppressed rideshare duration cannot be resurrected from the raw option value.
- Audited the other modes: drive / drive+park (origin→lot drive + park buffer + walk), transit (`Check route` / suppressed duration for impractical intercity), and Park & Ride (`Not estimated` / `not confirmed` on invalid legs) were already honest via existing guards and were left unchanged. Pricing logic, parking provider fetches, and airport/city/event separation were not changed.
- Refreshed the AGENTS.md current-state summary (active priorities, known issues, beta validation checklist) for the timing audit; no changelog history was deleted.

**Files changed**
- `lib/types.ts`
- `lib/rideshare/estimate.ts`
- `lib/recommendationEngine.ts`
- `lib/parking/pointAbModeTiming.ts`
- `lib/parking/pointAbRanking.ts`
- `lib/rideshare/__tests__/estimate.test.ts`
- `lib/parking/__tests__/pointAbModeTiming.test.ts`
- `lib/parking/__tests__/pointAbRanking.test.ts`
- `AGENTS.md`

**Why**
- A rideshare can never reach a destination faster than driving there, but a distance-band fallback made rideshare look 5× faster than the real drive on long intercity trips, so it could read as the fastest/best option on fake timing. Reconciling at the engine gives every surface a single, source-aware timing truth.

**Tests run and result**
- `npx jest --runTestsByPath lib/rideshare/__tests__/estimate.test.ts lib/parking/__tests__/pointAbModeTiming.test.ts lib/parking/__tests__/pointAbRanking.test.ts --runInBand` passed, 67 tests (new reconcile, routeConfirmed, resolveRideshareTiming, and long-distance ranking cases).
- Broad sweep `--runTestsByPath` over quickGo, domain, decisionScoring, transitPracticality, pointAbOptionScoring, parkRideResolver, parkAndRideAccess, RecommendationStatus, recommendationEngineTrafficDestination, routeTimingIntegration, QuickGoResultsView, OptionComparisonCard, ResultsContentHookOrder, ProviderPricingCards passed, 194 tests.
- Full suite: 1323 passed, 5 skipped; 5 pre-existing failures in 4 suites (OptionComparisonCard layout in parkAndRidePointAb, TripRecalculatingLoader reduced-motion, inventory provider airport scoping, parking route live-limit) fail identically on a clean tree and are unrelated to timing.
- `npm run build` passed (TypeScript type check included).
- `git diff --check` passed.

**Known remaining issues**
- No live browser/mobile validation of the Bend rideshare timing; coverage is unit tests plus production build.
- Rideshare price for a re-based long-distance trip remains the distance-band fare estimate (pricing logic intentionally untouched); only the displayed time is corrected.

**Next recommended step**
- Open a Monroe/Seattle-area → Bend, OR general result and confirm rideshare reads ~6h (drive route + pickup) in the Recommended hero, Compare options, and Full Trip Details, while transit stays "Check route" and Park & Ride stays "not confirmed".

### 2026-06-10 21:45 PDT — AGENTS.md current-state summary refreshed

**Summary**
- Updated the Current PodPaiGo State section inside the `<!-- AGENT_STATE_START --> / <!-- AGENT_STATE_END -->` markers: added route-mode timing honesty to active priorities, recorded the rideshare long-distance timing fix and the pre-existing unrelated unit failures in known issues, and added long-distance/local rideshare timing checks to the beta validation checklist. No changelog history was deleted.

### 2026-06-10 22:30 PDT — Paid garage/lot full-trip timing honesty and Park & Ride "Unavailable" wording

**Summary**
- Fixed point A→B / general-trip paid garage/lot timing so a Bend-style 6h+ trip can never show a 12-min "total" (e.g. Centennial Garage). The 12 min came from `resolvePaidGarageTiming` returning the local parking/walk leg (`parkingMinutes`) as `totalOptionMinutes` when the origin→lot drive leg was missing.
- `resolvePaidGarageTiming` now takes `mainDriveMinutes` (known main origin→destination drive) and `driveRouteConfirmed` and applies three honesty rules: (1) origin→lot leg present → full chain `drive + park buffer + walk` as before; (2) origin→lot leg missing but main drive known → the main drive is used as an honest estimated stand-in (`driveSource: 'main-drive-estimate'`, displayed with an `est.` suffix); (3) only the local leg known and no main drive → `partial: true` timing with `totalOptionMinutes: null` (never a fake total). An unconfirmed origin→lot leg whose full chain is still shorter than the main drive is re-based on the main drive; route-confirmed (google-routes/same-place) faster legs are kept.
- `PointToPointTiming` gained optional `partial` and `driveSource` fields. `resolvePaidParkingDriveToLotMinutesDetailed` (new) reports whether the drive-to-lot leg is route-confirmed; the old minutes-only helper delegates to it.
- `rankPointAbModes` passes `effectiveDriveMinutes` + route confirmation into the paid-garage timing, so the Recommended plan hero, Compare options row, and Full Trip Details all read the same corrected timing object. Compare-row time shows `Xh Ym est.` for the main-drive fallback and `Drive time needed` for partial timing (status stays `route_needed`, candidate minutes become unusable, so partial timing cannot win fastest/best/cheapest). New cons explain partial/estimated timing.
- Canonical option scoring (`buildPointAbOptionScoreBreakdowns`) uses the same guarded timing with the trip's main drive minutes, so Quick Go/canonical fastest winners cannot be won by a fake/partial paid-garage total; an estimated drive leg adds a penalty line.
- Full Trip Details / parking-plan timing rows (`pointAbDetailTimingRows`) label the drive and total rows with `est.` when the drive leg is a main-drive estimate, instead of hiding the timing section.
- Park & Ride wording: a `not_recommended` tier with no usable duration (invalid/missing route legs, destination not confirmed) now renders status `unavailable` ("Unavailable" badge) with `unavailable: true` instead of "Not recommended"; time stays `Not estimated` and the note stays "Park & Ride not confirmed for this destination." Genuinely timed-but-discouraged Park & Ride keeps "Not recommended". Airport overnight Park & Ride logic untouched.
- Provider pricing, rideshare pricing/timing, airport parking timing, and event/stadium logic were not changed.

**Files changed**
- `lib/types.ts` (PointToPointTiming `partial`/`driveSource`)
- `lib/parking/pointAbModeTiming.ts` (resolvePaidGarageTiming honesty guards)
- `lib/parking/pointAbOptionScoring.ts` (detailed drive-to-lot resolver, main-drive-aware score timing, estimate penalty)
- `lib/parking/pointAbRanking.ts` (corrected timing plumbed to display, est./partial copy, Park & Ride unavailable wording)
- `app/results/ResultsContent.tsx` (detail timing rows show est. labels for main-drive-estimate legs)
- `lib/parking/__tests__/pointAbModeTiming.test.ts` (partial, fallback, re-base, confirmed-leg, local-chain cases)
- `lib/parking/__tests__/pointAbRanking.test.ts` (Bend paid-garage full-chain test, partial-timing exclusion test, P&R Unavailable assertions, updated route-degraded and aggregate-only expectations to the new honest est. behavior)
- `app/results/__tests__/ResultsContentHookOrder.test.tsx` (parking plan now shows estimated drive-to-lot timing instead of omitting the section)
- `AGENTS.md`

**Why**
- A paid garage/lot near the destination cannot be reached faster than driving there; presenting the 12-min local parking/walk leg as the trip total for a 6h+ Bend trip was dishonest and could distort fastest/easiest comparisons. "Not recommended" also misdescribed Park & Ride paths that are actually unavailable/not confirmed.

**Tests run and result**
- `npx jest --runTestsByPath lib/parking/__tests__/pointAbModeTiming.test.ts lib/parking/__tests__/pointAbRanking.test.ts lib/parking/__tests__/pointAbOptionScoring.test.ts lib/parking/__tests__/pointAbCanonicalFlow.test.ts --runInBand` passed, 65 tests.
- `npx jest --runTestsByPath lib/parking/__tests__/parkRideResolver.test.ts lib/parking/__tests__/transitPracticality.test.ts __tests__/parkAndRideAccess.test.ts lib/rideshare/__tests__/estimate.test.ts lib/trip/__tests__/quickGo.test.ts __tests__/domain.test.ts lib/__tests__/RecommendationStatus.test.ts lib/parking/__tests__/streetMeterSmartCard.test.ts --runInBand` passed, 104 tests.
- `npx jest --runTestsByPath app/results/__tests__/ResultsContentHookOrder.test.tsx app/results/__tests__/ParkingSmartPick.test.tsx app/components/__tests__/PointAbHeroSummary.test.tsx app/components/__tests__/OptionComparisonCard.test.tsx --runInBand` passed (34 + UI suites).
- `npx jest --runTestsByPath lib/__tests__/providersParkingAirport.test.ts lib/__tests__/RecommendationStatus.test.ts __tests__/parkingPriceDisplay.test.ts lib/parking/__tests__/pointAbQuickRead.test.ts lib/parking/__tests__/pointAbLocalTripCleanup.test.ts lib/parking/__tests__/streetMeterParking.test.ts lib/__tests__/recommendationEngineTrafficDestination.test.ts --runInBand` passed, 64 tests (airport/event/engine regression).
- `lib/parking/__tests__/parkAndRidePointAb.test.tsx` still fails 2 OptionComparisonCard layout tests; verified via `git stash` that these fail identically on a clean tree (pre-existing, documented in known issues).
- `npm run build` passed.
- `git diff --check` passed.

**Known remaining issues**
- No live browser validation of the Bend Centennial Garage result; coverage is unit/DOM tests plus production build.
- The main-drive-estimate fallback uses the trip's effective drive minutes (which can itself be a haversine estimate when no routed drive exists); it is always labeled `est.` and cannot understate the main drive.
- Pre-existing unrelated failures remain in OptionComparisonCard layout (parkAndRidePointAb), TripRecalculatingLoader reduced-motion, inventory provider airport scoping, and parking route live-limit suites.

**Next recommended step**
- Re-run the Monroe/Seattle-area → Bend, OR general trip in localhost/Vercel and confirm Paid garage/lot reads ~6h 30m est. (not 12 min) in the Recommended hero, Compare options, and Full Trip Details, and that Park & Ride shows an "Unavailable" badge with "Not estimated" time.
