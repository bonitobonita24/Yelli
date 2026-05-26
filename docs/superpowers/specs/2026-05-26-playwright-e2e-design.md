# Design Spec — Phase 8 Batch B sub-4: Playwright e2e Install + First 2 Specs
<!-- Format mirrors: 2026-05-26-livekit-egress-polish-design.md (304-line reference) -->

**Date:** 2026-05-26
**Branch:** `feat/e2e-playwright`
**Scope tier:** MODERATE — new toolchain (Playwright) + 2 e2e specs + mock layer in egress-client.ts. Tier 2 per memory-governance.md §1: estimated 8-12 files across 3 modules (test infra + egress mock + fixtures).
**Status:** Design — pending implementation plan

---

## 1. Purpose

Install Playwright as the project's e2e test framework and ship two passing specs that prove the LiveKit Egress recording flow works end-to-end without a live LiveKit server. Unblocks automated regression coverage for the recordings feature shipped in Phase 8 Batch B sub-3.

---

## 2. Scope

| Item | In scope |
|---|---|
| Playwright install (`@playwright/test`, chromium only) | ✅ |
| `playwright.config.ts` at repo root | ✅ |
| `e2e/auth.setup.ts` — real login via web form, saves `host.json` | ✅ |
| `LIVEKIT_E2E_MOCK=true` env guard in `egress-client.ts` | ✅ |
| `.env.test.e2e` (gitignored) | ✅ |
| Spec (a): host recording start → stop → row in `/app/recordings` | ✅ |
| Spec (b): soft-delete row via AlertDialog → row disappears | ✅ |
| Vitest config unchanged (`environment: "node"`) | ✅ |

---

## 3. Out of scope

- Firefox / WebKit browser targets — chromium only for now.
- Visual regression screenshots or pixel diffing.
- LiveKit media stream testing (audio/video tracks).
- Mobile viewport e2e specs.
- GitHub Actions CI job for Playwright — deferred to follow-up PR.
- MSW or other browser-level mocking — mock lives server-side in `egress-client.ts` only.

---

## 4. User flows

### 4.1 Auth setup flow (runs once before all specs)

```
navigate /login
  → fill username: "webmaster"
  → fill password: (from WEBMASTER_PASSWORD env or .env.test.e2e)
  → click submit
  → wait for redirect to /app or /app/dashboard
  → saveStorageState → playwright/.auth/host.json
```

### 4.2 Spec (a) — recording start/stop

```
[state: storageState = host.json, LIVEKIT_E2E_MOCK=true in server]

via APIRequestContext (no browser navigation yet):
  → seed a Meeting + CallLog row to attach the recording to
    (helper: e2e/fixtures/seed-meeting.ts — creates via Prisma or via meetings.create tRPC if available)
  → POST /api/trpc/recordings.start with { meeting_id, call_log_id }
  → assert 200, capture egress_id (must match "e2e-mock-*" prefix)
  → wait ~500ms
  → POST /api/trpc/recordings.stop with { egress_id }
  → assert 200

now switch to browser context:
  → navigate /app/recordings
  → assert row with the captured egress_id appears in the recordings table
  → assert row displays the "Complete" status (or equivalent indicator from the page)
  → assert the recording-download-button and recording-delete-button are rendered for the row

teardown:
  → soft-delete the seeded recording via API to keep DB clean across runs
```

> **Note on coverage gap:** The in-meeting "Start recording" / "Stop recording" buttons in `in-call-recording-indicator.tsx` are NOT exercised by this spec. They remain covered by manual Phase 6 visual QA. A future spec (a-v2) can traverse the full in-meeting UI once we have a documented path for either (i) running LiveKit Core as a Playwright dependency, or (ii) stubbing `livekit-client` on the browser side. Both are out of scope for this batch.

### 4.3 Spec (b) — soft-delete via AlertDialog

