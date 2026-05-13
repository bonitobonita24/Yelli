# Implementation Map — Yelli

# Current build state. Rewritten after every phase or feature update (Rule 3).

# ---

## Project Status

Phase: 4 Part 5a complete — apps/web shell scaffolded (env, Auth.js v5, middleware, layout, Turnstile widget, 4 auth pages). 27 files added. Next: Part 5b (Speed Dial Board + Video Calling UI) in a new session.
App: Yelli (instant video intercom SaaS + self-hosted)
Framework: Spec-Driven Platform V31

## Built So Far

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
  - All AI-producible secrets generated; ⏳ placeholders remain for: GitHub PAT, Docker Hub token, SMTP, Komodo URL, Xendit keys, Turnstile LIVE keys, LiveKit keys

- ✅ Phase 3.5 Execution Plan (2026-05-11) — .cline/tasks/execution-plan.md generated, 14-session decomposition (Part 1×1, Part 2×1, Part 3×4, Part 4×2, Part 5×5, Part 6 skipped, Part 7×2, Part 8×1).

- ✅ Phase 4 Part 1 — Root config (2026-05-11)
  - pnpm-workspace.yaml (apps/_ + packages/_ + tools)
  - turbo.json (build/lint/typecheck/test/dev/clean pipelines + globalEnv)
  - tsconfig.base.json (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + ES2022 + Bundler resolution)
  - .editorconfig (LF, 2-space, UTF-8)
  - .prettierrc (singleQuote, semi, trailingComma all, printWidth 100)
  - .eslintrc.js (@typescript-eslint + import/order + no-explicit-any error + Rule 13 packages/db guard)
  - .gitignore finalised (added coverage, playwright-report, test-results, .idea, Thumbs.db, \*.swp, next-env.d.ts)
  - package.json upgraded with turbo + lint + typecheck + format + tools:\* scripts
  - pnpm-lock.yaml generated (first install — 249 packages)
  - Branch scaffold/part-1 → squash-merged to main

- ✅ Phase 4 Part 2 — packages/shared + packages/api-client (2026-05-12)
  - packages/shared/: 13 entity Zod schemas + inferred TS types + Create/Update input schemas
    - organization.ts, user.ts, department.ts, meeting.ts, callLog.ts, participant.ts,
      chatMessage.ts, recording.ts, sharedFile.ts, whiteboardSnapshot.ts, subscription.ts,
      invoice.ts, platformSettings.ts
    - Convention: snake_case fields, z.string().cuid2() for IDs+FKs, z.coerce.date() for datetimes,
      named enum schemas exported with inferred types, derived/computed fields skipped per inputs.yml
    - Exports: 13 entity schemas + enum schemas — PlanTier, SubscriptionStatus, UserRole, UserStatus,
      MeetingStatus, CallType, CallStatus, ParticipantRole, MessageType, StorageType, RecordingStatus,
      InvoiceStatus (PlanTier + SubscriptionStatus shared from organization.ts → subscription.ts)
    - Three subpaths: "." (everything), "./schemas" (Zod runtime), "./types" (type-only — no bundle cost)
  - packages/api-client/: generic typed tRPC v11 client wrapper
    - createApiClient<TRouter extends AnyTRPCRouter>({ url, headers?, enableLogger? }) factory
    - httpBatchLink + loggerLink + superjson transformer
    - HTTPHeaders type for SSR cookie forwarding
    - Logger auto-disabled in production unless downstream error
    - No React/TanStack Query coupling — Part 5 wires that in apps/web
  - Dependencies added: zod@^3.23.8, @trpc/client@^11, @trpc/server@^11, superjson@^2.2.1, @types/node@^22.5
  - Branch scaffold/part-2 → squash-merged to main
  - Verification: pnpm typecheck PASS (2 packages, 0 errors); pnpm lint PASS

