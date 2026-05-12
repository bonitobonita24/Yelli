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