```
[state: storageState = host.json, LIVEKIT_E2E_MOCK=true, seed 1 recording row via API]

navigate /app/recordings
  → assert seeded row visible by egress_id
  → click button matching aria-label recordingDeleteCopy.triggerLabel
  → assert AlertDialog visible with title = recordingDeleteCopy.dialogTitle
  → assert description = recordingDeleteCopy.dialogDescription
  → click button matching text = recordingDeleteCopy.confirmLabel
  → wait for dialog to close
  → assert row with seeded egress_id no longer visible
```

---

## 5. Component and file design

### 5.1 `playwright.config.ts` (repo root)

Registers two projects: `setup` (auth) and `e2e` (specs). The `e2e` project depends on `setup` completing first. `webServer` block starts `pnpm --filter @yelli/web dev` and waits for port 3000. `reuseExistingServer: !process.env.CI` — dev machines reuse a running server; CI always spins a fresh one. `testDir: './e2e'`. `outputDir: './playwright-results'`. Reporter: `list` in CI, `html` locally.

### 5.2 `e2e/auth.setup.ts`

Single test in the `setup` project. Navigates to `/login`. Fills the username field (selector: `input[name="username"]` or `#username` — confirm against actual login page DOM). Fills password from `process.env.WEBMASTER_PASSWORD`. Clicks submit. Waits for URL to contain `/app`. Calls `page.context().storageState({ path: 'playwright/.auth/host.json' })`.

Auth file is gitignored via `playwright/.auth/`. The `.env.test.e2e` file supplies `WEBMASTER_PASSWORD` and `LIVEKIT_E2E_MOCK=true` and `APP_URL=http://localhost:3000`.

### 5.3 `egress-client.ts` mock guard

The `LIVEKIT_E2E_MOCK=true` check is injected at the top of `startEgress` and `stopEgress` functions (or their equivalents) in `apps/web/src/lib/livekit/egress-client.ts`. When the guard is active:

- `startEgress`: skips the real LiveKit SDK call, generates and returns `egress_id = "e2e-mock-" + cuid()`. Does **not** create a `Recording` row — the caller (`recordings.start` tRPC procedure) handles that as it does in production.
- `stopEgress`: skips the real SDK call and returns success immediately. The caller (`recordings.stop` tRPC procedure) handles updating the `Recording` row status as it does in production.

The guard reads `process.env.LIVEKIT_E2E_MOCK === "true"` directly. No tRPC middleware change. No new environment variable validation schema entry needed at this phase — it is strictly a test-environment flag.

### 5.4 `e2e/recording-flow.spec.ts` (spec a)

Imports `test, expect` from `@playwright/test`. Uses `storageState` from `host.json` via the project config. Three test cases in one describe block: (1) start recording, (2) stop recording, (3) row appears in recordings page. The three are sequential — Playwright does not share state between `test()` blocks by default, so the spec will use a single test with three assertion checkpoints, or a `test.step()` chain.

Open question 4 (the actual recording control button selector) must be resolved before implementation. The spec stubs the selector as `page.getByRole('button', { name: /start recording/i })` pending discovery.

### 5.5 `e2e/recording-delete.spec.ts` (spec b)

Imports `test, expect, request` from `@playwright/test`. Uses `storageState` from `host.json`. The `beforeEach` hook calls a `seedRecording` helper (in `e2e/fixtures/seed-recording.ts`) that seeds a `Recording` row by calling `recordings.start` followed by `recordings.stop` via `APIRequestContext` — this mirrors production code paths and avoids any direct DB writes from test code. The helper captures the resulting `egress_id` for use in assertions and cleanup.

The spec navigates to `/app/recordings`. The delete trigger button selector is `button[aria-label="${recordingDeleteCopy.triggerLabel}"]`. The confirm button selector is `button:has-text("${recordingDeleteCopy.confirmLabel}")`. After confirmation, the spec asserts the row with the seeded `egress_id` is no longer present in the table.

The `afterEach` hook ensures cleanup even if the test fails by calling `recordings.softDelete` via API (idempotent — row may already be deleted). The `recordingDeleteCopy` constants are imported directly in the spec for assertion text, keeping specs resilient to copy changes.

---

## 6. Environment and tooling

### 6.1 Package additions

