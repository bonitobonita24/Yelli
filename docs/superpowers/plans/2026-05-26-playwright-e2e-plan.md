# Phase 8 Batch B sub-4 — Playwright e2e install + first 2 specs

## Header

| Field | Value |
|---|---|
| Sub-skill | `superpowers:subagent-driven-development` |
| Branch | `feat/e2e-playwright` |
| Squash-merge target | `main` |
| Parent spec | `docs/superpowers/specs/2026-05-26-playwright-e2e-design.md` |
| Commits | 6 (Task 7 is governance close-out, not a code commit) |
| Estimated total tokens | ~84K (≤30K per subagent task — within Architect-Execute budget) |
| Vitest suite (must not regress) | 53 test files, 470 tests |

**Goal:** Install Playwright, configure a two-project setup (auth + e2e), add a server-side
`LIVEKIT_E2E_MOCK` guard in `egress-client.ts`, then ship two green specs:
(a) recording start/stop lifecycle via `APIRequestContext`, asserting the row appears in the
recordings feed UI; (b) soft-delete via the `AlertDialog` confirmation dialog.

**Architecture:**

```
playwright.config.ts          ← root config, dotenv, two projects
  project: setup              ← e2e/auth.setup.ts → playwright/.auth/host.json
  project: e2e                ← depends on setup, loads storageState

e2e/
  auth.setup.ts               ← login as webmaster, save storageState
  fixtures/
    seed-meeting.ts           ← create/cleanup a Meeting row via tRPC
    seed-recording.ts         ← start+stop recording via tRPC, softDelete for cleanup
  recording-flow.spec.ts      ← spec (a): API-driven lifecycle + UI assertion
  recording-delete.spec.ts    ← spec (b): soft-delete via AlertDialog

apps/web/src/lib/livekit/
  egress-client.ts            ← LIVEKIT_E2E_MOCK guard (mock startEgress/stopEgress)
```

**Tech stack additions:**

| Package | Role |
|---|---|
| `@playwright/test` | Test runner + browser automation |
| `chromium` (bundled) | Only browser target — no webkit, no firefox |
| `dotenv` (already in repo) | Load `.env.test.e2e` in `playwright.config.ts` |

**Security invariants (non-negotiable):**

- `.env.test.e2e` is gitignored — contains `WEBMASTER_PASSWORD`, never committed
- `LIVEKIT_E2E_MOCK=true` must NEVER appear in `.env.staging` or `.env.prod`
- `playwright/.auth/host.json` contains a valid session token — gitignored, never committed
- Mock recordings use `e2e-mock-` prefix in `egress_id` and `file_path` for easy identification
- Test cleanup uses `recordings.softDelete` tRPC procedure — no direct DB writes from specs
- `CREDENTIALS.md` remains gitignored throughout — verify before every task

---

## Pre-flight requirements

- [ ] **Confirm working tree is clean on `main`**

  ```bash
  git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli status --short
  ```

  Expected: empty output (no modified or untracked files).

- [ ] **Confirm Vitest baseline passes**

  ```bash
  cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && pnpm test --run 2>&1 | tail -5
  ```

  Expected: `53 passed` with no failures.

- [ ] **Confirm dev server can start** (pnpm installed, Next.js buildable)

  ```bash
  cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && pnpm --filter @yelli/web typecheck 2>&1 | tail -5
  ```

  Expected: `0 errors`.

- [ ] **Create the feature branch**

  ```bash
  git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli checkout -b feat/e2e-playwright
  ```

  Expected: `Switched to a new branch 'feat/e2e-playwright'`.

- [ ] **Confirm `.env.test.e2e.example` does not yet exist** (first task creates it)

  ```bash
  ls /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/.env.test.e2e.example 2>&1
  ```

  Expected: `No such file or directory`.

---

## File structure

All files created or modified across all 7 commits:

| File | Action | Commit |
|---|---|---|
| `package.json` (root) | Modify — add scripts | 1 |
| `playwright.config.ts` | Create | 1 |
| `.gitignore` | Modify — add playwright entries | 1 |
| `pnpm-lock.yaml` | Auto-updated | 1 |
| `.env.test.e2e.example` | Create | 2 |
| `e2e/auth.setup.ts` | Create | 2 |
| `apps/web/src/lib/livekit/egress-client.ts` | Modify — add guard | 3 |
| `apps/web/src/lib/livekit/egress-client.test.ts` | Create — unit tests for guard | 3 |
| `e2e/fixtures/seed-meeting.ts` | Create | 4 |
| `e2e/fixtures/seed-recording.ts` | Create | 4 |
| `e2e/recording-flow.spec.ts` | Create | 5 |
| `e2e/recording-delete.spec.ts` | Create | 6 |

---

## Task 1 — Install Playwright and add root config

**Token budget:** ~12K  
**TDD phase:** Not applicable (tooling setup)

### Context to read (Sonnet subagent)

- Root `package.json` (scripts block + devDependencies)
- `.gitignore` (bottom — locate existing AI artifacts section)
- `pnpm-workspace.yaml` (confirm root `"."` is NOT listed — `-w` flag required)

### Steps

- [ ] **Install Playwright at workspace root** (chromium only)

  ```bash
  cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli
  pnpm add -D -w @playwright/test
  pnpm exec playwright install chromium
  ```

- [ ] **Add scripts to root `package.json`**

  Add inside `"scripts"`:

  ```json
  "playwright": "playwright",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:report": "playwright show-report playwright-report"
  ```

