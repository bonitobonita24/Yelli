# Changelog — AI-attributed (Spec-Driven Platform V31)

# Format (Rule 15):

# ## YYYY-MM-DD — [Phase or Feature Name]

# - Agent: CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN | BOOTSTRAP

# - Why: reason for the change

# - Files added: list or "none"

# - Files modified: list or "none"

# - Files deleted: list or "none"

# - Schema/migrations: list or "none"

# - Errors encountered: list or "none"

# - Errors resolved: how each was fixed, or "none"

# ---

## 2026-05-11 — Phase 0 Bootstrap

- Agent: BOOTSTRAP
- Why: Initialise Spec-Driven Platform V31 governance + scaffold infrastructure for Yelli (instant video intercom SaaS).
- Files added: .clinerules, .nvmrc, package.json (minimal), .cline/STATE.md, .cline/memory/lessons.md, .cline/memory/agent-log.md, .cline/tasks/phase4-part{1..8}.md, .claude/settings.json, .vscode/mcp.json, .specstory/config.json, .specstory/specs/v31-master-prompt.md, .github/skills/spec-driven-core/SKILL.md, .github/skills/.gitkeep, scripts/log-lesson.sh, .vscode/tasks.json, docs/CHANGELOG_AI.md, docs/DECISIONS_LOG.md, docs/IMPLEMENTATION_MAP.md, project.memory.md, CREDENTIALS.md (gitignored).
- Files modified: .gitignore (replaced with full V31 bootstrap version including CREDENTIALS.md).
- Files deleted: none.
- Schema/migrations: none (Phase 0).
- Errors encountered: none.
- Errors resolved: none.

## 2026-05-11 — Phase 2.5 / 2.6 / 2.7 / 3 — Spec generation

- Agent: CLAUDE_CODE
- Why: Lock the technical spec for Yelli before Phase 4 scaffold. PRODUCT.md was already complete from Planning Assistant; Phase 2 interview was skipped. Phase 2.5 spec summary confirmed by human → Phase 2.6 design system skipped (no UI UX Pro Max skill, no Section K — docs/DESIGN.md serves as visual reference per Scenario 33) → Phase 2.7 spec stress-test PASSED (0 gaps in 4-category check) → Phase 3 generated all spec + env files.
- Files added: inputs.yml (v3 — full app spec, 13 entities, 13 modules, 6 roles, 4 BullMQ queues), inputs.schema.json, .env.dev, .env.staging, .env.prod, .env.example, scripts/sync-credentials-to-env.sh (executable).
- Files modified: docs/DECISIONS_LOG.md (locked: Tenancy multi+single path, Tech Stack, Docker Hub publish bonitobonita24/yelli, Komodo+Traefik V27 deploy, Xendit payment, Cloudflare Turnstile, Phase 2.7 vibe_test enabled, WCAG AA, dev port base 43502, LiveKit/Coturn video infra, Socket.IO signaling); docs/IMPLEMENTATION_MAP.md (pending — update after this entry); .cline/STATE.md (Phase 3 complete); .cline/memory/agent-log.md (per-step entries).
- Files deleted: none.
- Schema/migrations: none (Phase 4 Part 3 generates Prisma schema + migrations).
- Errors encountered: none.
- Errors resolved: none.
- Decisions locked: Multi-tenant with single-tenant self-hosted path, shared schema + org_id, L3+L5+L6 always active, Docker Hub repo bonitobonita24/yelli, dev port base 43502, Xendit payment, Turnstile bot protection, WCAG AA accessibility, LiveKit self-hosted SFU + Coturn + Socket.IO signaling.

## 2026-05-11 — Phase 4 Part 1 — Root config files

- Agent: CLAUDE_CODE
- Why: Generate root config baseline (Part 1 of 8) so subsequent Parts can scaffold workspaces, packages, and apps on a consistent TypeScript-strict / pnpm-workspace / Turborepo foundation. Branch scaffold/part-1 → squash-merge to main per Rule 23/24.
- Files added: pnpm-workspace.yaml (apps/_ + packages/_ + tools), turbo.json (build/lint/typecheck/test/dev/clean pipelines + globalDependencies/globalEnv), tsconfig.base.json (strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, Bundler resolution, ES2022/DOM libs), .editorconfig, .prettierrc (singleQuote, semi, trailingComma all, printWidth 100, MD/YAML overrides), .eslintrc.js (TS-strict + import/order + no-explicit-any error + Rule 13 packages/db guard via no-restricted-syntax), pnpm-lock.yaml (generated on first install).
- Files modified: package.json (added turbo + prettier + eslint + typescript devDependencies, scripts: build/dev/lint/typecheck/test/clean/format/tools:_), .gitignore (finalized — added coverage, playwright-report, test-results, .nyc_output, Thumbs.db, _.swp, .idea, next-env.d.ts, .pnpm-debug.log\*).
- Files deleted: none.
- Schema/migrations: none (Part 1 is config-only).
- Errors encountered: none.
- Errors resolved: n/a — prettier reformatted turbo.json + .eslintrc.js inline before commit; eslint config required no fixes.
- Verification: pnpm install succeeded (249 packages); JSON/CJS parse for all configs ✓; prettier --check passed on formattable files ✓; eslint .eslintrc.js passed ✓; find verification confirms all 8 expected files present.

