# Implementation Map — Yelli

# Current build state. Rewritten after every phase or feature update (Rule 3).

# ---

## Project Status

Phase: **Phase 7 active — six Feature Updates merged.** Post-Phase-4 dev bring-up complete; production build passes end-to-end. Phase 7 #1 (auth.register tRPC wire-up + register page submit) squash-merged as `ce709ff`. Phase 7 #2 (vitest@4 infrastructure + 5-case auth.register smoke coverage) squash-merged as `81c0279` — closes Rule 25 TDD deferral. Phase 7 #3 (/app/meetings/new — 7-case meetings.test.ts + react-hook-form + zodResolver port + shadcn Form primitive in @yelli/ui + shared MeetingCreateClientInputSchema) squash-merged as `8709595` — closes UI Rule #4 gap for the meetings creation flow. Phase 7 #4 (forgot-password + reset-password tRPC + UI — new PasswordResetToken Prisma model + migration, 8 new test cases bringing the suite to 20/20, /forgot-password page wired to mutation, new /reset-password/[token] server + client form using shadcn Form + RHF + Zod, lazy nodemailer transport wrapper, security_version invalidation on successful reset) squash-merged as `2cdc3c3` — closes the auth quartet (register/login/forgot/reset). Phase 7 #5 (coverage threshold gate — added `thresholds` block to apps/web/vitest.config.ts with global floor 12/6/12/12 and per-file gate src/server/trpc/routers/auth.ts at 100/75/100/100, new `test:coverage` script + turbo task, new `coverage` CI job that runs the gate and uploads HTML/lcov artifact for 14 days) squash-merged as `78fc022` — locks the 20-test safety net against silent regression before Phase 8. Phase 7 #6 (per-user 24h reset-request cap on authRouter.requestPasswordReset — adds 5/24h cap as defence-in-depth on top of the per-email LRU rate limit; cap-met returns ok silently and skips mint + email send, preserving the no-enumeration response shape) squash-merged as `5325b8c` — closes the email-bomb gap where attackers passing Turnstile could space requests past the 10/min LRU and still flood a known user. Sub-Phase-5 validation passes (8 of 9) — full Phase 5/6 gated on CREDENTIALS.md ⏳ placeholders.

Prior status: **4 Part 8 complete — Phase 4 fully done.** CI/CD workflows + MANIFEST.txt + README.md
+ final IMPLEMENTATION_MAP rewrite all generated. Repository is now structurally complete and
ready for Phase 5 validation. `.github/workflows/ci.yml` runs governance gates (validate-inputs,
check-product-sync, hydration-lint), the Turbo quality matrix (lint/typecheck/test/build), and a
HIGH+CRITICAL CVE audit on every push to main and every PR. `.github/workflows/docker-publish.yml`
pushes three Docker Hub tags per merge to main — `:latest`, `:staging-latest`, `:sha-<short>` —
sized for the V27 Komodo flow (staging auto_update: true polls Docker Hub; prod is manual Deploy
from Komodo UI). `MANIFEST.txt` enumerates every tracked file across all 8 Phase-4 Parts, with
[GIT]/[LOCAL]/[SOFT] tags and a grand total of ~255 tracked files. `README.md` is the
project-root developer onboarding document — quick start, daily commands, Phase 7 loop,
architecture summary, codebase intelligence (SocratiCode/Context7/shadcn MCP), file structure,
phase status, and the Phase-5 credential checklist. SocratiCode initial index trigger is
documented as a post-merge human action (MCP not loaded in this session — see Next Step below).

App: Yelli (instant video intercom SaaS + self-hosted)
Framework: Spec-Driven Platform V31

## Built So Far