- [ ] **Create `playwright.config.ts` at repo root**

  ```typescript
  import { defineConfig, devices } from '@playwright/test';
  import * as dotenv from 'dotenv';

  // Load e2e-specific env vars (never reuse .env.dev — prevents LIVEKIT_E2E_MOCK leakage)
  dotenv.config({ path: '.env.test.e2e' });

  export default defineConfig({
    testDir: './e2e',
    outputDir: './playwright-results',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

    projects: [
      {
        name: 'setup',
        testMatch: '**/*.setup.ts',
      },
      {
        name: 'e2e',
        dependencies: ['setup'],
        use: {
          ...devices['Desktop Chrome'],
          storageState: 'playwright/.auth/host.json',
          baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        },
      },
    ],

    webServer: {
      command: 'pnpm --filter @yelli/web dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Propagate mock guard to the Next.js dev server process
        LIVEKIT_E2E_MOCK: process.env.LIVEKIT_E2E_MOCK ?? 'false',
      },
    },
  });
  ```

- [ ] **Add Playwright entries to `.gitignore`**

  Append to the existing AI artifacts section:

  ```gitignore
  # ─── Playwright e2e artifacts (local, never committed) ───
  playwright/.auth/
  playwright-results/
  playwright-report/
  .env.test.e2e
  ```

  Do NOT remove or reorder existing entries.

### Verification

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli

# Playwright recognises the config (0 tests is expected — specs come in later commits)
pnpm playwright --list 2>&1 | head -10

# Vitest suite must be unaffected
pnpm test --run 2>&1 | tail -5
```

Expected:
- `pnpm playwright --list` exits 0, shows 0 tests or "No tests found" (not an error at this stage)
- Vitest: `53 passed`

### Commit

```
chore(e2e): install playwright, add config and gitignore entries

- pnpm add -D -w @playwright/test; install chromium
- playwright.config.ts: two projects (setup + e2e), webServer, dotenv
- root package.json: test:e2e, test:e2e:ui scripts
- .gitignore: playwright/.auth/, playwright-results/, .env.test.e2e
```

**STOP.** Do not start Task 2 in this session.

---

## Task 2 — Auth setup spec + env template

**Token budget:** ~10K  
**TDD phase:** Not applicable (infrastructure fixture)

### Context to read (Sonnet subagent)

- `playwright.config.ts` (just created — confirm storageState path)
- `apps/web/src/app/` login page structure (locate the username/password field labels)
- `docs/superpowers/specs/2026-05-26-playwright-e2e-design.md` §5 (auth.setup.ts spec)

### Steps

- [ ] **Create `.env.test.e2e.example` at repo root**

  ```bash
  # Template — developers copy to .env.test.e2e and fill in real values
  # .env.test.e2e is gitignored (contains WEBMASTER_PASSWORD — never commit)
  WEBMASTER_PASSWORD=your-webmaster-password-here
  PLAYWRIGHT_BASE_URL=http://localhost:3000
  # LIVEKIT_E2E_MOCK=true must NOT be set in .env.staging or .env.prod
  LIVEKIT_E2E_MOCK=true
  ```

  `.env.test.e2e.example` IS committed — it is a template with placeholders only.

- [ ] **Create `e2e/auth.setup.ts`**

  ```typescript
  import { test as setup, expect } from '@playwright/test';
  import * as path from 'path';

  const authFile = path.join(__dirname, '../playwright/.auth/host.json');

  setup('authenticate as webmaster', async ({ page }) => {
    const password = process.env.WEBMASTER_PASSWORD;
    if (!password) {
      throw new Error(
        'WEBMASTER_PASSWORD is not set. Copy .env.test.e2e.example to .env.test.e2e and fill in the value.'
      );
    }

    await page.goto('/login');

    // Primary selectors (Auth.js Credentials provider form labels)
    const usernameField =
      page.getByLabel('Username').or(page.locator('input[name="username"]')).first();
    const passwordField =
      page.getByLabel('Password').or(page.locator('input[name="password"]')).first();

    await usernameField.fill('webmaster');
    await passwordField.fill(password);

    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect to the authenticated app shell
    await page.waitForURL(/\/app/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login/);

    // Persist authentication state for all e2e specs
    await page.context().storageState({ path: authFile });
  });
  ```

- [ ] **Create `playwright/.auth/.gitkeep`** so the directory is tracked (the `host.json` itself is gitignored)

  ```bash
  mkdir -p /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/playwright/.auth
  touch /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/playwright/.auth/.gitkeep
  ```

  Verify `.gitignore` already contains `playwright/.auth/` (added in Task 1).
  The `.gitkeep` is exempt because it contains no credentials — only the `host.json` is gitignored.

  Add a negation rule to `.gitignore` so `.gitkeep` is committed:

  ```gitignore
  playwright/.auth/
  !playwright/.auth/.gitkeep
  ```

- [ ] **Confirm `.env.test.e2e` exists locally** (human action, not in commit)

  Subagent should output a reminder:
  > "Before running the setup spec, copy `.env.test.e2e.example` to `.env.test.e2e` and set
  > `WEBMASTER_PASSWORD` to the webmaster account password from CREDENTIALS.md."

### Verification

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli

# Confirm example file is committed-safe (no real secrets)
grep -v "your-" .env.test.e2e.example || echo "Template looks clean"

# Type check e2e dir (requires @playwright/test types)
pnpm tsc --noEmit --project tsconfig.json 2>&1 | grep "auth.setup" || echo "No type errors in auth.setup"

# Vitest unaffected
pnpm test --run 2>&1 | tail -5
```