## 2026-05-12 — Phase 4 Part 2 — packages/shared + packages/api-client

- Agent: CLAUDE_CODE
- Why: Generate shared TypeScript types + Zod schemas (single source of validation truth) and typed tRPC v11 client wrapper. Part 2 of 8. Architect-Execute Model used: Opus (Architect 4.7) classified scope as Tier 3 (score 73 — 22 files, 2 modules, depth 1) and dispatched 4 Sonnet 4.6 subagents in parallel — 3 entity batches + api-client — each scoped <30K tokens per §1 Step 2.5.
- Files added:
  - packages/shared/package.json, packages/shared/tsconfig.json
  - packages/shared/src/index.ts (root barrel — re-exports schemas)
  - packages/shared/src/schemas/index.ts (barrel — all 13 entity files)
  - packages/shared/src/types/index.ts (type-only re-export — bundle-cost-free consumer path)
  - packages/shared/src/schemas/organization.ts (convention template — also exports PlanTierSchema + SubscriptionStatusSchema reused by subscription.ts)
  - packages/shared/src/schemas/user.ts (UserRoleSchema, UserStatusSchema)
  - packages/shared/src/schemas/department.ts (derived is_online field intentionally omitted — presence engine computes it)
  - packages/shared/src/schemas/meeting.ts (MeetingStatusSchema)
  - packages/shared/src/schemas/callLog.ts (CallTypeSchema, CallStatusSchema; duration_seconds omitted — computed)
  - packages/shared/src/schemas/participant.ts (ParticipantRoleSchema)
  - packages/shared/src/schemas/chatMessage.ts (MessageTypeSchema)
  - packages/shared/src/schemas/recording.ts (StorageTypeSchema, RecordingStatusSchema)
  - packages/shared/src/schemas/sharedFile.ts
  - packages/shared/src/schemas/whiteboardSnapshot.ts (snapshot_data: z.unknown())
  - packages/shared/src/schemas/subscription.ts (imports PlanTierSchema + SubscriptionStatusSchema from organization.ts — no redeclaration)
  - packages/shared/src/schemas/invoice.ts (InvoiceStatusSchema; default currency PHP)
  - packages/shared/src/schemas/platformSettings.ts (singleton entity, free_tier defaults from inputs.yml: 45min call, 8 participants)
  - packages/api-client/package.json (@yelli/api-client, @trpc/client@^11, @trpc/server@^11, superjson@^2.2.1, @types/node@^22.5)
  - packages/api-client/tsconfig.json
  - packages/api-client/src/index.ts (barrel)
  - packages/api-client/src/client.ts (createApiClient<TRouter extends AnyTRPCRouter> factory — httpBatchLink + loggerLink + superjson transformer; HTTPHeaders type for SSR cookie forwarding; logger auto-disabled in production unless downstream error)
- Files modified: pnpm-lock.yaml (zod, @trpc/_, superjson, @types/node).
- Files deleted: none.
- Schema/migrations: none (Part 3 generates Prisma schema + migrations).
- Errors encountered:
  1. tRPC v11 transformer type narrowing — TransformerOptions<TRouter["_def"]["_config"]["$types"]> doesn't match when TRouter is AnyTRPCRouter.
  2. process.env reference unresolved — @types/node not installed.
  3. headers type Record<string, string> incompatible with httpBatchLink HTTPHeaders.
- Errors resolved:
  1. Cast httpBatchLink options as any with eslint-disable comment + documentation explaining the consumer router MUST declare superjson via initTRPC.create({ transformer: superjson }) for wire compatibility (refined in Part 5 when concrete AppRouter is available).
  2. Added @types/node ^22.5 to packages/api-client devDependencies; wrapped process access with typeof guard for browser safety.
  3. Imported HTTPHeaders type from @trpc/client.