```
pnpm add -D @playwright/test --filter @yelli/root
# or at repo root if using workspace root:
pnpm add -D @playwright/test
npx playwright install chromium --with-deps
```

`@playwright/test` must be added to the root `package.json` `devDependencies` (not inside `apps/web`) so Playwright's `playwright.config.ts` at the repo root resolves correctly in the monorepo.

Add `playwright` script to root `package.json`:

```json
"playwright": "playwright test",
"playwright:ui": "playwright test --ui"
```

### 6.2 New files and gitignore

New files created by this batch:

| File | Purpose |
|---|---|
| `playwright.config.ts` | Playwright project config (setup + e2e projects) |
| `e2e/auth.setup.ts` | Auth setup — login + save storageState |
| `e2e/recording-flow.spec.ts` | Spec (a): start/stop → row appears |
| `e2e/recording-delete.spec.ts` | Spec (b): AlertDialog soft-delete |
| `.env.test.e2e` | Test env vars (WEBMASTER_PASSWORD, LIVEKIT_E2E_MOCK, APP_URL) |
| `e2e/fixtures/seed-recording.ts` | Helper to create Recording row via API for spec (b) |
| `e2e/fixtures/seed-meeting.ts` | Helper to create a Meeting + CallLog row via Prisma or tRPC, used by spec (a) and spec (b) for setup. |

`.gitignore` additions required:

```
playwright/.auth/
playwright-results/
test-results/
.env.test.e2e
```

`playwright-results/` is Playwright's output artifact dir (screenshots, traces, videos).

---

## 7. Error states, loading states, and edge cases

| Scenario | Expected behavior |
|---|---|
| Auth setup fails (wrong password) | Auth project fails; dependent e2e project skipped. `host.json` not written. CI fails with auth error. |
| Dev server not ready at `webServer` timeout | Playwright times out and prints `WebServer did not start in time`. CI fails. |
| `LIVEKIT_E2E_MOCK` not set in CI env | Real LiveKit SDK called → network error → spec (a) fails. Mitigation: CI job sets env explicitly. |
| Recording row seeded in spec (b) left behind | `afterEach` calls soft-delete (idempotent). If test DB is ephemeral (CI), no cleanup needed. |
| `host.json` stale (auth token expired) | Auth setup re-runs on every `playwright test` invocation. Token freshness is guaranteed. |
| `confirmLabel` button not found in AlertDialog | Spec (b) fails with locator error. Root cause: `recordingDeleteCopy` constant mismatch or dialog not rendered. Check component integration. |
| In-call recording control button selector mismatch | Spec (a) fails with locator error. Root cause: open question 4 unresolved. Placeholder selector must be updated. |

---

## 8. Security and governance

- `.env.test.e2e` contains `WEBMASTER_PASSWORD` — gitignored, never committed.
- `LIVEKIT_E2E_MOCK=true` is a server-side guard. It must NEVER be set in `.env.staging` or `.env.prod`. Add a lint rule or Phase 5 `check-env.mjs` assertion to reject this var outside test environments.
- `playwright/.auth/host.json` contains a valid session token for the webmaster account — gitignored, never committed.
- `WEBMASTER_PASSWORD` is read from `.env.test.e2e` (gitignored). Local dev only. CI will set this via GitHub Secret in the follow-up CI PR.
- Mock recordings created during tests use a recognizable prefix (`e2e-mock-`) in `egress_id` and `file_path` to enable easy identification and cleanup.
- `seed-recording.ts` uses the existing `recordings.softDelete` tRPC procedure for cleanup — no direct DB writes from test code.

---

## 9. Open questions