Expected:
- No TypeScript errors referencing `auth.setup.ts`
- Vitest: `53 passed`
- (Running the setup spec itself requires `.env.test.e2e` with real password — deferred to manual verification)

### Commit

```
feat(e2e): auth setup — login as webmaster and save storageState

- .env.test.e2e.example: template with WEBMASTER_PASSWORD placeholder
- e2e/auth.setup.ts: fills login form, waits for /app redirect, saves storageState
- playwright/.auth/.gitkeep: track dir without committing host.json
- .gitignore: negate .gitkeep so it is committed
```

**STOP.** Do not start Task 3 in this session.

---

## Task 3 — LIVEKIT_E2E_MOCK guard in egress-client.ts (TDD)

**Token budget:** ~14K  
**TDD phase:** RED → GREEN → REFACTOR

### Context to read (Sonnet subagent)

- `apps/web/src/lib/livekit/egress-client.ts` (full file — understand `startEgress` / `stopEgress` signatures)
- `docs/superpowers/specs/2026-05-26-playwright-e2e-design.md` §5 (egress-client guard spec)
- `apps/web/vitest.config.ts` or root `vitest.config.ts` (confirm test environment and include paths)

### RED phase — write failing tests first

- [ ] **Create `apps/web/src/lib/livekit/egress-client.test.ts`**

  ```typescript
  import { describe, it, expect, afterEach } from 'vitest';

  // Will fail until the guard is implemented
  describe('egress-client LIVEKIT_E2E_MOCK guard', () => {
    afterEach(() => {
      delete process.env.LIVEKIT_E2E_MOCK;
    });

    it('startEgress returns a synthetic egress_id when LIVEKIT_E2E_MOCK=true', async () => {
      process.env.LIVEKIT_E2E_MOCK = 'true';
      // Import after setting env var (or use vi.resetModules if module is cached)
      const { startEgress } = await import('./egress-client');
      const result = await startEgress({ roomName: 'test-room', participantIdentity: 'host' });
      expect(result.egress_id).toMatch(/^e2e-mock-/);
    });

    it('stopEgress resolves without throwing when LIVEKIT_E2E_MOCK=true', async () => {
      process.env.LIVEKIT_E2E_MOCK = 'true';
      const { stopEgress } = await import('./egress-client');
      await expect(stopEgress({ egressId: 'e2e-mock-test' })).resolves.not.toThrow();
    });

    it('startEgress does NOT use mock when LIVEKIT_E2E_MOCK is unset', async () => {
      // Guard must be absent when env var is not set — real SDK path (will throw in unit test env)
      delete process.env.LIVEKIT_E2E_MOCK;
      const { startEgress } = await import('./egress-client');
      // In unit test env, real SDK throws (no LiveKit server) — that is the expected behaviour
      await expect(startEgress({ roomName: 'real-room', participantIdentity: 'host' })).rejects.toThrow();
    });
  });
  ```

- [ ] **Run tests and confirm RED**

  ```bash
  cd /home/me/UbtentuDevFiles/1_COMPANY_DEV/Yelli
  pnpm test --run apps/web/src/lib/livekit/egress-client.test.ts 2>&1
  ```

  Expected: 2 failures (first two tests — guard not yet implemented), 1 pass (third test — real path already throws).

### GREEN phase — implement the guard

- [ ] **Modify `apps/web/src/lib/livekit/egress-client.ts`**

  Add the mock guard at the top of `startEgress` and `stopEgress` (exact implementation depends on current function signatures — read the file first):

  ```typescript
  // Inside startEgress (before any real SDK call):
  if (process.env.LIVEKIT_E2E_MOCK === 'true') {
    // Return a synthetic egress row — caller (tRPC procedure) handles DB writes
    return {
      egress_id: `e2e-mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }
  // ... real SDK code continues below

  // Inside stopEgress (before any real SDK call):
  if (process.env.LIVEKIT_E2E_MOCK === 'true') {
    return; // No-op — caller handles DB status update
  }
  // ... real SDK code continues below
  ```

  The guard must use exact string comparison (`=== 'true'`), never truthy check.

- [ ] **Run tests and confirm GREEN**

  ```bash
  pnpm test --run apps/web/src/lib/livekit/egress-client.test.ts 2>&1
  ```

  Expected: `3 passed`.

- [ ] **Run full Vitest suite — confirm no regressions**

  ```bash
  pnpm test --run 2>&1 | tail -8
  ```

  Expected: `54 passed` (53 original + 3 new = 56 total individual tests, or the test file count increases by 1 — exact count depends on how Vitest groups them; no failures is the hard requirement).

### Verification

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli

# Guard appears in egress-client
grep -n "LIVEKIT_E2E_MOCK" apps/web/src/lib/livekit/egress-client.ts

# TypeScript clean
pnpm --filter @yelli/web typecheck 2>&1 | tail -5
```

Expected:
- At least 2 grep matches (one in `startEgress`, one in `stopEgress`)
- TypeScript: `0 errors`

### Commit