- Convention established: snake_case field names matching inputs.yml; z.string().cuid2() for ID + foreign keys; z.coerce.date() for datetimes; named enum schemas exported alongside inferred types; {Entity}CreateInputSchema (omit id/timestamps, nullables become optional) + {Entity}UpdateInputSchema (.partial()) per entity.
- Verification: pnpm install (285 packages); pnpm typecheck PASS (2 packages, 0 errors); pnpm lint PASS after auto-fix (import/order); pnpm format applied; ls confirms 13 entity schemas + 4 api-client files + barrels.

## 2026-05-13 — Phase 4 Part 3 — packages/db

- Agent: CLAUDE_CODE
- Why: Generate the database layer (Part 3 of 8) — Prisma schema for all 13 entities + AuditLog system table, L6 tenant-guard extension, L5 audit-log helper, L2 RLS scaffold (dormant), L1 tenant context via AsyncLocalStorage, separate platformPrisma client for super-admin queries, seed script that reads webmaster password from env (never CREDENTIALS.md by AI). Branch scaffold/part-3 → squash-merge to main per Rule 23/24.
- Files added:
  - packages/db/package.json (@yelli/db; @prisma/client@^5.22, @paralleldrive/cuid2@^2.2, bcrypt@^5.1; prisma@^5.22, tsx@^4.19 devDeps; scripts: db:generate, db:migrate, db:migrate:deploy, db:seed, db:studio, typecheck, lint)
  - packages/db/tsconfig.json (extends ../../tsconfig.base.json, bundler resolution, ESNext, include src/**/* + prisma/**/*.ts)
  - packages/db/.gitignore (node_modules, dist, .turbo, *.tsbuildinfo)
  - packages/db/prisma/schema.prisma (476 lines): 14 models (Organization, User, Department, Subscription, Invoice, PlatformSettings, AuditLog, Meeting, Participant, CallLog, ChatMessage, Recording, SharedFile, WhiteboardSnapshot), 12 enums (PlanTier, SubscriptionStatus, UserRole, UserStatus, InvoiceStatus, MeetingStatus, ParticipantRole, CallType, CallStatus, MessageType, StorageType, RecordingStatus). All tenant-scoped tables carry organization_id (Participant/ChatMessage/SharedFile/WhiteboardSnapshot intentionally denormalized for L6 uniformity). 30+ indexes, cascade FK strategy (Organization→Cascade, User→Restrict on host, related entities→SetNull where nullable). RLS policies scaffolded as SQL comments (DORMANT in single-tenant mode).
  - packages/db/prisma/seed.ts: idempotent webmaster seed — reads WEBMASTER_PASSWORD from env (rejects < 22 chars), upserts System Organization + webmaster super-admin User (bcrypt cost 12) + PlatformSettings singleton; uses raw PrismaClient (no L6 extension) to bootstrap tenant root.
  - packages/db/prisma/migrations/migration_lock.toml (provider = "postgresql")
  - packages/db/prisma/migrations/20260513000000_initial/migration.sql (466 lines — generated offline via `prisma migrate diff --from-empty --to-schema-datamodel`)
  - packages/db/prisma/migrations/20260513000000_initial/migration_down.sql (emergency rollback — DROPs all tables in reverse-FK order, drops 12 enums)
  - packages/db/src/index.ts (barrel — prisma, platformPrisma, writeAuditLog, withTenantRLS, tenantContextStore + getTenantContext + requireTenantContext + runWithTenantContext, type TenantContext; re-exports all @prisma/client types)
  - packages/db/src/client.ts: L6 tenant-guard — Prisma.defineExtension with $allOperations injecting organization_id into where AND data on every non-exempt query. EXEMPT_MODELS = AuditLog, Organization, PlatformSettings. Super-admin bypass via ALS context (isSuperAdmin). Throws if no tenant context (catches missing-context bugs in dev). HMR-safe global singleton.
  - packages/db/src/platform-client.ts: separate UNGUARDED PrismaClient for super-admin queries. Documents "PLATFORM:*" audit-log prefix requirement.
  - packages/db/src/audit.ts: writeAuditLog(tx, entry) — immutable AuditLog write inside transaction. Maps before/after to Prisma.JsonNull when null. AuditAction type allows "PLATFORM:*" prefix for super-admin actions.
  - packages/db/src/rls.ts: withTenantRLS — sets app.current_tenant_id GUC inside transaction. DORMANT — RLS policies in migration are commented; activates by ALTER TABLE … ENABLE RLS in multi-tenant SaaS deployment.
  - packages/db/src/tenant-context.ts: AsyncLocalStorage<TenantContext>; getTenantContext / requireTenantContext / runWithTenantContext; TenantContext = { organizationId, userId, isSuperAdmin }.