- ✅ Phase 4 Part 3 — packages/db (2026-05-13)
  - packages/db/prisma/schema.prisma — 14 models, 12 enums, 30+ indexes
    - Tenant root: Organization (cascade FK on all org-scoped tables)
    - User (+ UserRole, UserStatus enums, security_version for L1 session invalidation, is_super_admin platform escape)
    - Department, Subscription, Invoice, PlatformSettings (singleton id="singleton"), AuditLog (system, exempt)
    - Meeting, Participant, CallLog, ChatMessage, Recording, SharedFile, WhiteboardSnapshot
    - L6 denormalization: meeting-scoped child entities (Participant, ChatMessage, SharedFile, WhiteboardSnapshot) carry organization_id for uniform tenant-guard injection
  - packages/db/src/client.ts — L6 Prisma.defineExtension via $allOperations; injects organization_id into where + data; exempts {AuditLog, Organization, PlatformSettings}; super-admin bypass via ALS; throws on missing context (dev-mode trap)
  - packages/db/src/platform-client.ts — separate unguarded PrismaClient for super-admin queries (per security.md)
  - packages/db/src/audit.ts — writeAuditLog(tx, entry); handles Prisma.JsonNull for null before/after; AuditAction = CREATE | UPDATE | DELETE | "PLATFORM:*"
  - packages/db/src/rls.ts — withTenantRLS (L2 dormant — RLS policies commented in migration; activates by ALTER TABLE … ENABLE RLS in multi-tenant SaaS)
  - packages/db/src/tenant-context.ts — AsyncLocalStorage<TenantContext>; getTenantContext / requireTenantContext / runWithTenantContext
  - packages/db/prisma/seed.ts — webmaster super-admin seed (idempotent upsert; reads WEBMASTER_PASSWORD from env — NEVER from CREDENTIALS.md by AI; bcrypt cost 12)
  - packages/db/prisma/migrations/20260513000000_initial/{migration.sql, migration_down.sql} — initial migration generated offline via prisma migrate diff; matching down for emergency rollback
  - packages/db/prisma/migrations/migration_lock.toml — provider = postgresql
  - packages/shared updates: cuid2 → cuid across 13 schemas (Prisma 5.x lacks cuid2 support); organization_id added to Participant/ChatMessage/SharedFile/WhiteboardSnapshot for L6 uniformity; PlatformSettings.id Zod relaxed to z.string().min(1)
  - Root package.json: pnpm.onlyBuiltDependencies allowlist for native builds (Prisma engines, bcrypt, esbuild)
  - Branch scaffold/part-3 → squash-merged to main
  - Verification: prisma generate ✓; pnpm typecheck PASS (3 packages); pnpm lint PASS (3 packages)

- ✅ Phase 4 Part 4 — packages/ui + packages/jobs + packages/storage (2026-05-13)
  - **packages/ui**: shadcn/ui New York style workspace (Rule 26 — sole UI library)
    - 9 base components (Button + Card + Input + Label + Textarea + Dialog + Select + Toast + Sonner) + useToast hook + cn utility + index.ts barrel
    - tailwind.config.ts ESM with DESIGN.md HSL tokens (accent yellow + zinc neutrals + semantic success/warning/info + custom shadow-button for 3D speed dial + 4 custom keyframes — fadeInUp/ringPulse/glow/autoAnswerPulse — with prefers-reduced-motion fallback)
    - globals.css :root + .dark variable blocks + @tailwind directives
    - Per-component subpath exports for tree-shake-friendly imports
  - **packages/jobs**: 4 typed BullMQ queues backed by Valkey
    - recording-processing (concurrency 2, 3 retries), report-generation (concurrency 1, 2 retries), usage-calculation (cron */15, 3 retries), billing-cycle (cron 0 2 daily, 5 retries)
    - All queues use exponential backoff; jobs auto-removed after 24h (success) or 7d (failure)
    - TenantJobBase contract: every job carries organizationId + userId; validateTenantJob helper rejects malformed jobs per security.md Queue Safety
    - registerCronJobs() helper using upsertJobScheduler for app-startup registration
    - IORedis singleton via globalThis with REDIS_URL env-var requirement
  - **packages/storage**: AWS SDK v3 S3-compatible wrapper (MinIO dev → S3/R2 prod via STORAGE_ENDPOINT toggle)
    - buildStorageKey enforces {organizationId}/{entityType}/{cuid2}{ext} — strips user filename per security.md
    - verifyKeyOwnership / extractOrganizationId — every download path verifies tenant prefix; mismatch returns null → caller maps to HTTP 404 (no existence-leak)
    - MIME blocklist-first: SVG/HTML/JS always rejected; image/video/audio/PDF/OOXML allowed
    - 100MB hard size cap
    - uploadObject + getDownloadUrl (presigned, 5-min default) + deleteObject + objectExists, all tenant-guarded
  - Dependencies added: Radix UI primitives (5 packages), lucide-react, next-themes, sonner, class-variance-authority, clsx, tailwind-merge, tailwindcss + animate, BullMQ + IORedis, AWS SDK v3 (client-s3 + s3-request-presigner), @paralleldrive/cuid2
  - Branch scaffold/part-4 → squash-merged to main
  - Verification: pnpm install (+230 packages) ✓; pnpm typecheck ✓ (6 packages); pnpm lint ✓ (6 packages, 16 import-order issues auto-fixed)