```
feat(livekit): LIVEKIT_E2E_MOCK guard in egress-client.ts

- startEgress: returns synthetic egress_id (e2e-mock- prefix) when guard active
- stopEgress: no-op when guard active; caller handles DB status update
- egress-client.test.ts: 3 unit tests (RED→GREEN verified)
- Guard uses strict string comparison (=== 'true') to prevent accidental activation
```

**STOP.** Do not start Task 4 in this session.

---

## Task 4 — Seed fixtures: seed-meeting.ts + seed-recording.ts

**Token budget:** ~12K  
**TDD phase:** Not applicable (test helpers, not specs)

### Context to read (Sonnet subagent)

- `apps/web/src/server/routers/meetings.ts` — `meetings.create` procedure input schema
- `apps/web/src/server/routers/recordings.ts` — `.start`, `.stop`, `.softDelete` procedure input schemas
- `docs/superpowers/specs/2026-05-26-playwright-e2e-design.md` §5 (fixture design)
- `playwright.config.ts` (confirm `baseURL`)

### Steps

- [ ] **Create `e2e/fixtures/seed-meeting.ts`**

  ```typescript
  import type { APIRequestContext } from '@playwright/test';

  export interface SeededMeeting {
    id: string;
    cleanup: () => Promise<void>;
  }

  /**
   * Creates a Meeting row via the tRPC meetings.create procedure.
   * Use in test beforeEach; always call cleanup() in afterEach.
   *
   * Security: uses storageState session (webmaster) — no raw DB writes.
   */
  export async function seedMeeting(request: APIRequestContext): Promise<SeededMeeting> {
    const res = await request.post('/api/trpc/meetings.create', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        title: `E2E Test Meeting ${Date.now()}`,
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    if (!res.ok()) {
      throw new Error(`meetings.create failed: ${res.status()} ${await res.text()}`);
    }

    const body = await res.json();
    // tRPC response shape: { result: { data: { id, ... } } }
    const meeting = body?.result?.data ?? body;
    const id: string = meeting.id;

    return {
      id,
      cleanup: async () => {
        // Soft-delete or archive the meeting — exact procedure depends on router
        // If no delete procedure: leave row (webmaster data, not user-visible noise)
        // Adjust once router is confirmed to have a delete/archive procedure.
      },
    };
  }
  ```

  > **Note to subagent:** Inspect `meetings.ts` router for the exact `create` input shape and
  > whether a `delete` procedure exists. Adjust the `data` payload and `cleanup` accordingly.
  > If the router uses a different tRPC URL pattern (batch vs non-batch), adjust the request path.

- [ ] **Create `e2e/fixtures/seed-recording.ts`**

  ```typescript
  import type { APIRequestContext } from '@playwright/test';

  export interface SeededRecording {
    id: string;
    egressId: string;
    cleanup: () => Promise<void>;
  }

  /**
   * Seeds a completed Recording row using real tRPC procedures:
   * 1. recordings.start → creates row with status RECORDING
   * 2. recordings.stop  → updates status to COMPLETED
   *
   * The LIVEKIT_E2E_MOCK=true guard in egress-client.ts means no real LiveKit SDK calls occur.
   * The egress_id and file_path will have the 'e2e-mock-' prefix for easy identification.
   *
   * Cleanup uses recordings.softDelete (tRPC) — no direct DB writes.
   */
  export async function seedRecording(
    request: APIRequestContext,
    meetingId: string
  ): Promise<SeededRecording> {
    // Step 1: Start recording
    const startRes = await request.post('/api/trpc/recordings.start', {
      headers: { 'Content-Type': 'application/json' },
      data: { meetingId },
    });

    if (!startRes.ok()) {
      throw new Error(`recordings.start failed: ${startRes.status()} ${await startRes.text()}`);
    }

    const startBody = await startRes.json();
    const recording = startBody?.result?.data ?? startBody;
    const id: string = recording.id;
    const egressId: string = recording.egressId ?? recording.egress_id;

    // Step 2: Stop recording (marks as COMPLETED)
    const stopRes = await request.post('/api/trpc/recordings.stop', {
      headers: { 'Content-Type': 'application/json' },
      data: { recordingId: id },
    });

    if (!stopRes.ok()) {
      throw new Error(`recordings.stop failed: ${stopRes.status()} ${await stopRes.text()}`);
    }

    return {
      id,
      egressId,
      cleanup: async () => {
        const res = await request.post('/api/trpc/recordings.softDelete', {
          headers: { 'Content-Type': 'application/json' },
          data: { recordingId: id },
        });
        if (!res.ok()) {
          console.warn(`recordings.softDelete cleanup failed for ${id}: ${res.status()}`);
        }
      },
    };
  }
  ```

### Verification

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli

# TypeScript: fixtures must resolve types cleanly
pnpm tsc --noEmit 2>&1 | grep "seed-" || echo "No type errors in seed fixtures"

# Vitest unaffected
pnpm test --run 2>&1 | tail -5
```

Expected:
- No TypeScript errors referencing fixture files
- Vitest: same pass count as Task 3 exit state

### Commit

```
feat(e2e): seed fixtures — seed-meeting.ts and seed-recording.ts

