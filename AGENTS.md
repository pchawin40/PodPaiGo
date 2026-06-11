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