- ✅ Phase 4 Part 5a — apps/web shell (2026-05-13) — Architect-Execute (4 Sonnet sub-dispatches + Opus inline fixes)
  - **9 config files**: package.json (Next.js 15.0.3 + next-auth@beta.25 + @marsidev/react-turnstile + isomorphic-dompurify + lru-cache + @trpc/* + @hookform/resolvers + react-hook-form + @auth/prisma-adapter), tsconfig.json, next.config.ts (7 security headers + Turnstile CSP — challenges.cloudflare.com in script-src+frame-src + wss/ws for LiveKit + blob: for video media + frame-ancestors none), postcss.config.cjs, tailwind.config.ts (extends @yelli/ui/tailwind-config), components.json (shadcn workspace pointer), .eslintrc.cjs, .gitignore, src/styles/globals.css (forwards @yelli/ui/styles)
  - **7 server core files**: src/env.ts (Zod-validated server + client schemas, AUTH_SECRET min 32, TURNSTILE_SECRET_KEY required, clientEnv export), src/types/next-auth.d.ts (next-auth + next-auth/jwt + @auth/core/jwt module augmentation), src/server/auth.ts (Credentials provider + bcrypt + organizationSlug disambiguation + JWT strategy + securityVersion staleness check via session callback + platformPrisma for unguarded login — generic error messages per security.md §PRODUCTION ERROR HANDLING), src/app/api/auth/[...nextauth]/route.ts, src/server/lib/rate-limit.ts (LRU 5-tier — public 30, auth 10, api 120, upload 20, callInitiation 10), src/server/lib/sanitize.ts (DOMPurify wrapper), src/server/lib/turnstile.ts (siteverify with 10s timeout + hostname-replay validation + dev/staging test-key bypass)
  - **5 routing + theme files**: src/middleware.ts (Auth.js v5 auth() wrapper + subdomain + /t/[slug] tenant resolution + redirect to /login?callbackUrl= on unauthenticated /app|/admin|/superadmin + x-tenant-slug + x-user-id + x-organization-id headers), src/app/layout.tsx (Inter font with --font-sans variable + ThemeProvider class-based dark mode + Toaster), src/app/page.tsx (auth-aware redirect), src/components/theme-provider.tsx (next-themes wrapper), src/components/turnstile-widget.tsx (@marsidev/react-turnstile forwardRef with theme auto-sync)
  - **6 auth pages**: (auth)/layout.tsx (brand mark + centered shell), (auth)/_components/form-card.tsx (shadcn Card shell), login/page.tsx (signIn credentials + Turnstile gating), register/page.tsx (TODO Part 5e tRPC wiring — 12-char password + slug regex), forgot-password/page.tsx (generic confirmation per auth enumeration prevention), join/[token]/page.tsx (Next.js 15 async params via React `use()` — guest meeting join shell)
  - Branch scaffold/part-5 → squash-merged to main
  - Verification: pnpm install (+108 packages, 32s) ✓; pnpm typecheck ✓ (7 packages, 0 errors); pnpm lint ✓ (7 packages, 0 errors, 0 warnings — 48 import/order auto-fixed + 1 unused-var removed + 1 eslint-disable for legitimate server-side @yelli/db import)
  - Dispatch efficiency: 4 Sonnet dispatches in 75-186s each, 6-11 tool uses, zero autocompact thrashing (Part 4a thrashing pattern avoided via tight scope + no inline templates)

## Not Yet Built

- Phase 4 Parts 5b-8 (scaffold continues)
  - Part 5b: Speed Dial Board (/app) + Video Calling (/app/call/:id with LiveKit client SDK)
  - Part 5c: Meeting Management (/app/meetings + /new + /app/meeting/:id LiveKit multi-participant)
  - Part 5d: In-call overlays (chat sidebar, file dropzone, whiteboard, recording) + call history + recordings library
  - Part 5e: Admin pages (/admin dashboard + /admin/departments + /admin/users + /admin/settings + /admin/billing Xendit checkout + /admin/reports + /superadmin/* with platformPrisma)
  - Part 6: apps/mobile — SKIP (Yelli is web-only)
  - Part 7: tools/, deploy/compose/{dev,stage,prod}/, push.sh, COMMANDS.md, .socraticodecontextartifacts.json
  - Part 8: .github/workflows/ci.yml + docker-publish.yml, MANIFEST.txt, IMPLEMENTATION_MAP rewrite, SocratiCode initial index
- Phase 5 Validation (9 commands — install/lint/typecheck/test/build/audit + 3 governance checks)
- Phase 6 Docker services + Visual QA (Rule 16)

## Modules (13 — per inputs.yml)

- Speed Dial Board (Intercom) — `/app`
- Video Calling — `/app/call`
- In-Call Chat — `/app/chat`
- File Sharing — `/app`
- Whiteboard — `/app`
- Recording — `/app/recordings`
- Meeting Management — `/app/meetings`
- Department Management — `/admin/departments`
- User Management — `/admin/users`
- Tenant Admin Dashboard — `/admin`
- Billing & Subscription (SaaS) — `/admin/billing`
- Super Admin Panel (SaaS) — `/superadmin`
- Reports & Export — `/admin/reports`

## Entities (13 — per inputs.yml)

Organization, User, Department, Meeting, CallLog, Participant, ChatMessage, Recording, SharedFile, WhiteboardSnapshot, Subscription (SaaS), Invoice (SaaS), PlatformSettings (SaaS singleton)

## Tech Stack (locked in DECISIONS_LOG)

- Frontend: Next.js 15 (App Router)
- API: tRPC v11 + Zod
- ORM: Prisma + PostgreSQL 16 + PgBouncer
- Cache + Jobs: Valkey 7 + BullMQ
- Storage: MinIO (dev/self-hosted) → S3/R2 (SaaS prod)
- Auth: Auth.js v5 (PostgreSQL sessions)
- Video: LiveKit self-hosted (SFU + Egress)
- TURN: Coturn self-hosted
- Realtime: Socket.IO (presence, chat, ringing)
- Payment: Xendit
- Bot protection: Cloudflare Turnstile
- UI: shadcn/ui + Tailwind + Recharts + Kibo UI + lucide-react

## Port Assignments

Dev base: 43502 (random, locked in inputs.yml + .env.dev)
postgres=43502 · pgbouncer=43503 · valkey=43504 · minio=43505 · minio_console=43506
mailhog_smtp=43507 · mailhog_ui=43508 · pgadmin=43509 · app=43512 · worker=43513
prisma_studio=43522 · livekit_signal=43532 · livekit_turn_udp_start=43537 · coturn=43542
Staging: standard ports (postgres=5433, valkey=6380, minio=9010, pgadmin=5051, app=3000 behind Traefik)
Prod: standard ports (postgres=5432, valkey=6379, minio=9000, pgadmin=5050, app=3000 behind Traefik)

## File Counts (as of 2026-05-13 Phase 4 Part 5a)

- Governance docs: 9 (all initialised + Phase 3 updates locked + Part 2-5a entries appended)
- Spec files: inputs.yml + inputs.schema.json
- Env files: 3 real (gitignored) + 1 example (committed)
- Root config (Part 1): 8 + package.json + pnpm-lock.yaml
- Bootstrap infrastructure files: 13
- Source files (apps/, packages/): apps/web 27 (Part 5a) + packages/shared 18 + packages/api-client 4 + packages/db 11 + packages/ui 20 + packages/jobs 11 + packages/storage 7 = 98
- Phase 4 task files: 8 (staged)

## ⏳ Pending Human Action Before Phase 5

Fill these sections in CREDENTIALS.md:

- 🐙 GitHub username + PAT
- 🐳 Docker Hub access token (username already locked as bonitobonita24)
- 📧 SMTP credentials (staging + prod)
- 🦎 Komodo UI URL
- 💳 Xendit API keys (test + live + webhook token)
- 🛡️ Cloudflare Turnstile LIVE keys (prod only — dev/staging use test keys pre-filled)
- 🔑 LiveKit API key + secret + URL (Yelli core dependency)
  Then run: `bash scripts/sync-credentials-to-env.sh`