- seed-meeting.ts: creates Meeting via meetings.create tRPC procedure
- seed-recording.ts: start + stop recording via tRPC (LIVEKIT_E2E_MOCK path)
- cleanup uses recordings.softDelete — no direct DB writes from test code
- e2e-mock- prefix in egressId enables easy identification of test data
```

**STOP.** Do not start Task 5 in this session.

---

## Task 5 — Spec (a): recording start/stop flow

**Token budget:** ~16K  
**TDD phase:** Write spec first (RED — will fail until `LIVEKIT_E2E_MOCK` is set in env), then verify GREEN with env populated

### Context to read (Sonnet subagent)

- `e2e/fixtures/seed-meeting.ts` (just created — import path)
- `e2e/fixtures/seed-recording.ts` (just created — import path)
- `apps/web/src/app/app/recordings/page.tsx` — DOM structure of the recordings feed (locate row selector)
- `docs/superpowers/specs/2026-05-26-playwright-e2e-design.md` §5 spec (a) detail
- `playwright.config.ts` (confirm storageState and baseURL)

### Steps

- [ ] **Create `e2e/recording-flow.spec.ts`**

  ```typescript
  import { test, expect } from '@playwright/test';
  import { seedMeeting } from './fixtures/seed-meeting';
  import { seedRecording } from './fixtures/seed-recording';

  /**
   * Spec (a): Recording start/stop lifecycle
   *
   * Strategy: API-driven (APIRequestContext) for start/stop — avoids MeetingRoom
   * LiveKit client complexity. UI assertion verifies the row appears in /app/recordings.
   *
   * LIVEKIT_E2E_MOCK=true must be set in .env.test.e2e for this spec to pass.
   * The webServer block in playwright.config.ts propagates the var to Next.js.
   */
  test.describe('Recording lifecycle', () => {
    let meetingId: string;
    let recordingId: string;
    let cleanupMeeting: () => Promise<void>;
    let cleanupRecording: () => Promise<void>;

    test.beforeEach(async ({ request }) => {
      const meeting = await seedMeeting(request);
      meetingId = meeting.id;
      cleanupMeeting = meeting.cleanup;
    });

    test.afterEach(async () => {
      if (cleanupRecording) await cleanupRecording();
      if (cleanupMeeting) await cleanupMeeting();
    });

    test('completed recording appears in /app/recordings feed', async ({ page, request }) => {
      // Seed a completed recording via API (LIVEKIT_E2E_MOCK path)
      const recording = await seedRecording(request, meetingId);
      recordingId = recording.id;
      cleanupRecording = recording.cleanup;

      // Navigate to recordings feed and assert the row is visible
      await page.goto('/app/recordings');
      await page.waitForLoadState('networkidle');

      // Row identified by recording ID (data attribute) or egress_id text
      const row = page
        .getByTestId(`recording-row-${recordingId}`)
        .or(page.locator(`[data-recording-id="${recordingId}"]`))
        .or(page.getByText(recording.egressId))
        .first();

      await expect(row).toBeVisible({ timeout: 10_000 });
    });

    test('recording with LIVEKIT_E2E_MOCK guard does not call real LiveKit SDK', async ({
      request,
    }) => {
      // This test is a smoke-test: if the mock guard is absent, recordings.start
      // will throw (no real LiveKit server in test env) and the fixture will fail.
      // If the fixture succeeds, the guard is active.
      const recording = await seedRecording(request, meetingId);
      recordingId = recording.id;
      cleanupRecording = recording.cleanup;

      expect(recording.egressId).toMatch(/^e2e-mock-/);
    });
  });
  ```

  > **Selector note:** If `page.tsx` does not yet have `data-testid` or `data-recording-id`
  > attributes, add them to the recordings table row in that file as part of this commit.
  > Prefer `data-testid` over brittle text selectors for the row container.

- [ ] **Add `data-testid` to recordings feed if needed**

  In `apps/web/src/app/app/recordings/page.tsx` (or the table component):
  - Add `data-testid={`recording-row-${recording.id}`}` to the row element
  - This is a non-breaking, additive change

### Verification

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli

# TypeScript clean (spec imports fixtures and @playwright/test)
pnpm tsc --noEmit 2>&1 | grep "recording-flow" || echo "No type errors"

# Vitest unaffected
pnpm test --run 2>&1 | tail -5

# List spec — confirms Playwright sees it (requires playwright.config.ts and @playwright/test installed)
pnpm playwright --list 2>&1 | grep "recording-flow"
```

Expected:
- TypeScript: 0 errors
- Vitest: same pass count (no regressions)
- `pnpm playwright --list` shows `recording-flow.spec.ts` in output

> **Manual GREEN verification** (requires running dev server with `.env.test.e2e` populated):
> ```bash
> pnpm test:e2e --project=e2e --grep "Recording lifecycle"
> ```
> Expected: 2 passed. If `WEBMASTER_PASSWORD` is not set locally, tests will fail at auth —
> populate `.env.test.e2e` with the value from `CREDENTIALS.md` "First Admin Account" before running.

### Commit

```
feat(e2e): spec a — recording start/stop lifecycle via APIRequestContext

- recording-flow.spec.ts: seeds meeting + recording via fixtures, asserts row in /app/recordings
- recordings/page.tsx: data-testid on row element for resilient selector
- uses LIVEKIT_E2E_MOCK path — no real LiveKit SDK calls in test env
```

**STOP.** Do not start Task 6 in this session.

---

## Task 6 — Spec (b): recording soft-delete via AlertDialog

**Token budget:** ~18K  
**TDD phase:** Write spec (RED), verify selectors match existing component, confirm GREEN

### Context to read (Sonnet subagent)