- Files modified:
  - packages/shared/src/schemas/{organization,user,department,subscription,invoice,meeting,participant,callLog,chatMessage,recording,sharedFile,whiteboardSnapshot}.ts: replaced `.cuid2()` validators with `.cuid()` (Prisma 5.x lacks @default(cuid(2)) support — issue prisma#15532 still open; standardized on cuid1).
  - packages/shared/src/schemas/platformSettings.ts: id z.string().cuid2() → z.string().min(1) (singleton row keyed "singleton" literal, not cuid format).
  - packages/shared/src/schemas/{participant,chatMessage,sharedFile,whiteboardSnapshot}.ts: added organization_id: z.string().cuid() — denormalized so L6 $allOperations guard can inject uniformly (defense-in-depth — eliminates resolver-discipline risk per security.md).
  - package.json (root): added pnpm.onlyBuiltDependencies allowlist (@prisma/client, @prisma/engines, bcrypt, esbuild, prisma) so pnpm runs native build scripts; pnpm 10 blocks builds by default.
  - pnpm-lock.yaml: added @prisma/client@5.22, prisma@5.22, bcrypt@5.1, @paralleldrive/cuid2@2.2, tsx@4.19, @types/bcrypt@5.0.
- Files deleted: none.
- Schema/migrations:
  - 1 initial migration written offline via prisma migrate diff (14 tables + 12 enums + 30+ indexes + FK constraints + cascade rules).
  - Matching down migration for emergency rollback.
  - Migrations not yet applied — Phase 6 runs `pnpm db:migrate deploy` against the Docker postgres service.
- Errors encountered:
  1. Sonnet subagent (3a) connection refused after 15 min / 12 tool uses with 9 of 11 files written. Resume not attempted (agent ID a8ba6554a1281e1f4).
  2. Prisma 5.22.0 rejected `@default(cuid(2))` — "The `cuid` function does not take any argument" (cuid2 support is at prisma#15532, still open as of Prisma 5).
  3. @yelli/db typecheck failed — `Prisma.JsonNull` used as value but imported as `import type { Prisma }`.
  4. pnpm install blocked native build scripts for prisma, @prisma/engines, bcrypt, esbuild (pnpm 10 default).
  5. Lint errors in client.ts (import/order missing newline; unused param `operation`); seed.ts produced 6 no-console warnings.
  6. `prisma migrate diff --script` output included a stderr "Update available" banner appended to migration.sql (lines 467+).
- Errors resolved:
  1. Opus completed the remaining 2 files (src/index.ts, prisma/seed.ts) inline. Sub-sessions 3b + 3c executed inline by Opus due to dispatch unreliability.
  2. Reverted all @default(cuid(2)) to @default(cuid()) in schema.prisma. Updated all 13 Zod schemas: `.cuid2()` → `.cuid()`. Logged as 🔴 gotcha in lessons.md.
  3. Changed `import type { Prisma }` to `import { Prisma }` in audit.ts — namespace contains both types and runtime values (Prisma.JsonNull).
  4. Added pnpm.onlyBuiltDependencies to root package.json + pnpm install allowed native build scripts.
  5. Inserted blank line between import groups in client.ts; renamed unused param `operation` → `_operation`. Added `/* eslint-disable no-console -- seed script intentionally logs progress */` at top of seed.ts.
  6. Truncated migration.sql to 466 lines (clean SQL only). Banner stripped.
- Verification:
  - pnpm install (+53 packages, 13.3s) ✓
  - pnpm exec prisma generate ✓ (Prisma Client v5.22.0 generated)
  - pnpm typecheck — 3 packages all PASS (0 errors) ✓
  - pnpm lint — 3 packages all PASS (0 errors, 0 warnings) ✓
  - find verification: all 11 expected packages/db files present + 3 migration files ✓
- Key decisions (logged inline + lessons.md):
  - L6 denormalization: child meeting entities carry organization_id directly rather than scoping through meeting.organization_id. Cost: 16 bytes/row × {Participant, ChatMessage, SharedFile, WhiteboardSnapshot}. Benefit: tenant-guard $allOperations injects WHERE org_id = … uniformly — no per-resolver discipline required.
  - cuid1 over cuid2: Prisma 5.x doesn't support `cuid(2)`. Standardized on Prisma's built-in cuid() (v1, 25-char). Future migration to cuid2 deferred until prisma#15532 ships.
  - Singleton PlatformSettings: id = literal "singleton" (Prisma @default("singleton")), Zod relaxed to z.string().min(1).
  - Seed reads WEBMASTER_PASSWORD from env, NEVER from CREDENTIALS.md — preserves security.md "agents never read CREDENTIALS.md". Operator pastes from CREDENTIALS.md → exports → seed bcrypts → discards.

## 2026-05-13 — Phase 4 Part 4 — packages/ui + packages/jobs + packages/storage

- Agent: CLAUDE_CODE
- Why: Generate shared UI primitives (Rule 26 shadcn/ui only), background job queues (BullMQ + Valkey), and S3-compatible file storage wrapper. Part 4 of 8. Architect-Execute Model — Opus 4.7 (Architect) dispatched 2 Sonnet 4.6 subagents (4a packages/ui, 4b packages/jobs+storage), each scoped per §1 Step 2.5 (≤30K Sonnet budget).
- Files added:
  - **packages/ui (20 files)**: package.json (@yelli/ui — Radix Dialog/Label/Select/Slot/Toast, cva, clsx, tailwind-merge, lucide-react, next-themes, sonner, tailwindcss-animate), tsconfig.json (jsx=preserve, bundler), components.json (shadcn new-york style + stone base + cssVariables), tailwind.config.ts (ESM Config; HSL color tokens for accent/foreground/background/card/muted/destructive/border/ring + custom success/warning/info/sidebar/accent-hover/accent-light; --radius hierarchy 12/8/6; font-sans/font-mono CSS vars; shadow-button + button-pressed for speed dial 3D effect; keyframes fadeInUp/ringPulse/glow/autoAnswerPulse), postcss.config.cjs, .gitignore, src/styles/globals.css (172 lines — @tailwind directives + :root light HSL block + .dark scaffold + custom keyframes + prefers-reduced-motion media query disabling animations), src/lib/utils.ts (cn = twMerge ∘ clsx), src/components/{button,card,input,label,textarea,dialog,select,toast,toaster,sonner}.tsx + use-toast.ts (~880 lines total of canonical shadcn New York-style implementations, all forwardRef + displayName, cva variants on Button + Toast, Radix primitives namespace-imported), src/index.ts (barrel).
  - **packages/jobs (11 files)**: package.json (@yelli/jobs — bullmq@^5.21 + ioredis@^5.4), tsconfig.json, .gitignore, src/connection.ts (IORedis singleton via globalThis; throws if REDIS_URL unset; maxRetriesPerRequest: null required by BullMQ), src/queues.ts (4 typed Queue<T> instances + TenantJobBase shape with organizationId+userId requirement + DefaultJobOptions factory with exponential backoff + removeOnComplete age cap + registerCronJobs using upsertJobScheduler — usage-calculation cron */15, billing-cycle cron 0 2), src/workers/_validate.ts (validateTenantJob — rejects jobs missing organizationId per security.md), src/workers/{recording-processing,report-generation,usage-calculation,billing-cycle}.ts (4 worker factories using validateTenantJob first; cron worker placeholders document the "iterate active tenants via platformPrisma" pattern), src/index.ts.
  - **packages/storage (7 files)**: package.json (@yelli/storage — @aws-sdk/client-s3 + s3-request-presigner + @paralleldrive/cuid2), tsconfig.json, .gitignore, src/keys.ts (buildStorageKey enforcing {organizationId}/{entityType}/{cuid2}.{safeExt} — strips original filename per security.md File Upload rule 4; verifyKeyOwnership for download endpoints — return 404 not 403 on mismatch; extractOrganizationId helper), src/mime.ts (BLOCKED_TYPES set includes image/svg+xml + text/html + 3 javascript variants; ALLOWED_PATTERNS array covers image/* (regex EXCLUDES svg) + video/* + audio/* + application/pdf + 3 OOXML types; blocklist applied BEFORE allowlist; 100MB cap), src/client.ts (S3Client singleton with forcePathStyle when STORAGE_ENDPOINT set — works against MinIO dev + S3/R2 prod; uploadObject runs MIME+size guardrails before PutObject; getDownloadUrl returns null on tenant mismatch — caller maps to HTTP 404 to prevent existence-leak; deleteObject + objectExists also tenant-guarded), src/index.ts.
- Files modified:
  - package.json (root): no changes (msgpackr-extract optional native build deliberately left blocked — JS fallback is fine; not in onlyBuiltDependencies).
  - pnpm-lock.yaml: +230 packages.
- Files deleted: none.
- Schema/migrations: none.
- Errors encountered:
  1. **Subagent 4a thrashed on autocompact** — 21 tool uses / 25 min, context refilled to limit 3 times within 3 turns; subagent's verbose component templates (~770 lines of inline shadcn source in the dispatch prompt) consumed too much input context for Sonnet's 30K budget. Wrote 19/20 files before failure (agent ID a1bc9cd9457633d70 — not resumed).
  2. @yelli/ui typecheck FAIL on 4 errors: InputProps + TextareaProps missing from barrel (component files did not export named Props types — used inline React.InputHTMLAttributes); sonner.tsx theme assignment failed `exactOptionalPropertyTypes: true` (useTheme returns string | undefined; ToasterProps["theme"] is "system" | "light" | "dark"); use-toast.ts:194 dispatch passed `toastId: undefined` explicitly which violates `toastId?: string` under strict mode.
  3. @yelli/ui lint FAIL on 6 errors: 5 import/order missing-newline between react and other deps (auto-fixed via --fix); 1 `actionTypes` const used only as `typeof actionTypes` flagged as unused-var.
  4. @yelli/jobs lint FAIL on 10 import/order errors (all auto-fixed).
  5. @yelli/storage lint FAIL on 1 alphabetical import-order (auto-fixed); package.json missing scripts block + @types/node devDep — Opus restored.
- Errors resolved:
  1. Opus completed remaining work inline: wrote src/index.ts barrel after 4a returned ConnectionRefused — no Sonnet dispatch retry attempted to avoid burning further tokens.
  2. Added `export type InputProps = React.InputHTMLAttributes<HTMLInputElement>` and parallel TextareaProps. Narrowed sonner theme with explicit `theme === "light" || theme === "dark" ? theme : "system"` ternary. Changed use-toast dismiss to conditional-spread: `dispatch({ type: "DISMISS_TOAST", ...(toastId !== undefined ? { toastId } : {}) })`.
  3. Replaced `const actionTypes` (runtime const used only for typeof inference) with a direct `type ActionType = { ADD_TOAST: "ADD_TOAST"; ... }` type literal — eliminates the unused-var trigger.
  4. eslint --fix resolved 5+10+1 = 16 import/order issues.
  5. Rewrote packages/storage/package.json adding scripts.typecheck + scripts.lint + @types/node + version-aligned typescript devDep.
- Verification: pnpm install (+230 packages, 1m48s) ✓; turbo run typecheck --force ✓ (6 packages, 0 errors); turbo run lint --force ✓ (6 packages, 0 errors, 0 warnings); find verification: 20 ui + 11 jobs + 7 storage = 38 new files in scaffold/part-4 ✓.
- Key decisions:
  - Single Sonner Toaster + shadcn Toast coexist — different UX patterns (Sonner for rich-content async toasts, shadcn Toast for queue-managed system messages with actions).
  - MIME validation blocklist-first: even if a future allowlist entry shadowed svg, the explicit blocklist rejects it. Defense-in-depth per security.md.
  - buildStorageKey uses cuid2 (NOT the original filename) — strips XSS-via-filename + path-traversal vectors. Original extension preserved only after `[^a-z0-9.]` strip + ≤8 char cap.
  - Cron jobs use empty-organizationId sentinel + worker-side enumerate-active-tenants pattern (TODO documented in usage-calculation/billing-cycle workers — implementation deferred to Part 5/7 when platformPrisma + Subscription/Organization queries are wired).
  - msgpackr-extract native build left blocked — JS msgpackr fallback is sufficient for current job throughput; revisit if benchmarks show serialization overhead.

## 2026-05-13 — Phase 4 Part 5a — apps/web shell scaffold (Architect-Execute, 4 Sonnet sub-dispatches)
- Agent: CLAUDE_CODE (Opus 4.7 Architect → 4× Sonnet 4.6 Executor dispatches → Opus inline fixes + governance)
- Why: Implement Part 5a of the 5-way split per `.cline/tasks/execution-plan.md` — apps/web Next.js 15 shell (env, middleware, layout, Auth.js v5, Turnstile, rate-limit, sanitize, security headers, auth pages). 12-file scope (~75K) classified Tier 3 score 41 → mandatory split per memory-governance.md §1 Step 2.5 (Sonnet 30K budget). Architect-Execute Model §4 applied: each sub-dispatch ≤28K estimated.
- Files added (27 total under apps/web/):
  - **5a-1 config (9 files, Sonnet DONE)**: apps/web/.gitignore, .eslintrc.cjs, components.json (shadcn workspace pointer — aliases.ui → @yelli/ui), next.config.ts (7 security headers per security.md §SECURE PRODUCTION DEFAULTS + CSP allowing challenges.cloudflare.com in script-src + frame-src for Turnstile, wss:/ws: in connect-src for LiveKit, blob: in media-src for video capture, frame-ancestors 'none'), package.json (Next.js 15.0.3, next-auth@5.0.0-beta.25, @auth/prisma-adapter, @marsidev/react-turnstile, react-hook-form, @hookform/resolvers, isomorphic-dompurify, lru-cache, @trpc/* stack, @tanstack/react-query, transpilePackages set), postcss.config.cjs (.cjs not .ts — Next.js postcss expects CommonJS), tailwind.config.ts (extends @yelli/ui/tailwind-config + adds web content paths), tsconfig.json (extends ../../tsconfig.base.json + paths @/* → ./src/* + next plugin), src/styles/globals.css (single-line `@import "@yelli/ui/styles"` — design tokens flow from packages/ui).
  - **5a-2 server core (7 files, Sonnet DONE)**: src/env.ts (Zod-validated server + client env with two schemas — Sonnet parsed lowercase env names + AUTH_SECRET min 32 char + TURNSTILE_SECRET_KEY required + clientEnv export for NEXT_PUBLIC_*), src/types/next-auth.d.ts (module augmentation for next-auth + next-auth/jwt + @auth/core/jwt — last augmentation added by Opus to cover Auth.js v5 internal type path), src/server/auth.ts (Credentials provider + bcrypt.compare + organizationSlug disambiguation + securityVersion staleness check + generic error messages per security.md §PRODUCTION ERROR HANDLING — uses platformPrisma (unguarded) because login flow has no session yet), src/app/api/auth/[...nextauth]/route.ts (handlers re-export), src/server/lib/rate-limit.ts (LRU-cache 5-tier limiter: public 30/min, auth 10/min, api 120/min, upload 20/min, callInitiation 10/min — matches inputs.yml security.rate_limits), src/server/lib/sanitize.ts (DOMPurify wrapper — sanitize allows b/i/em/strong/p/br/ul/ol/li/a/code/pre + href/target/rel; sanitizePlainText strips all), src/server/lib/turnstile.ts (siteverify POST with AbortSignal.timeout(10s) + hostname-replay validation + production-only enforcement so test keys pass in dev/staging).
  - **5a-3 routing + theme (5 files, Sonnet DONE_WITH_CONCERNS noted hot-path on @yelli/ui/toaster subpath — confirmed valid via packages/ui exports)**: src/middleware.ts (auth() wrapper from Auth.js v5 + APEX_HOSTS list + subdomain + /t/[slug] path-based tenant slug extraction + redirect to /login?callbackUrl= on unauthenticated /app|/admin|/superadmin + x-tenant-slug + x-user-id + x-organization-id headers attached for downstream tRPC — slug↔organizationId DB cross-check deferred to tRPC procedures with TODO marker for Part 5b+), src/app/layout.tsx (Inter font with --font-sans variable matching @yelli/ui Tailwind expectation + ThemeProvider class-based dark mode + Toaster from @yelli/ui/toaster + robots noindex placeholder), src/app/page.tsx (auth() server-side check → redirect /app or /login), src/components/theme-provider.tsx (next-themes client wrapper), src/components/turnstile-widget.tsx (forwardRef-based @marsidev/react-turnstile wrapper with theme auto-sync via useTheme + onVerified/onError/onExpire callbacks + clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY).
  - **5a-4 auth pages (6 files, Sonnet DONE)**: src/app/(auth)/layout.tsx (server component centered shell + brand mark + tagline), src/app/(auth)/_components/form-card.tsx (server component reusable shadcn Card shell), src/app/(auth)/login/page.tsx (client component — react-hook-form + zod resolver + signIn("credentials") + TurnstileWidget gating submit + generic toast on error + callbackUrl support), src/app/(auth)/register/page.tsx (TODO Part 5e: trpc.auth.register — display 12-char strong-password regex via Zod refine + lowercase-hyphen slug regex), src/app/(auth)/forgot-password/page.tsx (TODO Part 5e: trpc.auth.requestPasswordReset — generic "if exists" confirmation per security.md §PRODUCTION ERROR HANDLING auth enumeration prevention), src/app/(auth)/join/[token]/page.tsx (Next.js 15 async params via React `use(params)` — guest join shell, real exchange to be wired in Part 5d).
- Files modified:
  - package.json (root) — workspace lockfile only, no script changes.
  - pnpm-lock.yaml — +108 packages added net (Next.js 15 + next-auth v5 beta + @marsidev/react-turnstile + react-hook-form + @hookform/resolvers + isomorphic-dompurify + lru-cache + @trpc/* + @auth/prisma-adapter + transpiles).
- Files deleted: none.
- Schema/migrations: none (Part 5a is presentation/auth layer — schema unchanged).
- Errors encountered:
  1. **auth.ts typecheck FAIL (8 errors)**: JWT module augmentation in src/types/next-auth.d.ts not propagating through Auth.js v5 beta callbacks — `token.userId` typed as `{}` despite augmentation. Sonnet's session callback dereferenced `current.organization.suspended_at` but `select: { organization: { select: { suspended_at: true } } }` failed because the failing `where: { id: token.userId }` (token.userId = `{}`) caused TS to fall back to default User type without selected fields, cascading errors.
  2. **turnstile.ts typecheck FAIL (1 error)**: exactOptionalPropertyTypes rejected `hostname: data.hostname` where data.hostname is `string | undefined` and target field typed `hostname?: string`.
  3. **lint FAIL (50 errors, 48 auto-fixable)**: import/order across all 5a server/client files (Sonnet wrote imports inconsistently). 1 non-auto-fixable: `PUBLIC_PREFIXES` unused in middleware.ts. 1 no-restricted-syntax false-positive on `@yelli/db` import in auth.ts (Rule 13 only restricts client consumption — server is legitimate).
- Errors resolved:
  1. Added `@auth/core/jwt` module augmentation alongside `next-auth/jwt` in next-auth.d.ts (Auth.js v5 internally resolves JWT from @auth/core/jwt). When augmentation STILL didn't propagate (Auth.js v5 beta type-flow quirk), rewrote session() callback to defensively narrow token fields via `Record<string, unknown>` cast + `typeof` guards — never trust JWT blindly anyway. Restructured Prisma query from `select` to `include` for cleaner type inference.
  2. Converted turnstile.ts return objects to conditional-spread pattern: `...(data.hostname !== undefined ? { hostname: data.hostname } : {})` — satisfies exactOptionalPropertyTypes.
  3. `pnpm --filter @yelli/web lint --fix` auto-resolved 48 import/order issues. Deleted unused `PUBLIC_PREFIXES` (public routes are implicit — anything outside PROTECTED_PREFIXES is public). Added `eslint-disable-next-line no-restricted-syntax` with rationale comment on the @yelli/db import in auth.ts (server-only file, rule is for client code per Rule 13).
- Verification: pnpm install (+108 packages, 32s) ✓; pnpm typecheck PASS (7 packages, 0 errors); pnpm lint PASS (7 packages, 0 errors, 0 warnings); find apps/web/ -type f | wc -l = 27 ✓ (9+7+5+6 = 27 dispatched files, identity match).
- Key decisions:
  - **Auth.js v5 beta JWT augmentation workaround**: Module augmentation through Auth.js v5's internal `@auth/core/jwt` path is unreliable. Defensive narrowing at the session() callback boundary (Record<string, unknown> + typeof guards) is the right pattern regardless — it doesn't trust JWT contents, treats any malformed/stale token as "logged out". Documented as 🟤 decision in lessons.md.
  - **JWT strategy over DB sessions**: enables securityVersion staleness check per security.md §AUTH DEFAULTS item 6 without a per-request DB round trip on the happy path. Session() callback DOES re-validate via DB but only on session reads (not every API call — every API call goes through tRPC middleware which can use the JWT directly).
  - **Generic auth error messages**: "Couldn't sign you in" regardless of whether email/org/password failed — prevents account enumeration. Documented in code comment + security.md §PRODUCTION ERROR HANDLING.
  - **Tenant resolution split**: middleware extracts slug from URL (subdomain on prod-like hosts OR /t/[slug] in dev) and attaches as header. Slug↔organizationId cross-check happens in tRPC procedures (Part 5b+) rather than middleware, avoiding per-request DB lookup in Edge runtime. Trade-off accepted with explicit TODO comment.
  - **Turnstile test-key behavior**: dev + staging use Cloudflare's 1x00000000000000000000AA test keys (always pass) — saves the FREE tier hostname budget on the real widget. Only production hostname registered on Cloudflare. Hostname replay check skipped in dev because test tokens resolve to "localhost".
  - **Sub-dispatch token budget mid-Part**: each Sonnet returned in 75-186 seconds with 6-11 tool uses — none hit autocompact (Part 4a thrashing pattern not repeated). Lesson from Part 4: tight scope + minimal inline templates + explicit "DO NOT read X" rules → reliable Sonnet output. Documented as 🟤 decision.