| # | Question | Resolution |
|---|---|---|
| 1 | Does the root `pnpm-workspace.yaml` allow installing `@playwright/test` at root, or must it live in `apps/web`? | **Plan phase verifies.** Most likely root install works since Playwright is a dev tool not consumed by web app code. |
| 2 | Does `ubuntu-latest` CI runner satisfy Chromium system deps? | **N/A this PR.** CI integration is out of scope. Local dev machine assumed to have Chromium deps via `npx playwright install --with-deps`. |
| 3 | Exact DOM selectors for `/login` username + password fields? | **Plan phase reads the rendered HTML.** Recommend `getByLabel('Username')` and `getByLabel('Password')` as resilient selectors; fall back to `input[name="username"]` etc. if labels not associated. |
| 4 | Does the in-meeting page render without a live LiveKit room? | **Resolved: NO.** `MeetingRoom` mounts the LiveKit client. Spec (a) sidesteps this by going through the API rather than the in-meeting UI (see §4.2 note). |
| 5 | Separate `.env.test.e2e` or reuse `.env.dev` with flag set? | **Decision: separate `.env.test.e2e`.** Prevents accidental `LIVEKIT_E2E_MOCK=true` leakage into the regular dev workflow. Gitignored. Loaded via `dotenv` in `playwright.config.ts`. |

---

## 10. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Open question 4 blocks spec (a) entirely | High | Spec (a) is written with a stubbed selector and marked `test.skip()` until resolved. Plan proceeds; impl unblocked for spec (b) and tooling. |
| Playwright Chromium binary size (~130 MB) bloats CI cache | Medium | Pin to `chromium` only (no firefox/webkit). CI caches `~/.cache/ms-playwright` keyed by Playwright version. |
| Mock guard accidentally enabled in staging | Low | `check-env.mjs` assertion added (Phase 5 gate) to reject `LIVEKIT_E2E_MOCK=true` outside `test` NODE_ENV. |
| `storageState` token expires between auth setup and spec run | Very low | Auth runs as `dependencies` of the e2e project — both run in the same `playwright test` invocation. Token age < 60 seconds typical. |
| Vitest and Playwright config co-existing in monorepo root | Low | Vitest is configured inside `apps/web/vitest.config.ts` with `environment: "node"`. Playwright config is at repo root with `testDir: './e2e'`. No path overlap; no `globalSetup` conflict. |
| `recordingDeleteCopy` constants renamed in future refactor | Low | Spec (b) imports the constants directly from the source file rather than hard-coding strings. |

---

## 11. Acceptance criteria

```
□ pnpm playwright runs without errors from repo root.
□ Playwright chromium binary installed; no webkit/firefox binaries pulled.
□ playwright.config.ts registers setup and e2e projects with correct dependency.
□ e2e/auth.setup.ts saves playwright/.auth/host.json on successful login.
□ LIVEKIT_E2E_MOCK=true causes egress-client.ts to skip real LiveKit SDK call.
□ Synthetic Recording row with egress_id "e2e-mock-*" created in DB on mock start.
□ Spec (a) passes: recording row appears in /app/recordings after stop.
□ Spec (b) passes: soft-deleted row disappears from /app/recordings table.
□ .env.test.e2e is gitignored and contains WEBMASTER_PASSWORD, LIVEKIT_E2E_MOCK=true.
□ playwright/.auth/ and playwright-results/ are gitignored.
□ CI playwright job runs on ubuntu-latest; all specs pass.
□ Vitest suite (470 tests) still passes after Playwright install (no regressions).
□ LIVEKIT_E2E_MOCK guard does not exist in .env.staging or .env.prod.
□ Open question 4 is resolved or spec (a) is explicitly skipped with a TODO comment.
```

---

## 12. Definition of done

All acceptance criteria above are checked. `feat/e2e-playwright` branch is squash-merged to `main`. Governance docs updated: `CHANGELOG_AI.md` (Agent: CLAUDE_CODE), `IMPLEMENTATION_MAP.md` (e2e section added), `docs/DECISIONS_LOG.md` (Playwright as e2e framework locked). STATE.md rewritten. SocratiCode index refreshed via `codebase_update`.

---

## 13. Commit sequence

Follows Architect-Execute Model from `memory-governance.md §4`. Opus dispatches Sonnet subagents per commit. Each subagent receives a pre-scoped task with token estimate ≤ 30K.

