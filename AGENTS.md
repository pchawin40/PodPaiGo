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
- Beta trip-planning experience for airport, point A→B/city, and Quick Go trips, built around progressive disclosure: every major screen shows the primary answer/action first, with customization, explanations, evidence, and caveats collapsed behind expandable sections. Honest live/estimated/cached/provider labels stay visible.

**Active priorities**
- Progressive disclosure uses the shared `app/components/ui/ExpandableSection.tsx` (accessible button + `aria-expanded`/`aria-controls`, chevron, optional `summary`, controlled or uncontrolled `open`; body stays mounted via the `hidden` attribute so form values and validation persist while collapsed). No external UI libraries.
- Home page above the fold = hero headline + tagline + 3 feature chips + Plan a trip / Try Quick Go + Quick Go panel; "How it works" (steps) and "How PodPaiGo uses data" (full disclosure) are collapsed sections; the short data-transparency line stays quiet in the hero; footer/privacy/about and `PodPaiGoAssistant` remain.
- QuickGoPanel default view = destination input + Quick Go CTA + "Starting from … Change"; trip purpose, timing, preference, parking duration, leave-time, family/luggage, and transport availability all live in a collapsed "Customize trip" section. Origin editor stays behind the existing Change button; geolocation/recent/saved origin, query params, analytics, and autocomplete are unchanged.
- TripFlow step 2 keeps essentials visible (general: destination, origin, date/time; airport: airport, origin, departure/arrival time, See options) and collapses Transportation preferences, general Parking preferences/advanced time, Airline/flight details, and Airport readiness (compact "Recommended buffer: X min" summary). The airport "Parking time" section holds the required trip date, so it is a controlled ExpandableSection that starts open and auto-reopens on parking-date validation errors. Validation behavior is otherwise unchanged.
- Quick Go results card keeps destination, best way, drive/total time, leave-by, parking expectation, and one primary CTA visible; Why this recommendation / Parking details / Backup option are collapsed. Urgent airport-prompt and warning cards stay visible.
- Results page preserves the lean Recommended plan hero + compact Compare options; do NOT reintroduce the old large public Parking plan block; keep CTAs (Open directions, Route to parking, Reserve/Compare provider, View parking details) and honest labels visible.
- Compare options stay a compact scoreboard with fixed desktop columns (Option, Status, Cost, Time, Note, Action), one quiet action per row (View / Why?), and pros/cons/timing/evidence in lower Details sections.
- Quick Go Best Way uses practical total origin-to-destination timing (estimated/fallback intercity transit and local Park & Ride corridor estimates must not beat known drive/rideshare unless transit-only is selected); honor materially faster verified local transit/rideshare; synthetic "Drive" for free/customer-parking or impractical-transit trips.
- Keep airport, city/general, and event/stadium parking logic separate; never fake or mislabel live prices. Public/non-admin surfaces stay free of debug/env diagnostics (debug UI gate is admin AND debug flag).

**Current known issues**
- All UI/UX progressive-disclosure changes are verified by Jest/DOM tests, typecheck, lint (no new issues), and production build only; no live browser/mobile screenshot pass yet.
- Parking lot list cards below the results hero are still fairly dense; per-lot details/evidence remain a documented future pass. ResultsContent was intentionally not restructured this pass to avoid risk in the heavily-tested 11k-line file.
- Quick Go Bend/intercity transit suppression is covered by tests only; no live Bend route/browser validation.
- Pre-existing full-suite failures unrelated to this work: `lib/parking/__tests__/parkAndRidePointAb.test.tsx`, `app/components/__tests__/TripRecalculatingLoader.test.tsx`, `lib/__tests__/providersParkingRouteLimit.test.ts`, `lib/providers/parking/providers/inventory/__tests__/provider.test.ts` (none import the changed UI modules).

**Beta validation checklist**
- ExpandableSection: collapsed sections keep children mounted (form values/validation persist); toggle exposes `aria-expanded`; chevron rotates; controlled `open`/`onOpenChange` works (used by TripFlow Parking time).
- Home: above the fold reads as one promise + actions; "How it works" and "How PodPaiGo uses data" expand/collapse; footer/privacy/about and the PodPaiGoAssistant remain.
- QuickGoPanel: a first-time user sees destination + Quick Go without parsing options; "Customize trip" expands to all settings; geolocation/recent/saved origin, query params, analytics, and keyboard autocomplete still work.
- TripFlow: collapsed sections expand correctly; airport "Parking time" starts open and auto-opens when a parking date error needs fixing; hidden fields still submit/validate; "See options" submits with correct params.
- Quick Go results: destination, best way, drive/total time, leave-by, parking expectation, and Open directions visible; Why / Parking details / Backup expand; airport prompt still visible.
- Results: Recommended plan hero is the first answer; Compare options stay compact with one quiet action per row; no large public Parking plan block reappears; honest live/estimated/cached/provider labels and key CTAs stay visible.
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