- ✅ Phase 7 Feature Update — per-user 24h reset-request cap (2026-05-16, SHA `5325b8c`)
  - `apps/web/src/server/trpc/routers/auth.ts` — added 2 module constants (`PER_USER_RESET_CAP=5`, `PER_USER_RESET_WINDOW_MS=24h`) and a `passwordResetToken.count` query with a 24h gte where clause + early-return on cap-met. Placement is AFTER the user lookup so unknown emails skip the cap query entirely; preserves no-enumeration because all three paths (unknown email / known under cap / known at cap) return identical `{ok:true}` shape with similar latency profile.
  - `apps/web/src/server/trpc/routers/auth.test.ts` — added `count: vi.fn()` to the mock factory; updated existing happy-path test to mock `count=0`; added 2 new cases: cap-engaged (count=5 → ok, no create, no send, count call signature asserted with `user_id` + ~24h gte window) and one-under-cap (count=4 → still mints + sends); updated unknown-email test to assert count is NOT called (extra defence on no-enumeration posture).
  - Defence-in-depth design: the per-email LRU rate limit (10/min) catches rapid-fire bursts; the per-user 24h cap catches sustained low-rate flooding (attacker spacing requests >6s apart). Without the cap, an attacker passing Turnstile could send 14k+ reset emails per day to a known user.
  - Test suite: 22/22 passing in ~344ms (was 20/20, +2 cases).
  - Coverage on auth.ts: 100/78.94/100/100 → 100/80.95/100/100 (branches improved as the new cap-met branch is exercised). Per-file gate (≥75) passes with widened slack.
  - Build: 27 routes, unchanged from Phase 7 #5 (backend-only change). 45.8s.
  - Phase 5 validation: lint ✓ typecheck ✓ test ✓ test:coverage ✓ build ✓ check-product-sync ✓; `pnpm audit --audit-level=high` still fails on pre-existing nodemailer CVE (NOT introduced by this branch — flagged as Phase 7 #7 candidate j).
  - Two-stage review (Rule 25): Stage 1 spec PASS (cap engages at request #6, returns ok, no enumeration, no email — all asserted), Stage 2 quality PASS (no `any`, only blast-radius files touched, module-scope constants match existing pattern, comment explains WHY).
  - Lessons added: 🟤 per-user 24h cap design pattern documents (1) AFTER-lookup placement vs before, (2) `count` primitive over `findFirst+orderBy`, (3) per-user.id keying vs per-email keying.

- ✅ Phase 7 Feature Update — coverage threshold gate (2026-05-16, SHA `78fc022`)
  - `apps/web/vitest.config.ts` — added `coverage.thresholds` block. Global floor: statements ≥ 12, branches ≥ 6, functions ≥ 12, lines ≥ 12 (matches measured baseline; locks against catastrophic regression like an accidentally `.skip`'d suite). Per-file gate: `src/server/trpc/routers/auth.ts` at statements 100 / branches 75 / functions 100 / lines 100 (auth router is the only fully-tested file in the codebase — partial test deletion now surfaces immediately). Added `lcov` reporter alongside text + html for future tool integration.
  - `turbo.json` — added `test:coverage` task (dependsOn `^build`, outputs `coverage/**`).
  - `package.json` (root) — added `test:coverage` script delegating to `turbo run test:coverage`.
  - `.github/workflows/ci.yml` — added `coverage` job under `needs: governance` (parallel to `quality` and `security` matrix). Runs `pnpm test:coverage` and uploads `apps/web/coverage/` as a 14-day artifact (HTML + lcov) via actions/upload-artifact@v4.
  - Gate verified: temporarily bumped auth.ts branches threshold 75 → 99 → confirmed `pnpm test:coverage` exited 1 with explicit message "Coverage for branches (78.94%) does not meet ... threshold (99%)" → restored to 75. RED→GREEN cycle proven for the gate itself.
  - Test suite: still 20/20 passing in ~459ms (vitest run) / ~3.8s (turbo run); no test changes.
  - Build: 27 routes, unchanged from Phase 7 #4 (config-only change).
  - Phase 5 validation: lint ✓ typecheck ✓ test:coverage ✓ build ✓ check-product-sync ✓; `pnpm audit --audit-level=high` fails on pre-existing nodemailer CVE (NOT introduced by this branch — confirmed identical 6/1/4/1 severity counts on main).
  - Two-stage review (Rule 25): Stage 1 spec PASS (PRODUCT.md does not declare specific thresholds; ticket scope is "add coverage gate"), Stage 2 quality PASS (4 files all in scope, no `any`, gate engagement verified inline).
  - Lessons added: see `.cline/memory/lessons.md` for the vitest per-file glob threshold pattern + the pre-existing nodemailer CVE follow-up note.

- ✅ Phase 7 Feature Update — /app/meetings/new tests + RHF/Zod form polish (2026-05-15, SHA `8709595`)
  - `apps/web/src/server/trpc/routers/meetings.test.ts` — 7 cases against `meetingsRouter.create`: happy path verifies server stamps `organization_id` from ctx + `host_user_id` from ctx + `status="scheduled"` + crypto.randomUUID for `meeting_link_token` and `livekit_room_name`; minimal-input defaults (recording=false, lobby=false, description=null, scheduled_at=null); Zod rejects empty title + title >300; Zod rejects description >2000; strict() rejects unknown field (proves client can't override server-stamped `status`); UNAUTHORIZED on null session with no rate-limit fired
  - `packages/shared/src/schemas/meeting.ts` — new `MeetingCreateClientInputSchema` (5 client-facing fields: title, description, scheduled_at, recording_enabled, lobby_enabled). Distinct from pre-existing `MeetingCreateInputSchema` (entity projection — admin/internal). Pattern locks the boundary: `<Entity>CreateClientInputSchema` for client input, `<Entity>CreateInputSchema` for projections where server-stamped fields are visible.
  - `apps/web/src/server/trpc/routers/meetings.ts` — refactored `create` to import `MeetingCreateClientInputSchema` from `@yelli/shared` (replaced inline `z.object`). Behavior equivalence proven by the 7 tests added in the same commit.
  - `apps/web/src/app/app/meetings/new/_meeting-form.tsx` — ported from useState chain to react-hook-form + zodResolver + shadcn Form primitives. Local `formSchema` covers the datetime-local string input; `onSubmit` transforms to wire shape before invoking `trpc.meetings.create.useMutation`. All existing UX preserved: title required + max-300, optional description + max-2000, optional datetime-local scheduled_at, recording/lobby toggles, success→/app/meeting/[id], cancel→/app/meetings, toast feedback, disabled-during-pending.
  - `packages/ui/src/components/form.tsx` — shadcn/ui Form primitive installed (Form/FormField/FormItem/FormLabel/FormControl/FormDescription/FormMessage + useFormField hook). Closes UI Rule #4 gap. Future forms throughout apps/web `import { Form, FormField, ... } from '@yelli/ui'`.
  - `packages/ui/{package.json,src/index.ts}` — added `./form` subpath export, `react-hook-form` peerDependency (apps/web already had RHF 7.53.2 as direct dep), and barrel re-exports.
  - Visual QA (Rule 16) deferred — auth-gated route requires login credentials the agent cannot read; manual smoke pending next dev-up session.
  - Test suite: 12/12 passing in ~411ms (5 auth + 7 meetings).
  - Build: 26 routes, `/app/meetings/new` 4.46 kB / 218 kB first-load (RHF + zodResolver bundled into this route now), middleware unchanged at 99.1 kB, 53.4s.
  - Two-stage review (Rule 25): Stage 1 spec PASS, Stage 2 quality PASS (no `any`, 2 documented `as never` casts per lessons.md, 8 files all in blast radius).
  - 4 new lessons captured: shared schema split (client-input vs entity-projection); namespace-import + @typescript-eslint/consistent-type-imports gotcha; vi.mocked Prisma mockImplementation `as never` on the function (extends [[trpc-test-pattern]]); shadcn Form primitive scoped to @yelli/ui.

- ✅ Phase 7 Feature Update — vitest infrastructure + auth.register smoke coverage (2026-05-15, SHA `81c0279`)
  - `apps/web/vitest.config.ts` — vitest 4 with native `resolve.tsconfigPaths: true`, `environment: "node"`, `SKIP_ENV_VALIDATION=1` in `test.env`, v8 coverage provider
  - `apps/web/src/server/trpc/routers/auth.test.ts` — 5 cases: happy path returns `{ ok: true, slug }` and lowercases email for rate-limit key; rate-limit throws before turnstile (early-exit verified); turnstile fail → UNAUTHORIZED with no DB write; slug conflict → CONFLICT with no $transaction; Zod rejects weak password + uppercase slug before rate-limit fires
  - `apps/web/package.json` — added `test` / `test:watch` / `test:coverage` scripts; turbo `test` pipeline now executes for `@yelli/web`
  - Mock pattern (reusable for future tRPC router tests): `vi.mock("@yelli/db")` for platformPrisma surface; `vi.mock("@/server/lib/turnstile")` + `vi.mock("@/server/lib/rate-limit")` for sibling deps; `vi.mock("bcryptjs")` with both `default` and named exports; real Zod via `@yelli/shared/schemas`; `createCallerFactory(authRouter)` + fake `Request` context
  - Closes Rule 25 TDD deferral from Phase 7 #1; all subsequent Phase 7 tickets must write failing test first
  - Test suite: 5/5 passing in ~600ms cold start
  - Two-stage review (Rule 25): Stage 1 spec PASS (closes the deferred test ordering), Stage 2 quality PASS (typecheck + lint green)

- ✅ Phase 7 Feature Update — auth.register tRPC procedure (2026-05-15, SHA `ce709ff`)
  - `apps/web/src/server/trpc/routers/auth.ts` — new `authRouter` with `register` publicProcedure
  - `packages/shared/src/schemas/auth.ts` — new `registerInputSchema` (Zod, includes turnstileToken)
  - Wired `apps/web/src/app/(auth)/register/page.tsx` to call `trpc.auth.register.useMutation`; on success → toast + `router.push('/login?org=' + slug)`; on error → toast + reset captcha
  - Flow: rate-limit (auth tier, keyed on `register:${email}`) → Turnstile siteverify → slug pre-check → bcrypt cost 12 → atomic `platformPrisma.$transaction` creating Organization (billing_email = registrant) + tenant_admin User
  - Exposed `createCallerFactory` on tRPC base (for future tests)
  - Fixed `.js` extension leftovers in `packages/shared/src/{index,schemas/index,types/index,schemas/subscription}.ts` (same pattern as the prior storage scaffold-bug — surfaced by the first real import of `@yelli/shared/schemas` from a route)
  - **Deferred**: vitest not installed → no test file shipped. Next Phase 7 ticket should install vitest + write `auth.register` coverage.
  - Two-stage review (Rule 25): Stage 1 spec PASS, Stage 2 quality PASS (with test deferral)

- ✅ Phase 0 Bootstrap (2026-05-11)
  - Folder structure, governance docs, MCP wiring, Phase 4 task files (8 parts), CREDENTIALS.md with ⏳ placeholders.

- ✅ Phase 2.5 Spec Summary (2026-05-11) — confirmed by human.

- ✅ Phase 2.6 Design System (2026-05-11) — SKIPPED (no UI UX Pro Max skill, no Section K in PRODUCT.md). docs/DESIGN.md present as fallback visual reference per Scenario 33.

- ✅ Phase 2.7 Spec Stress-Test (2026-05-11) — PASSED, 0 gaps.

- ✅ Phase 3 Spec File Generation (2026-05-11)
  - inputs.yml (v3) written — 13 entities, 13 modules, 6 roles, 4 job queues
  - inputs.schema.json written — JSON Schema validation
  - .env.dev / .env.staging / .env.prod written with AI-generated credentials (22-char passwords + 48-char auth secrets)
  - .env.example written (placeholders only — safe to commit)
  - scripts/sync-credentials-to-env.sh written + executable
  - DECISIONS_LOG locked: tenancy, tech stack, Docker publish, Komodo+Traefik V27 deploy, Xendit, Turnstile, WCAG AA, dev port base 43502, LiveKit/Coturn/Socket.IO
  - All AI-producible secrets generated; ⏳ placeholders remain for: GitHub PAT, Docker Hub token, SMTP, Komodo URL, Xendit keys, Turnstile LIVE keys, LiveKit keys, Coturn static-auth-secret

- ✅ Phase 3.5 Execution Plan (2026-05-11) — .cline/tasks/execution-plan.md generated, 14-session decomposition (Part 1×1, Part 2×1, Part 3×4, Part 4×2, Part 5×5, Part 6 skipped, Part 7×2, Part 8×1).

- ✅ Phase 4 Part 1 — Root config (2026-05-11)
  - pnpm-workspace.yaml + turbo.json + tsconfig.base.json + .editorconfig + .prettierrc + .eslintrc.js + .gitignore + .nvmrc + package.json + pnpm-lock.yaml
  - Branch scaffold/part-1 → squash-merged to main

- ✅ Phase 4 Part 2 — packages/shared + packages/api-client (2026-05-12)
  - 13 entity Zod schemas + inferred TS types + Create/Update inputs (organization, user, department, meeting, callLog, participant, chatMessage, recording, sharedFile, whiteboardSnapshot, subscription, invoice, platformSettings)
  - Generic typed tRPC v11 client wrapper (createApiClient<TRouter> + httpBatchLink + superjson)
  - Branch scaffold/part-2 → squash-merged to main

- ✅ Phase 4 Part 3 — packages/db (2026-05-13)
  - 14-model Prisma schema with L6 denormalization (organization_id on meeting-scoped children)
  - L6 tenant-guard via `Prisma.defineExtension` `$allOperations` (injects organization_id into where + data; exempts AuditLog/Organization/PlatformSettings; super-admin bypass via ALS)
  - L5 writeAuditLog with Prisma.JsonNull handling
  - L2 RLS commented in migration (activates on multi-tenant SaaS deploy)
  - AsyncLocalStorage tenant context + super-admin platformPrisma (separate unguarded client)
  - Initial migration up + down + webmaster super-admin seed (bcrypt cost 12, idempotent upsert)
  - Branch scaffold/part-3 → squash-merged to main

- ✅ Phase 4 Part 4 — packages/ui + packages/jobs + packages/storage (2026-05-13)
  - packages/ui: shadcn/ui New York workspace (9 base components + Tailwind tokens from DESIGN.md + globals.css with HSL CSS vars + Recharts chart-1..5 colors added in Part 5e)
  - packages/jobs: 4 typed BullMQ queues (recording-processing, report-generation, usage-calculation, billing-cycle) — IORedis singleton + TenantJobBase validator + registerCronJobs helper
  - packages/storage: AWS SDK v3 S3-compatible wrapper — buildStorageKey + verifyKeyOwnership + MIME blocklist (SVG/HTML/JS rejected) + 100 MB cap + presigned URLs
  - Branch scaffold/part-4 → squash-merged to main

- ✅ Phase 4 Part 5a — apps/web shell (2026-05-13)
  - 9 config files (next.config.ts with 7 security headers + Turnstile/LiveKit CSP, postcss, tailwind extending @yelli/ui, components.json, eslint, etc.)
  - 7 server core files (env.ts Zod validation, auth.ts with bcrypt + securityVersion staleness check, rate-limit.ts LRU 5-tier, sanitize.ts DOMPurify, turnstile.ts siteverify)
  - 5 routing + theme files (middleware.ts tenant + auth gate, layout.tsx Inter + ThemeProvider, theme-provider, turnstile-widget)
  - 6 auth pages (layout, form-card, login, register, forgot-password, join/[token])
  - Branch scaffold/part-5 → squash-merged to main (Architect-Execute: 4 Sonnet dispatches)

- ✅ Phase 4 Part 5b — Speed Dial Board + 1:1 Video Call UI (2026-05-13)
  - 6 Speed Dial Board files (adaptive grid 1/2 → 2/3/4/5 by count, 88/120/140 min-h tap targets, presence dot, Auto badge, Socket.IO presence subscription + 30s heartbeat)
  - 8 Video Call UI files (server-only HS256 JWT minter, LiveKit room hook, /app/call/[id] page, IntercomCall + CallControls + IncomingCallDialog with Web Audio API ringtone, /api/livekit/token Route Handler with manual auth + rate-limit)
  - Branch scaffold/part-5b → squash-merged to main

- ✅ Phase 4 Part 5c — tRPC server + call initiation + Socket.IO skeleton (2026-05-13)
  - 8 tRPC v11 files (trpc.ts with auth+tenant+rateLimit middleware chain, context, router, departments router, /api/trpc Route Handler, TRPCReactProvider, createServerCaller for RSC)
  - 3 Socket.IO skeleton files (types, globalThis-cached io singleton, 503 stub Route Handler — custom Next.js server needed for WS upgrade)
  - calls.ts initiate mutation (departments.findUnique L6-scoped + mintLiveKitToken + emitIncomingCall via io)
  - Branch scaffold/part-5c → squash-merged to main

- ✅ Phase 4 Part 5d — Meeting Management UI + multi-participant LiveKit + CallLog persistence (2026-05-13)
  - 9 new files (meetings.ts router with list/byId/create/getJoinToken/end + status gating + idempotent CallLog write; call-log.ts helpers; /app/meetings list + new + meeting/[id] RSC; MeetingRoom + MeetingControls + useMeetingRoom)
  - calls.ts: added end mutation (intercom CallLog write); speed-dial-grid.tsx wired to trpc.calls.initiate
  - authMiddleware refactored to inline chain (eliminates 4 advisory non-null-assertion warnings)
  - Architect-Execute with Step 2.5b Opus escalation after Sonnet 5d-1 thrashed (3 bug classes: wrong Prisma relation names, wrong field aliases, bogus server-only import, wrong path /app/meetings/[id] vs /app/meeting/[id])
  - 3 new lessons.md entries: 🔴 Sonnet 30K budget silently exceeded; 🟤 tRPC v11 standalone middleware ctx narrowing; 🟤 Prisma strict create + L6 cast pattern
  - Branch scaffold/part-5d → squash-merged to main as ec50f4f

- ✅ Phase 4 Part 5e — Admin pages + Super-admin pages (2026-05-14)
  - 16 new source files: 3 backend routers (admin with dashboard.stats/users/settings/reports, billing with Xendit 503-graceful checkout, superadmin with platformPrisma + securityVersion bump on suspend), 8 admin UI pages, 3 super-admin pages + 3 UI primitives (badge, alert, table)
  - adminProcedure + superAdminProcedure tRPC chains (super-admin deliberately skips runWithTenantContext — uses platformPrisma exclusively)
  - departments.ts extended with create/update/delete/csvImport/regenerateDeviceToken (all in $transaction with writeAuditLog)
  - writeAuditLog parameter widened from Prisma.TransactionClient to structural AuditLogWriter (accepts L6-extended client tx)
  - Direct Opus implementation (Step 2.5b) — 3 commit bundles on scaffold/part-5e, each verify clean
  - 3 new lessons.md entries: 🟤 AuditLogWriter structural type; 🟤 superAdminProcedure tenant bypass discipline; 🟤 Xendit 503 graceful degradation pattern
  - Branch scaffold/part-5e → squash-merged to main

- ✅ Phase 4 Part 7 — tools/ + deploy/compose/ + Dockerfile + push.sh + COMMANDS.md (2026-05-14)
  - Tools workspace (6): validate-inputs (Ajv 2020-12), check-env (DEV_ONLY_KEYS allowlist), check-product-sync (normalize() strips `[_\-&/,()[].:]` + private-tag scan), hydration-lint (SERVER_ONLY_PATH_SEGMENTS allowlist — 66 files, 0 false positives)
  - Deploy/compose (22 files): dev (db/cache/storage/infra/media/pgadmin/app + pgadmin-servers.json — 8), stage (db/cache/storage/media/pgadmin/app + servers — 7), prod (db/cache/storage/media/pgadmin/app + servers — 7); all share COMPOSE_PROJECT_NAME=yelli_<env> + ../../../.env.<env> + named volumes; LiveKit dev `--dev` single UDP port vs stage/prod `--rtc-port-range-start/end=7882-7892`; Coturn UDP relay 49160-49200; Traefik wss labels for signal in stage/prod
  - start.sh (env-aware compose dispatcher; --build on dev `up`), push.sh (manual image promotion dev→staging→prod)
  - apps/web/Dockerfile (multi-stage pnpm-workspace-aware: deps copies all package.json before `pnpm install` for layer cache; builder runs `pnpm --filter @yelli/db prisma generate` then `pnpm --filter @yelli/web... build`; runner is node:22-alpine standalone, non-root nodejs:1001)
  - apps/web/.dockerignore (excludes node_modules + .next + .turbo + .env* + CREDENTIALS.md + .cline + .specstory + design-system + deploy/compose + docs + tests)
  - deploy/k8s-scaffold/README.md (INACTIVE placeholder per Rule 6)
  - .socraticodecontextartifacts.json (4 entries: database-schema, implementation-map, decisions-log, product-definition; gitignored, machine-local)
  - COMMANDS.md (project-root master command reference)
  - Direct Opus implementation (Step 2.5b) — single scaffold/part-7 branch with one atomic squash-merge; 32 new + 4 modified files
  - 5 new lessons.md entries: 🟤 Compose env_file path = ../../../.env.<env>; 🟤 LiveKit dev `--dev` single UDP vs stage/prod explicit range; 🟤 check-env DEV_ONLY_KEYS allowlist; 🟤 check-product-sync normalize() connector chars; 🟤 hydration-lint SERVER_ONLY_PATH_SEGMENTS
  - Branch scaffold/part-7 → squash-merged to main

- ✅ Phase 4 Part 5f — Feature surface: call history + recordings library + chat history + in-call overlays (2026-05-14)
  - 12 new source files in 3 sequential bundles within one Opus session:
    - Bundle A backend (3 new + 1 wired): recordings.ts (list paginated + getDownloadUrl 1h pre-signed + softDelete transactional + writeAuditLog L5; verifyKeyOwnership; NOT_FOUND on tenant mismatch); chat.ts (listByMeeting chronological 200/500 max + send with sanitizePlainText XSS guard + blocks on cancelled/ended); calls.ts append listHistory (CallLog with caller/department/meeting includes, optional type filter); router.ts register
    - Bundle B pages (3 + 1 helper): /app/history (RSC, status badges, type chips, duration formatter), /app/recordings (RSC, BigInt-as-string formatter, download button is client island), /app/chat/[id] (RSC, meetings.byId for title + chat.listByMeeting, NOT_FOUND → notFound() for cross-tenant), recording-download-button.tsx (client island opens signed URL in new tab)
    - Bundle C overlays (4 new + 2 modified): InCallRecordingIndicator (pulsing red badge driven by recording_enabled prop), InCallChat (right-aside, 3s polling refetchInterval, send mutation invalidates query), InCallFileDropzone (Dialog + HTML5 dnd + 10MB cap + file_url=pending:// placeholder), InCallWhiteboard (Dialog + HTML5 canvas pointer-event drawing, local-only); MeetingRoom wired with 4 overlay toggles + recording_enabled prop; meeting page extracts and passes recording_enabled
  - 2 errors caught early by per-bundle verify: FAILED_PRECONDITION→PRECONDITION_FAILED (correct tRPC v11 identifier); calls.listHistory args-type widening erased select literal-narrowing → fixed via conditional spread `...(input?.type ? { where } : {})`
  - No new lessons.md entries (all patterns extend existing 5d/5e/7 patterns)
  - Direct Opus implementation (Step 2.5b — same as 5d/5e/7); Tier 3 score 51.5; total Opus context ~60K
  - Branch scaffold/part-5f → squash-merged to main as ae2f2bc

- ✅ Phase 4 Part 8 — CI workflows + MANIFEST.txt + README.md + final IMPLEMENTATION_MAP rewrite (2026-05-14)
  - 5 new files:
    - **.github/workflows/ci.yml** — three jobs: `governance` (pnpm install → tools:validate-inputs → tools:check-product-sync → tools:hydration-lint; `tools:check-env` deliberately excluded as it validates local .env files, CI uses GitHub Secrets), `quality` (Turbo matrix lint/typecheck/test/build with per-task `.turbo` cache key on ref+sha), `security` (`pnpm audit --audit-level=high` — blocks merge on HIGH/CRITICAL CVEs). Uses `pnpm/action-setup@v4` with version pinned to PNPM_VERSION=10.0.0 + `actions/setup-node@v4` with `cache: pnpm` (canonical 2026 pattern — avoids corepack permission issues on root CI runners). Concurrency group cancels stale runs on the same ref. `fetch-depth: 0` for git-history-aware Turbo cache. `fail-fast: false` so all four quality tasks always report.
    - **.github/workflows/docker-publish.yml** — V27 deployment model. Triggers on push to main + workflow_dispatch. Multi-platform build (linux/amd64 + linux/arm64) via QEMU + Buildx. Pushes three tags per run: `:latest` (Komodo prod manual Deploy), `:staging-latest` (Komodo staging auto_update polls Docker Hub digest), `:sha-<short>` (immutable per-commit, rollback target). Image identity hardcoded to `${{ secrets.DOCKERHUB_USERNAME }}/yelli` — DOCKER_IMAGE_NAME repository variable not needed since image name is locked in inputs.yml. GHA cache mode=max for layer reuse. `provenance: false` to avoid OCI attestation manifests that some downstream Komodo configurations stumble on (can re-enable once verified). No Komodo webhook step — V27 Komodo polls Docker Hub directly.
    - **MANIFEST.txt** — full file inventory by Phase 4 Part. ~255 tracked + 5 [LOCAL] gitignored. Each entry tagged [GIT]/[LOCAL]/[SOFT]. Includes deferred follow-ups list (Socket.IO real-time chat, file upload pipeline, whiteboard multiplayer, Egress recording state, Kibo dropzone, mid-call moderator features, test harness).
    - **README.md** — project-root developer onboarding. Quick-start (5 commands), service URLs (with non-standard dev port table), daily commands, Phase 7 feature-update loop, architecture table, security stack table (L1–L6 with state per layer), codebase intelligence (SocratiCode/Context7/shadcn MCP), SpecStory note, project structure tree, phase status, Phase-5 credential checklist (8 ⏳ items grouped by service), license + ownership notes (shadcn MIT, Kibo MIT, lucide ISC, Recharts MIT, Prisma Apache 2.0, DESIGN.md from awesome-design-md MIT).
    - **docs/IMPLEMENTATION_MAP.md** — this file, rewritten as final Phase-4-complete snapshot.
  - Files modified: .cline/STATE.md (PHASE=Phase 4 Part 8 complete, NEXT=Phase 5 Validation), docs/CHANGELOG_AI.md (Part 8 entry appended), .cline/memory/agent-log.md (Part 8 entries appended)
  - Schema/migrations: none (Part 8 is governance + CI, no source-code changes)
  - Verification: pnpm tools:validate-inputs PASS, pnpm tools:check-product-sync PASS, pnpm tools:hydration-lint PASS. Workflow YAML manually inspected (uses-clauses pinned to v4/v5/v6 majors; no untrusted-input injection — all `run:` lines reference only env vars and matrix values).
  - Hook interaction note: PreToolUse:Write fired security_reminder_hook (informational GHA injection-attack warning) and vercel-plugin skill suggestion (workflow + deployments-cicd + bootstrap). Vercel skills were skipped — Yelli's deployment is locked as Komodo + Traefik (DECISIONS_LOG, priority 5 > plugin skills priority 7 per Rule 28). Security warning's safe pattern is followed: no untrusted GitHub event payload (issue title, PR description, commit message) flows into `run:` shell commands.
  - SocratiCode initial index: documented as post-merge human action — SocratiCode MCP tools were not loaded in this Claude Code session (Docker required + Qdrant/Ollama containers). To trigger: ensure Docker Desktop is running, then in a Claude Code session say "Index this codebase" → invokes `codebase_index` + `codebase_status` + `codebase_context_index`.
  - Direct Opus implementation (Step 2.5b — same as 5d/5e/7/5f). Tier 2 ≤12 files / ≤80K SAFE single session. Total Opus context ~55K — well within 200K budget.
  - Branch scaffold/part-8 → squash-merged to main (commit SHA recorded in .cline/STATE.md and agent-log.md after merge).

## Not Yet Built

Phase 4 is complete. Items below are out-of-Phase-4 scope or deferred follow-ups.

- **Phase 5 — Validation** (the next phase to run after CREDENTIALS.md placeholders are filled):
  9 commands — pnpm install + 3 governance tools + lint + typecheck + test + build + audit
- **Phase 6 — Docker services + Visual QA** (Rule 16): manual trigger after Phase 5 PASS
- **Phase 7 — Feature update loop** (the everyday workflow once Phase 6 settles)

Deferred follow-ups (documented inline in component JSDoc and tracked in CHANGELOG):

- Socket.IO real-time chat delivery (replace 3s polling in in-call-chat.tsx) — subscribe to `meeting:{id}:chat`
- In-call file upload pipeline (pre-signed S3 PUT via storage.uploadObject + replace `pending://...` placeholder)
- Whiteboard multiplayer broadcast over Socket.IO `meeting:{id}:whiteboard` stroke events
- LiveKit Egress recording state feed (recording:started/stopped webhooks → InCallRecordingIndicator)
- Kibo UI dropzone swap-in for in-call file dropzone (`npx shadcn add @kibo-ui/dropzone`)
- Mid-call moderator features (role promotion, kick, force-mute) — requires LiveKit Server SDK
- Test harness (deferred per Parts 5b–5f precedent — dedicated test-suite Part once Phase 6 settles)
- Part 6 (apps/mobile) — **SKIPPED** (Yelli is web-only Mobile First responsive per inputs.yml `mobile.enabled: false`)

## Modules (13 — per inputs.yml)

- Speed Dial Board (Intercom) — `/app`
- Video Calling — `/app/call`
- In-Call Chat — `/app/chat`
- File Sharing — `/app` (overlay)
- Whiteboard — `/app` (overlay)
- Recording — `/app/recordings`
- Meeting Management — `/app/meetings`
- Department Management — `/admin/departments`
- User Management — `/admin/users`
- Tenant Admin Dashboard — `/admin`
- Billing and Subscription (SaaS) — `/admin/billing`
- Super Admin Panel (SaaS) — `/superadmin`
- Reports and Export — `/admin/reports`

## Entities (13 — per inputs.yml)

Organization, User, Department, Meeting, CallLog, Participant, ChatMessage, Recording, SharedFile, WhiteboardSnapshot, Subscription (SaaS), Invoice (SaaS), PlatformSettings (SaaS singleton)

## Tech Stack (locked in DECISIONS_LOG)

- Frontend: Next.js 15 (App Router) + Tailwind + shadcn/ui (New York)
- API: tRPC v11 + Zod
- ORM: Prisma + PostgreSQL 16 + PgBouncer
- Cache + Jobs: Valkey 7 (MIT Redis fork) + BullMQ
- Storage: MinIO (dev/self-hosted) → S3/R2 (SaaS prod)
- Auth: Auth.js v5 beta (Credentials + bcrypt + securityVersion staleness check)
- Video: LiveKit self-hosted (SFU + Egress)
- TURN: Coturn self-hosted
- Realtime: Socket.IO (presence, chat, ringing)
- Payment: Xendit
- Bot protection: Cloudflare Turnstile
- UI: shadcn/ui + Tailwind + Recharts (via shadcn chart) + lucide-react + (Kibo UI on-demand)
- Deploy: Docker Compose + Komodo (V27 auto_update for staging, manual for prod) + Traefik (HTTPS routing)
- CI/CD: GitHub Actions — ci.yml (governance + quality matrix + security audit) + docker-publish.yml (multi-platform Docker Hub push)

## Port Assignments

Dev base: 43502 (random, locked in inputs.yml + .env.dev)
postgres=43502 · pgbouncer=43503 · valkey=43504 · minio=43505 · minio_console=43506
mailhog_smtp=43507 · mailhog_ui=43508 · pgadmin=43509 · app=43512 · worker=43513
prisma_studio=43522 · livekit_signal=43532 · livekit_turn_udp_start=43537 · coturn=43542
Staging: standard ports (postgres=5433, valkey=6380, minio=9010, pgadmin=5051, app=3000 behind Traefik)
Prod: standard ports (postgres=5432, valkey=6379, minio=9000, pgadmin=5050, app=3000 behind Traefik)

## File Counts (as of 2026-05-14 Phase 4 Part 8)

Source code (tracked in git):

- apps/web: 78 TS/TSX (Part 5a 27 + Part 5b 14 + Part 5c 11 + Part 5d 9 + Part 5e 13 + Part 5f 12 + components reorg = 78 unique) + 12 config = 90
- packages/shared: 16 files
- packages/api-client: 4 files
- packages/db: 13 files (10 src + schema.prisma + 2 migration SQL + migration_lock.toml)
- packages/ui: 21 files (15 components + 3 styles/utils + 3 config)
- packages/jobs: 10 files (8 src + 2 config)
- packages/storage: 6 files (4 src + 2 config)
- **Source subtotal: 160 files**

Infrastructure (tracked):

- tools/: 6 files (4 mjs + package.json + .eslintrc.cjs)
- deploy/: 25 files (dev 8 + stage 7 + prod 7 + start.sh + push.sh + k8s-scaffold/README.md)
- scripts/: 2 files (log-lesson.sh + sync-credentials-to-env.sh)
- **Infra subtotal: 33 files**

Governance + spec + meta (tracked):

- docs/: 7 files (PRODUCT, CHANGELOG_AI, DECISIONS_LOG, IMPLEMENTATION_MAP, DESIGN, YELLI_BUSINESS_MODEL, yelli-mockup-v2.jsx)
- Root spec: inputs.yml + inputs.schema.json
- Root config (Part 1): 8 dotfiles + .nvmrc
- Root meta: CLAUDE.md, AGENTS.md, COMMANDS.md, project.memory.md, package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.base.json, turbo.json, MANIFEST.txt, README.md
- .claude/rules/: 7 files
- .cline/: 12 files (9 tasks + STATE + lessons + agent-log)
- .vscode/: 3 files
- .github/: 4 files (ci.yml + docker-publish.yml + skills/SKILL.md + agents/n8n-architect.agent.md)
- **Governance subtotal: ~62 files**

**Tracked total: ~261 files** (Phase 7 #4 added `apps/web/src/server/lib/email.ts`, `apps/web/src/app/(auth)/reset-password/[token]/page.tsx`, `apps/web/src/app/(auth)/reset-password/[token]/_reset-form.tsx`, and the `password_reset_tokens` Prisma migration directory)

Local-only (gitignored — never committed): CREDENTIALS.md, .env.dev, .env.staging, .env.prod, .socraticodecontextartifacts.json, .specstory/history/*, .code-review-graph/*

See MANIFEST.txt at project root for the complete per-file inventory.

## ⏳ Pending Human Action Before Phase 5

Fill these sections in CREDENTIALS.md:

- 🐙 GitHub username + Personal Access Token
- 🐳 Docker Hub access token (username already locked as bonitobonita24)
- 📧 SMTP credentials (staging + prod — dev uses MailHog)
- 🦎 Komodo UI URL
- 💳 Xendit API keys (test + live + webhook token)
- 🛡️ Cloudflare Turnstile LIVE keys (prod only — dev/staging use test keys pre-filled)
- 🔑 LiveKit API key + secret + URL (Yelli core dependency — needed for the entire video stack)
- 🔁 Coturn static-auth-secret

Then run:

```bash
bash scripts/sync-credentials-to-env.sh
pnpm tools:check-env
```

When `check-env` passes with zero placeholder warnings, say `"Start Phase 5"` in a fresh
Claude Code session to begin the 9-command validation suite.

## ⚡ Post-Phase-4 Human Action — SocratiCode Initial Index

After this Part 8 squash-merge lands on main, trigger the SocratiCode initial index from
a Claude Code session **with Docker Desktop running**. The MCP server auto-pulls Qdrant
+ Ollama containers on first use (~5 minutes one-time).

```
In Claude Code, say: "Index this codebase"
→ codebase_index {}
→ codebase_status {} (poll until complete)
→ codebase_context_index {} (indexes the 4 artifacts from .socraticodecontextartifacts.json)
```

Once indexed, every Phase 7 Feature Update auto-uses `codebase_search` (Rule 17) before
opening any file, saving an estimated 61% of read tokens vs grep-based exploration.