| # | Commit message | Files touched | Token est. | Verification gate |
|---|---|---|---|---|
| 1 | `chore(e2e): install playwright, add config and gitignore entries` | `package.json` (root), `playwright.config.ts`, `.gitignore`, `pnpm-lock.yaml` | ~12K | `pnpm playwright --list` shows 0 test files (no specs yet); lockfile clean |
| 2 | `feat(e2e): auth setup — login and save storageState` | `e2e/auth.setup.ts`, `.env.test.e2e` (template only, no secrets) | ~10K | `pnpm playwright --project=setup` passes; `playwright/.auth/host.json` written |
| 3 | `feat(livekit): LIVEKIT_E2E_MOCK guard in egress-client.ts` | `apps/web/src/lib/livekit/egress-client.ts` | ~14K | Existing `egress-client.test.ts` still passes; mock path returns synthetic row |
| 4 | `feat(e2e): spec a — recording start/stop flow` | `e2e/recording-flow.spec.ts` | ~16K | Spec passes (or is skipped with TODO if open question 4 unresolved); no Vitest regressions |
| 5 | `feat(e2e): spec b — recording soft-delete via AlertDialog` | `e2e/recording-delete.spec.ts`, `e2e/fixtures/seed-recording.ts` | ~18K | Spec passes; seeded row gone after confirm; Vitest suite still 470 passing |
| 6 | `ci(e2e): add playwright job to ci.yml` | `.github/workflows/ci.yml` | ~8K | CI passes on push; playwright job shows green |
| 7 | `chore(governance): Phase 8 Batch B sub-4 — CHANGELOG + MAP + STATE` | `docs/CHANGELOG_AI.md`, `docs/IMPLEMENTATION_MAP.md`, `.cline/STATE.md` | ~6K | Governance self-check passes; STATE.md PHASE updated |

Sonnet subagent budget note: commits 4 and 5 are the heaviest. If either subagent reports `NEEDS_CONTEXT` due to open question 4, Opus provides the resolved selector and re-dispatches. Commits 1–3 and 6–7 are independently parallelizable after commit 3 unblocks commits 4–5.

---

## 14. Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Cypress instead of Playwright | Playwright has first-class monorepo support, `storageState` for auth sharing, and `APIRequestContext` for seeding. Cypress would require a separate `cypress.json` and lacks native storageState. |
| MSW (Mock Service Worker) for LiveKit mock | MSW intercepts at the browser network layer. The LiveKit mock must be server-side (tRPC + Prisma writes) to produce real DB rows. MSW cannot create Prisma records. |
| Playwright inside `apps/web` (not repo root) | `apps/web` uses Vitest with `testDir` pointed at `src/`. Installing Playwright inside `apps/web` risks `pnpm test` accidentally picking up `.spec.ts` files in `e2e/`. Repo root keeps toolchains cleanly separated. |
| Real LiveKit server via Docker in CI | Adds ~2 min CI overhead per run, requires LiveKit Docker image, and creates flaky tests tied to network timing. The mock strategy is deterministic and fast. |
| Seed recording via direct `prisma.$executeRaw` in test | Bypasses all tRPC validation and tenant-guard middleware. Using `APIRequestContext` against the actual tRPC endpoint is the correct approach — validates the full stack path. |

---

## 15. Follow-ups

- Resolve open question 4 (in-meeting recording control selector) before or during commit 4 implementation.
- Add `LIVEKIT_E2E_MOCK` to `check-env.mjs` reject-list for non-test environments.
- Consider adding a Playwright trace upload step to CI for failed spec debugging.
- Phase 8 Batch B sub-5 (if scoped): add e2e specs for room creation and participant join flows.
- Update `.env.example` with `LIVEKIT_E2E_MOCK=` (commented out, empty value) as documentation.

---

## 16. Dependencies

Implementation plan: `docs/superpowers/plans/2026-05-26-playwright-e2e-plan.md` (to be written).

Prerequisite state: Phase 8 Batch B sub-3 squash-merged. `recording-delete-button.tsx`, `recording-delete-copy.ts`, `AlertDialog` integration, and `recordings.softDelete` tRPC procedure all present on `main`.

---

*End of design spec.*