- `apps/web/src/components/recordings/recording-delete-button.tsx` — verify `aria-label` and dialog structure
- `apps/web/src/components/recordings/recording-delete-copy.ts` — import `recordingDeleteCopy` constants
- `e2e/fixtures/seed-meeting.ts` and `e2e/fixtures/seed-recording.ts` (confirm imports)
- `docs/superpowers/specs/2026-05-26-playwright-e2e-design.md` §5 spec (b) detail

### Steps

- [ ] **Read `recording-delete-copy.ts` to capture exact constant values**

  The spec must use the imported constants (not hardcoded strings) so selector text stays in sync
  with the component. Capture:
  - `recordingDeleteCopy.triggerLabel` — used as `aria-label` on the trigger button
  - `recordingDeleteCopy.dialogTitle`
  - `recordingDeleteCopy.dialogDescription`
  - `recordingDeleteCopy.confirmLabel` — confirm button text

- [ ] **Create `e2e/recording-delete.spec.ts`**

  ```typescript
  import { test, expect } from '@playwright/test';
  import { seedMeeting } from './fixtures/seed-meeting';
  import { seedRecording } from './fixtures/seed-recording';
  // Import constants so selectors stay in sync with the component
  import { recordingDeleteCopy } from '../apps/web/src/components/recordings/recording-delete-copy';

  /**
   * Spec (b): Soft-delete recording via AlertDialog confirmation
   *
   * Exercises the full UI path:
   * 1. Navigate to /app/recordings
   * 2. Locate the delete trigger button (aria-label from recordingDeleteCopy)
   * 3. Click trigger → AlertDialog opens
   * 4. Assert dialog title and description
   * 5. Click confirm → row disappears from the list
   *
   * Cleanup: recordings.softDelete is idempotent — calling it again on an already-deleted
   * row is safe (the fixture cleanup will no-op or succeed silently).
   */
  test.describe('Recording soft-delete', () => {
    let meetingId: string;
    let recordingId: string;
    let cleanupMeeting: () => Promise<void>;
    let cleanupRecording: () => Promise<void>;

    test.beforeEach(async ({ request }) => {
      const meeting = await seedMeeting(request);
      meetingId = meeting.id;
      cleanupMeeting = meeting.cleanup;

      const recording = await seedRecording(request, meetingId);
      recordingId = recording.id;
      cleanupRecording = recording.cleanup;
    });

    test.afterEach(async () => {
      // Cleanup runs even if the spec deleted the recording (idempotent)
      if (cleanupRecording) await cleanupRecording();
      if (cleanupMeeting) await cleanupMeeting();
    });

    test('soft-deletes a recording via AlertDialog and removes it from the list', async ({
      page,
    }) => {
      await page.goto('/app/recordings');
      await page.waitForLoadState('networkidle');

      // Locate the recording row first
      const row = page
        .getByTestId(`recording-row-${recordingId}`)
        .or(page.locator(`[data-recording-id="${recordingId}"]`))
        .first();

      await expect(row).toBeVisible({ timeout: 10_000 });

      // Trigger delete button (aria-label from recordingDeleteCopy constant)
      const trigger = row.getByRole('button', {
        name: recordingDeleteCopy.triggerLabel,
      });
      await trigger.click();

      // AlertDialog should open
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(recordingDeleteCopy.dialogTitle)).toBeVisible();
      await expect(dialog.getByText(recordingDeleteCopy.dialogDescription)).toBeVisible();

      // Confirm deletion
      const confirmBtn = dialog.getByRole('button', {
        name: recordingDeleteCopy.confirmLabel,
      });
      await confirmBtn.click();

      // Row must disappear from the feed
      await expect(row).not.toBeVisible({ timeout: 10_000 });
    });

    test('cancel in AlertDialog does NOT delete the recording', async ({ page }) => {
      await page.goto('/app/recordings');
      await page.waitForLoadState('networkidle');

      const row = page
        .getByTestId(`recording-row-${recordingId}`)
        .or(page.locator(`[data-recording-id="${recordingId}"]`))
        .first();

      await expect(row).toBeVisible({ timeout: 10_000 });

      const trigger = row.getByRole('button', {
        name: recordingDeleteCopy.triggerLabel,
      });
      await trigger.click();

      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();

      // Cancel — dialog closes, row still present
      await dialog.getByRole('button', { name: /cancel/i }).click();
      await expect(dialog).not.toBeVisible();
      await expect(row).toBeVisible();
    });
  });
  ```

- [ ] **Verify import path for `recording-delete-copy`**

  From `e2e/recording-delete.spec.ts`, the relative path to the component file must resolve.
  If the path is wrong, adjust:

  ```typescript
  // Adjust path depth based on monorepo layout:
  import { recordingDeleteCopy } from '../apps/web/src/components/recordings/recording-delete-copy';
  ```

  Alternatively, if TypeScript path aliases are set, use the alias.

### Verification

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli

# TypeScript: spec imports must resolve
pnpm tsc --noEmit 2>&1 | grep "recording-delete" || echo "No type errors"

# Playwright lists both specs
pnpm playwright --list 2>&1 | grep -E "recording-(flow|delete)"

# Vitest unaffected
pnpm test --run 2>&1 | tail -5
```

Expected:
- TypeScript: 0 errors
- Both specs visible in `--list` output
- Vitest: no regressions

> **Manual GREEN verification** (requires `.env.test.e2e` with `WEBMASTER_PASSWORD`):
> ```bash
> pnpm test:e2e --project=e2e --grep "soft-delete"
> ```
> Expected: 2 passed.

### Commit

```
feat(e2e): spec b — recording soft-delete via AlertDialog