### 2026-06-11 — Progressive-disclosure UI/UX cleanup (ExpandableSection)

**Summary**
- Added reusable `app/components/ui/ExpandableSection.tsx`: accessible button with `aria-expanded`/`aria-controls`, chevron indicator, optional one-line `summary`, `defaultOpen`, and controlled `open`/`onOpenChange`. Matches the ppg-section-panel/travel-card look, no external libraries, mobile-compact. The body stays mounted via the `hidden` attribute so collapsed form fields keep their values and still submit/validate.
- QuickGoPanel: default view trimmed to title + one helper line + destination input + Quick Go CTA + "Starting from … Change"; trip purpose, timing now/later, what-matters-most, parking duration, leave-time, family/luggage, and "How will you get around?" moved into a collapsed "Customize trip" section. Origin editor still lives behind the existing Change button; geolocation/recent/saved origin, query params, analytics, and autocomplete unchanged.
- Home page: feature chips reduced from 6 to 3; "Why PodPaiGo" grid trimmed to 3 cards ("What PodPaiGo helps with"); the five-tabs blurb + steps moved into a collapsed "How it works" section; added a collapsed "How PodPaiGo uses data" section with the full data-transparency disclosure; hero short transparency line and footer/about/privacy + PodPaiGoAssistant preserved.
- TripFlow step 2: collapsed Transportation preferences, general Parking preferences (incl. advanced parking time), Airline/flight details, and Airport readiness (compact "Recommended buffer: X min" summary). Essentials stay visible. Airport "Parking time" (which carries the required trip date) is a controlled ExpandableSection that starts open and auto-reopens on `parkingCheckInDate`/`parkingCheckOutDate` errors; validation behavior is otherwise unchanged.
- Quick Go results card (`QuickGoResultsCard`): kept destination, best way, drive/total time, leave-by highlight, parking expectation, and the Open directions CTA visible; moved stress/weather/guidance into "Why this recommendation?", parking confidence into "Parking details", and the backup label into "Backup option". Urgent airport-prompt card untouched.
- ResultsContent: verified only — the lean Recommended plan hero and compact Compare options are intact and no large public Parking plan block was reintroduced; the dense per-lot lists were intentionally left for a future pass to avoid risk in the heavily-tested file.
- No recommendation/scoring/parking business logic was changed; honest live/estimated/cached/official/provider labels remain visible.

**Files changed**
- `app/components/ui/ExpandableSection.tsx` (new)
- `app/components/ui/__tests__/ExpandableSection.test.tsx` (new)
- `app/components/QuickGoPanel.tsx`
- `app/components/QuickGoResultsCard.tsx`
- `app/page.tsx`
- `app/trip/TripFlow.tsx`
- `app/trip/__tests__/TripFlowOptionButtons.test.tsx` (expand collapsed Airport readiness before reaching Security)
- `app/trip/__tests__/TripFlowParkingWindow.test.tsx` (expand collapsed Parking preferences before reaching duration)
- `AGENTS.md`

**Why**
- The app exposed too many settings/explanations at once (Quick Go options, dense trip form, busy landing page, report-card Quick Go results). Progressive disclosure surfaces the primary answer/action first and tucks optional settings, evidence, and caveats behind expand/collapse, making the beta feel simpler and more modern without removing functionality.

**Tests run and result**
- `npm run typecheck` — clean for all changed source files (only pre-existing `__tests__` type errors remain, unrelated to this work).
- `npm run lint` — no new issues in changed files (pre-existing repo errors/warnings only).
- `npm test` (full suite) — 1315 passed, 5 skipped; 5 pre-existing failures in 4 suites that do not import the changed UI modules (`parkAndRidePointAb`, `TripRecalculatingLoader`, `providersParkingRouteLimit`, inventory `provider`).
- Focused: `QuickGoPanel`, `QuickGoResultsView`, `TripFlowAirportDate`, `TripFlowOptionButtons`, `TripFlowParkingWindow`, `ExpandableSection` — 52 passed.
- `npm run build` — compiled successfully (67/67 static pages).
- `git diff --check` — passed.

**Known remaining issues**
- DOM/test + build verified only; no live browser/mobile screenshot pass yet.
- Results page per-lot parking list cards remain dense; deferred to a future pass.

### 2026-06-11 — AGENTS.md current-state summary refreshed

**Summary**
- Refreshed the `<!-- AGENT_STATE_START --> / <!-- AGENT_STATE_END -->` Current PodPaiGo State section (product focus, active priorities, current known issues, beta validation checklist) to reflect the progressive-disclosure UI/UX direction and the shared ExpandableSection component; no changelog history was deleted and the Event Parking Rules, Mandatory Change Memory Rule, and Required End-of-Task Format were left intact.
