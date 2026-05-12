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