- recording-delete.spec.ts: seeds recording, clicks delete trigger, confirms via AlertDialog
- selectors use recordingDeleteCopy constants — stays in sync with component text changes
- cancel test verifies row survives dialog dismissal
- cleanup is idempotent (softDelete safe to call twice)
```

**STOP.** Do not start Task 7 in this session.

---

## Task 7 — Governance close-out (no code commit — separate session)

**Token budget:** ~8K
**TDD phase:** Not applicable
**Note:** Task 7 is NOT a code commit. It is the governance close-out that happens AFTER all 6 code commits land on `feat/e2e-playwright`. Run this in a separate Claude Code session to keep the writing model fresh.

### Context to read (Sonnet subagent)

- `.cline/memory/lessons.md` (tail — prepare `LIVEKIT_E2E_MOCK` decision entry)
- `docs/CHANGELOG_AI.md` (tail — prepare Phase 8 Batch B sub-4 entry)
- `docs/IMPLEMENTATION_MAP.md` (tail — prepare Phase 8 Batch B sub-4 entry)
- `.cline/STATE.md` (full — prepare phase-complete update)

### Steps

- [ ] **Append to `docs/CHANGELOG_AI.md`**

  ```markdown
  ## 2026-05-27 — Phase 8 Batch B sub-4: Playwright e2e install + first 2 specs
  - Agent:          CLAUDE_CODE
  - Why:            Install Playwright, add LIVEKIT_E2E_MOCK guard, ship two green e2e specs (local-only — CI deferred)
  - Files added:    playwright.config.ts, e2e/auth.setup.ts, e2e/fixtures/seed-meeting.ts,
                    e2e/fixtures/seed-recording.ts, e2e/recording-flow.spec.ts,
                    e2e/recording-delete.spec.ts, playwright/.auth/.gitkeep,
                    .env.test.e2e.example, apps/web/src/lib/livekit/egress-client.test.ts
  - Files modified: package.json (scripts), .gitignore (playwright entries),
                    apps/web/src/lib/livekit/egress-client.ts (LIVEKIT_E2E_MOCK guard),
                    apps/web/src/app/app/recordings/page.tsx (data-testid)
  - Schema/migrations: none
  - Errors encountered: none
  - Errors resolved: none
  ```

- [ ] **Update `docs/IMPLEMENTATION_MAP.md`**

  Add entry under Phase 8 Batch B:

  ```markdown
  ### Phase 8 Batch B sub-4 — Playwright e2e install + first 2 specs ✅
  - Playwright @playwright/test installed at workspace root (chromium only)
  - playwright.config.ts: two projects (setup + e2e), webServer, dotenv, storageState
  - egress-client.ts: LIVEKIT_E2E_MOCK guard (startEgress + stopEgress), unit tested
  - e2e/auth.setup.ts: login as webmaster, saves playwright/.auth/host.json
  - e2e/fixtures/seed-meeting.ts + seed-recording.ts: API-driven test data via tRPC
  - e2e/recording-flow.spec.ts: spec (a) — recording lifecycle + UI assertion in /app/recordings
  - e2e/recording-delete.spec.ts: spec (b) — soft-delete via AlertDialog + cancel test

  **Follow-up (NOT in sub-4):** Playwright CI integration. Add a `playwright` job to
  `.github/workflows/ci.yml` with `LIVEKIT_E2E_MOCK=true` inline + `WEBMASTER_PASSWORD`
  GitHub Secret. Tracked as a separate PR after sub-4 ships locally.
  ```

- [ ] **Rewrite `.cline/STATE.md`**

  ```
  PHASE:        Phase 8 Batch B sub-4 complete (CI integration deferred)
  LAST_DONE:    Playwright e2e: 2 specs green locally, LIVEKIT_E2E_MOCK guard shipped
  NEXT:         Either (a) Playwright CI integration follow-up PR, or
                (b) Phase 8 Batch B sub-5 / overlay cluster / recordings filter UI — human picks
  BLOCKERS:     none
  GIT_BRANCH:   main (feat/e2e-playwright squash-merged)
  CHECKPOINT_TYPE: full
  FILES_TOUCHED:   [playwright.config.ts, e2e/auth.setup.ts, e2e/fixtures/seed-meeting.ts,
                    e2e/fixtures/seed-recording.ts, e2e/recording-flow.spec.ts,
                    e2e/recording-delete.spec.ts, apps/web/src/lib/livekit/egress-client.ts,
                    apps/web/src/lib/livekit/egress-client.test.ts,
                    apps/web/src/app/app/recordings/page.tsx,
                    package.json, .gitignore, .env.test.e2e.example]
  TIER_CLASSIFICATION: 2 — moderate
  TOKEN_ESTIMATE: ~72K consumed across 6 sub-tasks
  ```

- [ ] **Append to `.cline/memory/lessons.md`**

  ```markdown
  ## 2026-05-27 — 🟤 LIVEKIT_E2E_MOCK guard pattern for LiveKit SDK isolation

  - Type:      🟤 decision
  - Phase:     Phase 8 Batch B sub-4
  - Files:     apps/web/src/lib/livekit/egress-client.ts, playwright.config.ts
  - Concepts:  playwright, livekit, e2e, mock, egress
  - Narrative: Real LiveKit SDK calls cannot be made in e2e test environments (no LiveKit server
    running in the test browser, no real WebRTC peer negotiation). Guard pattern:
    `if (process.env.LIVEKIT_E2E_MOCK === 'true') return synthetic result`. The guard MUST use
    strict string comparison (=== 'true'). The env var is set in `.env.test.e2e` only — it
    must NEVER appear in .env.dev, .env.staging, or .env.prod. The webServer block in
    playwright.config.ts propagates the var to the Next.js dev server process, ensuring the
    guard is active during e2e runs. Spec (a) goes through APIRequestContext, not the
    in-meeting UI — the in-meeting "Start recording" button still requires a real LiveKit
    room connection and remains covered by manual Phase 6 visual QA.
  ```

### Governance self-check

- [ ] `CHANGELOG_AI.md` — last entry timestamp matches today
- [ ] `IMPLEMENTATION_MAP.md` — Phase 8 Batch B sub-4 entry written + CI follow-up flagged
- [ ] `STATE.md` — rewritten with `PHASE="Phase 8 Batch B sub-4 complete (CI integration deferred)"`
- [ ] `lessons.md` — LIVEKIT_E2E_MOCK decision entry written

### Squash-merge

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli
git checkout main
git merge --squash feat/e2e-playwright
git commit -m "feat(e2e): Phase 8 Batch B sub-4 — Playwright install + 2 e2e specs (local-only)

- Install @playwright/test (chromium), playwright.config.ts, auth setup
- LIVEKIT_E2E_MOCK guard in egress-client.ts (unit tested, RED→GREEN)
- recording-flow.spec.ts: API-driven lifecycle, UI assertion
- recording-delete.spec.ts: AlertDialog soft-delete, cancel test
- CI integration deferred to follow-up PR
- Governance: CHANGELOG + MAP + STATE + lessons updated"
git branch -d feat/e2e-playwright
```

