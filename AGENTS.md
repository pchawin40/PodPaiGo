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
- Recent visual changes (admin outreach preview wrapping, results recalculating loader, concise Recommended hero, fixed-column vertically centered Compare options scoreboard rows, simplified parking filters) are verified by DOM/class tests and production build only; no live browser/mobile screenshot pass yet.
- Quick Go Bend/intercity transit suppression is covered by resolver, Quick Go view, Park & Ride, and point A→B ranking tests; no live Bend route/browser validation was run for the latest resolver guard.
- Parking lot list cards below the hero are still fairly dense; future passes can move more per-lot details behind expanders.

**Beta validation checklist**
- Quick Go results: free/customer parking still recommends Drive when appropriate, concrete parking winners show `Drive + park · [lot]`, materially faster verified local rideshare/transit options are not overwritten by generic Drive, transit-only stays honored, and Bend-style estimated intercity transit does not appear as a 1h Best Way.
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