**STOP.** Squash-merge as shown above, then close session.

---

## Post-merge governance checklist

Run after squash-merge to `main`:

- [ ] `git log --oneline -3` — confirm single squash commit on `main`
- [ ] `pnpm test --run 2>&1 | tail -5` — Vitest still passing (≥53 passed, no failures)
- [ ] `pnpm playwright --list 2>&1` — shows `recording-flow.spec.ts` and `recording-delete.spec.ts`
- [ ] `grep -c "LIVEKIT_E2E_MOCK" apps/web/src/lib/livekit/egress-client.ts` — returns ≥ 2
- [ ] `grep "playwright" .gitignore` — confirms gitignore entries present
- [ ] `git status` — working tree clean, no untracked `.env.test.e2e` or `playwright/.auth/host.json`
- [ ] `CREDENTIALS.md` is gitignored — `grep CREDENTIALS .gitignore`
- [ ] **CI integration follow-up** is tracked in IMPLEMENTATION_MAP.md (Playwright job for `.github/workflows/ci.yml` + `WEBMASTER_PASSWORD` GitHub Secret) — separate PR, not in sub-4

---

## Open risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Auth form selectors change (labels renamed) | Low | High | `auth.setup.ts` uses `.or()` fallback chain; failing auth gives clear error |
| Operator runs e2e locally without `WEBMASTER_PASSWORD` in `.env.test.e2e` | Medium | Low | Auth setup fails fast with a clear error; documented in plan README + `.env.test.e2e.example` |
| `recordings.start` tRPC path differs from `/api/trpc/recordings.start` | Low | Medium | Subagent reads router file; adjusts URL pattern before writing fixtures |
| `recording-delete-copy.ts` import path wrong from `e2e/` directory | Low | Medium | TypeScript check in Task 6 verification catches this before commit |
| Vitest module caching breaks LIVEKIT_E2E_MOCK env isolation | Low | Medium | `afterEach` deletes env var; add `vi.resetModules()` if caching causes flakiness |
| Dev server port 3000 conflicts with another process | Low | Medium | `reuseExistingServer: !process.env.CI` in config; CI always starts fresh |
| `meetings.create` input shape differs from fixture assumption | Low | High | Subagent reads router file in Task 4; adjusts payload before writing |
| `data-testid` not present on recordings page row | Medium | Medium | Task 5 explicitly adds it; selector has `.or()` fallback on `data-recording-id` |

---

## Rollback plan

If any commit introduces a regression, roll back by reverting the squash commit:

```bash
git revert HEAD --no-commit
git commit -m "revert: rollback feat/e2e-playwright (Phase 8 Batch B sub-4)"
```

**Rollback scope assessment:**

| File group | Rollback impact |
|---|---|
| `playwright.config.ts` + `package.json` scripts | Remove scripts, delete config — Vitest unaffected |
| `e2e/` directory | Delete entire directory — no production code touched |
| `apps/web/src/lib/livekit/egress-client.ts` guard | Remove guard lines — existing LiveKit behaviour restored |
| `apps/web/src/lib/livekit/egress-client.test.ts` | Delete file — Vitest suite shrinks by 3 tests |
| `apps/web/src/app/app/recordings/page.tsx` `data-testid` | Remove attribute — purely additive, no functional change |
| `.gitignore` playwright entries | Remove 4 lines — no functional impact |

Vitest suite and all existing production behaviour are fully preserved by rollback.
`LIVEKIT_E2E_MOCK` env var is only active when explicitly set — removing the guard returns
egress calls to the real SDK path (which already existed before this batch).
