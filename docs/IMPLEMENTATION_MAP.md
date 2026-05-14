# Implementation Map — Yelli

# Current build state. Rewritten after every phase or feature update (Rule 3).

# ---

## Project Status

Phase: 4 Part 5f complete — Feature surface (call history, recordings library, chat history) + four in-call overlays (chat sidebar, file dropzone, whiteboard, recording indicator) wired into MeetingRoom. Three new tRPC routers (recordings, chat) + calls.listHistory procedure, all org-scoped via L6 tenant-guard with verifyKeyOwnership defence-in-depth on storage paths and writeAuditLog (L5) on soft-deletes. sanitizePlainText XSS guard on chat content. 12 new source files in 3 sequential bundles, single Opus session, Tier 3 score 51.5. pnpm -w typecheck/lint PASS (8/8). Phase 4 Part 7 complete — Tools workspace + Docker Compose scaffolds + Dockerfile + manual image pipeline + COMMANDS.md. tools/ ships 4 governance scripts (validate-inputs Ajv-2020 against inputs.schema.json; check-env with DEV_ONLY_KEYS allowlist for LIVEKIT_TURN_UDP_START/COTURN_PORT/SMTP_UI_PORT — separates real failures from informational warnings, surfaces empty CREDENTIALS.md placeholders as Phase-5-blocking errors; check-product-sync with normalize() stripping connectors `[_\-&/,()[].:]` for snake_case ↔ Title-Case + Rule 20 private-tag leak scan; hydration-lint with SERVER_ONLY_PATH_SEGMENTS allowlist skipping /src/server/ /src/lib/ /src/middleware. /src/env. — 66 files scanned, 0 false positives). deploy/compose/ ships {dev,stage,prod}/{db,cache,storage,media,pgadmin,app}.yml (+ infra/MailHog in dev only) — 22 compose files across 3 envs all sharing COMPOSE_PROJECT_NAME=yelli_<env> namespace pattern; env_file at ../../../.env.<env> (3 levels up — corrected from templates.md 2-level assumption); volumes named yelli_<env>_<service>_data; LiveKit dev uses --dev single-UDP-port mode at LIVEKIT_TURN_UDP_START(43537→7882), stage/prod use --rtc-port-range-start/end=7882-7892 with explicit 11-UDP-port mapping + Traefik wss labels at livekit-{staging,}.powerbyte.app for signaling; Coturn UDP relay 49160-49200 (40 ports for max_participants_per_room=50). deploy/compose/start.sh dispatches the right compose files per env with dev `up` getting --build. deploy/compose/push.sh promotes dev→staging→prod image tags (refuses if not docker login'd, refuses if docker.publish≠true, warns dirty git tree). apps/web/Dockerfile is multi-stage pnpm-workspace-aware (deps stage copies pnpm-workspace.yaml + every workspace package.json BEFORE `pnpm install --frozen-lockfile` for layer caching → builder stage runs `pnpm --filter @yelli/db prisma generate` then `pnpm --filter @yelli/web... build` for transitive workspace build → runner stage is minimal node:22-alpine standalone-output with non-root nodejs:1001 user). COMMANDS.md is the project-root human-facing command reference. deploy/k8s-scaffold/README.md is the explicitly-INACTIVE placeholder per Rule 6. .socraticodecontextartifacts.json points the SocratiCode MCP at 4 context artifacts (database-schema, implementation-map, decisions-log, product-definition) — gitignored, machine-local. 32 files added + 4 modified (lockfile + 3 governance docs). Direct Opus implementation (Step 2.5b) — same approach as Part 5e; cross-file consistency requirements (Traefik labels + container_name patterns across 17 compose files) favor Opus over Sonnet dispatch. 5 new 🟤 decisions locked. Next: Part 5f (in-call overlays + history + recordings + chat library) OR Part 8 (CI workflows + MANIFEST + README + final IMPLEMENTATION_MAP rewrite).
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

- ✅ Phase 4 Part 5b — Speed Dial Board + 1:1 Video Call UI (2026-05-13) — Architect-Execute (2 Sonnet sub-dispatches + Opus inline import-fix + layout stitch + thrashing-recovery)
  - **6 Speed Dial Board files (5b-1 DONE clean)**: src/app/app/layout.tsx (auth guard + redirect /login + min-h-screen bg-background shell + global IncomingCallDialog mount), src/app/app/page.tsx (server-only Prisma findMany on departments scoped to session.user.organizationId — orderBy group_label/sort_order/name), src/components/speed-dial/speed-dial-grid.tsx (adaptive cols 1/2 → 2/3 → 2/3/4 → 2/3/4/5 ladder by count threshold ≤4/≤9/≤16/else, group_label bucketing with "Other" for nulls, admin-gated empty-state CTA), src/components/speed-dial/speed-dial-button.tsx (88/120/140 min-h tap targets + presence dot top-right with sr-only label + blue ⚡ Auto badge top-left + disabled state for offline/in_call), src/lib/presence/use-presence.ts (Socket.IO client at /api/socket with presence:subscribe + 30s presence:heartbeat per security.md §Realtime Connection Safety + graceful no-server fallback + cleanup), src/lib/presence/types.ts (PresenceState union + PresenceUpdate interface)
  - **8 Video Call UI files (5b-2 partial-thrash, all files written, Opus completed validation)**: src/lib/livekit/types.ts (CallStatus + LiveKitTokenResponse + IncomingCallPayload), src/lib/livekit/client.ts (server-only HS256 JWT minter via crypto.createHmac — deliberate no-livekit-server-sdk decision for bundle leanness; LiveKit grant `{ video: { room, roomJoin, canPublish, canSubscribe, canPublishData } }`; nbf/exp 6h TTL + jti for replay protection), src/lib/livekit/use-livekit-room.ts (client hook with status state machine ringing→connecting→active→ended/failed + useRef Room instance + RoomEvent listeners + graceful 503 handling), src/app/app/call/[id]/page.tsx (Next.js 15 async params Promise<{id}> + auth guard with callbackUrl + notFound on empty id), src/components/call/intercom-call.tsx (RoomContext.Provider bridges manual Room into @livekit/components-react GridLayout + ParticipantTile + useTracks for Camera + ScreenShare sources + status-driven UI), src/components/call/call-controls.tsx (48×48 mobile-first toolbar with mic/cam/hangup buttons + useLocalParticipant toggle pattern + inline SVG icons — no lucide dependency added), src/components/call/incoming-call-dialog.tsx (Dialog from @yelli/ui + Socket.IO "call:incoming" listener + Web Audio API 2-tone ringtone 440Hz+523Hz at 600ms cadence + Accept→router.push + Reject→emit call:reject + cleanup), src/app/api/livekit/token/route.ts (POST Route Handler with `runtime = "nodejs"` + manual auth() per security.md §AGENT PROHIBITIONS item 11 + rateLimiters.api + Zod.strict body + 401/429/503 generic errors + mintLiveKitToken caller)
  - Branch scaffold/part-5b → squash-merged to main
  - Verification: pnpm install (+28 packages, 5.7s) ✓; pnpm typecheck ✓ (7 packages, 0 errors); pnpm lint ✓ (7 packages, 0 errors, 0 warnings — 10 import/order auto-fixed + 2 Opus manual reorder in intercom-call.tsx)
  - Recovery efficiency: 5b-1 Sonnet returned DONE clean in ~10min; 5b-2 Sonnet thrashed during trailing validation but all 8 files were on disk (1,172 LoC across 14 Part 5b files) — Opus completed validation in-place per memory-governance.md §4 THRASHING protocol, saving an estimated 8min + 30K tokens vs re-dispatch

- ✅ Phase 4 Part 5c — tRPC server + call initiation router + Socket.IO server skeleton (2026-05-13) — Architect-Execute (2 Sonnet sub-dispatches; 5c-1 over-merged scope → recovered via fresh branch)
  - **8 tRPC v11 files (5c-1)**: src/server/trpc/trpc.ts (initTRPC.context<Context>().create + superjson transformer + errorFormatter masking INTERNAL_SERVER_ERROR in production while preserving zodError for BAD_REQUEST; authMiddleware throws UNAUTHORIZED on null session; tenantMiddleware wraps `next()` in `runWithTenantContext({organizationId, userId, isSuperAdmin})` so all prisma.* queries inside resolvers are L6-scoped automatically; apiRateLimitMiddleware applies `rateLimiters.api.check(ctx.session.user.id)`; publicProcedure + protectedProcedure exports), src/server/trpc/context.ts (createTRPCContext via FetchCreateContextFnOptions + auth() session read + Context = Awaited<ReturnType<typeof createTRPCContext>>), src/server/trpc/router.ts (appRouter root — registers departmentsRouter in 5c-1, callsRouter added in 5c-2; AppRouter type export consumed by @yelli/api-client + lib/trpc/react), src/server/trpc/routers/departments.ts (list query — `prisma.department.findMany({orderBy, select})` with NO explicit `where: organization_id` per L6 trust pattern), src/app/api/trpc/[trpc]/route.ts (fetchRequestHandler `runtime = "nodejs"` + GET+POST adapter + dev-only onError logger), src/lib/trpc/react.tsx ("use client" TRPCReactProvider — createTRPCReact<AppRouter>() with QueryClient staleTime 30_000 + httpBatchLink + superjson + loggerLink dev-only + getBaseUrl SSR-safe), src/lib/trpc/server.ts ("server-only" createServerCaller helper for RSC alternative to platformPrisma)
  - **3 Socket.IO skeleton files (5c-2)**: src/lib/socket/types.ts (ServerToClientEvents: call:incoming/call:rejected/presence:update + ClientToServerEvents: presence:subscribe/heartbeat/call:reject + InterServerEvents.ping + SocketData {userId, organizationId, subscribedDepartmentIds: Set<string>} + callIncomingRoom/callerRoom helper functions; re-imports IncomingCallPayload from lib/livekit/types), src/lib/socket/server.ts (Server<...> generic from socket.io@^4.8.1 + globalThis-cached io singleton against HMR + initSocketServer(httpServer) idempotent attach + attachConnectionHandlers wiring presence:subscribe → join callIncomingRoom + presence:heartbeat no-op + call:reject emit + disconnect cleanup + emitIncomingCall helper consumed by callsRouter; TODO comments mark Phase 6 handshake auth wiring), src/app/api/socket/route.ts (Route Handler GET + POST returning 503 JSON with explanatory message; top comment block documents why custom Next.js server is needed for WebSocket upgrade and that client gracefully degrades to "offline")
  - **+1 calls router (5c-2)**: src/server/trpc/routers/calls.ts (`initiate` mutation: Zod.strict{recipientDepartmentId} → prisma.department.findUnique (L6-scoped, returns null on cross-org) → NOT_FOUND on null with generic message → randomUUID callId + roomName=`call-${callId}` → mintLiveKitToken try/catch → SERVICE_UNAVAILABLE 503 if env unset → build IncomingCallPayload {callId, callerName from session, callerDepartment: null until 5d, roomName} → getIO() emit via emitIncomingCall (null io is fine — caller still gets token, recipient won't ring until Phase 6) → return {callId, roomName, token, wsUrl, recipientDepartmentName} as const; `reject` mutation: io emit only, no CallLog persistence)
  - **Modifications**: src/app/layout.tsx wrapped {children} in <TRPCReactProvider> alongside Toaster inside ThemeProvider; src/server/trpc/router.ts re-registered for callsRouter via 5c-2 update; apps/web/package.json + socket.io ^4.8.1 (server peer; socket.io-client ^4.8.1 already present from Part 5b); .eslintrc.js + apps/web/.eslintrc.cjs Rule 13 server-side @yelli/db exemption (dual declaration — ESLint glob patterns resolve relative to config file location)
  - Branch handling: scaffold/part-5c created from main → 5c-1 Sonnet over-stepped and squash-merged its own commit to main (5d82835) → Opus recovered by recreating the branch from updated main HEAD and explicitly prohibiting merge/push/branch/checkout in the 5c-2 dispatch prompt → 5c-2 obeyed (commit 52dc5da on branch) → Opus performed the governance + squash-merge
  - Verification: pnpm install (+socket.io ^4.8.1 transitive deps) ✓; pnpm --filter @yelli/web typecheck ✓ (0 errors); pnpm --filter @yelli/web lint ✓ (0 errors, 4 advisory non-null-assertion warnings on `ctx.session!.user` pattern — accepted, parallel to Auth.js v5 JWT defensive narrowing in auth.ts session callback; refactor to propagate narrowed user via `next({ctx: {...ctx, user}})` deferred as cleanup task)
  - Dispatch efficiency: 5c-1 took ~20min/46 tools (includes the ESLint Rule 13 dual-config trouble + premature squash-merge); 5c-2 took ~14min/25 tools (clean, obeyed absolute-rules prohibition explicitly)

- ✅ Phase 4 Part 5d — Meeting Management UI + multi-participant LiveKit room + CallLog persistence (2026-05-13) — Architect-Execute with Step 2.5b Opus escalation after Sonnet 5d-1 thrashed
  - **9 new files**: src/server/trpc/routers/meetings.ts (list / byId / create / getJoinToken / end — Zod-strict, L6 scoped; create + end use `Prisma.MeetingUncheckedCreateInput` typed-data pattern with explicit organization_id from ctx so L6 runtime injection coexists with strict TS create input; getJoinToken status-gates ended/cancelled/locked-non-host and promotes scheduled→active on first join; end is host-only + idempotent + writes single CallLog), src/server/lib/call-log.ts (recordIntercomCallLog + recordMeetingCallLog helpers — same UncheckedCreateInput pattern), src/app/app/meetings/page.tsx (RSC list — responsive Card grid sm:grid-cols-2 lg:grid-cols-3 + status badge + link to /app/meeting/[id]), src/app/app/meetings/new/page.tsx (RSC create shell), src/app/app/meetings/new/_meeting-form.tsx (client form — React state + trpc.meetings.create.useMutation + toast), src/app/app/meeting/[id]/page.tsx (RSC meeting room shell — meetings.byId via createServerCaller + notFound() on TRPCError NOT_FOUND for cross-tenant URLs + generateMetadata), src/components/meeting/meeting-room.tsx (client — RoomContext.Provider + GridLayout + ParticipantTile pattern mirroring IntercomCall; header with live participant count + MM:SS duration tick; status states connecting/failed/ended/loading-room/active), src/components/meeting/meeting-controls.tsx (TrackToggles mic/camera/screen-share + Leave + host-only End-for-all), src/lib/livekit/use-meeting-room.ts (multi-participant hook — fetches token via trpc.meetings.getJoinToken.mutate (not REST), returns isHost for moderator gating)
  - **4 modified**: src/server/trpc/trpc.ts (authMiddleware refactored — chain inlined in protectedProcedure with `procedure.use(...).use(...).use(...)` so ctx.user propagates through tenant + apiRateLimit middleware steps; eliminates 4 advisory non-null-assertion warnings), src/server/trpc/routers/calls.ts (ctx.session!.user.* → ctx.user.* + NEW `end` mutation persists intercom CallLog with caller-supplied startedAt + participantCount + status enum), src/server/trpc/router.ts (register meetingsRouter alongside departments + calls), src/components/speed-dial/speed-dial-grid.tsx (wire onCall → trpc.calls.initiate.useMutation; sessionStorage stash of {token, wsUrl, roomName, recipientDepartmentName} keyed by callId so /app/call/[id] can consume without a second token mint; toast success/error; router.push to /app/call/[id])
  - Dispatch retrospective: 5d-1 was dispatched to Sonnet 4.6 with tight scope (6 files, integration facts pre-inlined, absolute shell-command-level prohibitions). Sonnet thrashed at 25 tools / ~770s — completed 4 files (with 3 bug classes: wrong Prisma relation names host_user/meeting_participants/role instead of host/participants/role_in_meeting; `name` instead of `display_name` on User selects; bogus `server-only` import + masking eslint-disable; wrong link path /app/meetings/[id] vs spec's /app/meeting/[id] singular). Opus took over per memory-governance.md §1 Step 2.5b (escalation when splitting is awkward + Opus budget is comfortable). Recovered 5d-1 (relation fixes, missing _meeting-form, speed-dial wiring) + implemented 5d-2 directly. Three new lessons.md entries written: 🔴 Sonnet 30K budget silently exceeded by accumulated tool results across 6+ file ops; 🟤 tRPC v11 standalone middleware loses ctx narrowing across chain; 🟤 Prisma strict create input + L6 cast pattern.
  - Deferred to Phase 6+: mid-call moderator promotion (role change on existing participants), kick participant, force-mute participant — these require LiveKit Server SDK integration which arrives in Phase 7 alongside the Egress webhook for recording.
  - Verification: pnpm -w typecheck PASS (7 tasks, FULL TURBO), pnpm -w lint PASS (7 tasks, FULL TURBO). Branch scaffold/part-5d squash-merged to main as ec50f4f and deleted.

- ✅ Phase 4 Part 5e — Admin pages + Super-admin pages (2026-05-14) — Direct Opus implementation per Step 2.5b (no Sonnet dispatch)
  - **16 new source files**:
    - Backend tRPC routers (3): src/server/trpc/routers/admin.ts (dashboard.stats with dense 30-day time series + users.list/invite/updateRole/deactivate + settings.get/update + reports.exportCallLogsCsv with 365-day max range + 10K row cap), src/server/trpc/routers/billing.ts (subscription.current + invoices.list cursor-paginated + checkout.createSession via Xendit Invoice API with Basic auth — 503-graceful when XENDIT_SECRET_KEY env unset, parallel to LiveKit pattern), src/server/trpc/routers/superadmin.ts (organizations.list/byId/suspend/unsuspend via platformPrisma + platformSettings.get/update singleton; suspend bumps security_version on every active user via updateMany → invalidates sessions per security.md §AUTH DEFAULTS item 6; all writes audit-prefixed PLATFORM:*)
    - Admin UI (8): src/app/admin/layout.tsx (RSC auth + role=tenant_admin OR isSuperAdmin gate + AdminSidebar mount + max-w-7xl content shell), src/components/admin/admin-sidebar.tsx (client dark sidebar per DESIGN.md, lucide-react icon nav, usePathname active state, conditional Super Admin shortcut for is_super_admin), src/app/admin/page.tsx (client dashboard — 4 StatCards + Recharts AreaChart with --chart-1..5 CSS vars + linearGradient fill), src/app/admin/departments/page.tsx (client — Table list + create/edit Dialog with hand-rolled form state + RFC-4180 CSV parser handling quoted fields + escaped quotes + device-binding token rotation Dialog with show-once + copy-clipboard), src/app/admin/users/page.tsx (client — Table list + invite Dialog with temp-password show-once + inline Select role mutation + deactivate/reactivate toggle), src/app/admin/settings/page.tsx (client — org name + billing_email form, slug locked per Phase 3 DECISIONS_LOG, plan badge linking to /admin/billing), src/app/admin/billing/page.tsx (client — current plan + Pro/Enterprise upgrade cards routing to Xendit hosted checkout + Alert variant=warning when 503 detected via err.data.code + paginated invoice history Table), src/app/admin/reports/page.tsx (client — date-range form + CSV download via Blob/anchor)
    - Super-admin UI (3): src/app/superadmin/layout.tsx (RSC isSuperAdmin gate + dark header nav with Organizations + Platform settings links + back-to-admin shortcut), src/app/superadmin/page.tsx (client — organizations Table with name/slug/email search + suspend/unsuspend with confirm() guard), src/app/superadmin/platform-settings/page.tsx (client — singleton platform_settings form for tier limits + prices in centavos + recording quota)
    - UI primitives (packages/ui — 3): badge.tsx (CVA — default/secondary/destructive/outline/success/warning/info), alert.tsx (default/destructive/warning/info/success — used for Xendit 503 fallback), table.tsx (HTML table styled per shadcn New York; no @tanstack/react-table dep — scaffold-grade)
  - **Modifications**: src/server/trpc/trpc.ts (adminProcedure extends protectedProcedure with role guard; superAdminProcedure separate chain — auth check + isSuperAdmin gate + auth-tier rate limit, no runWithTenantContext); src/server/trpc/router.ts (registered admin/billing/superadmin); src/server/trpc/routers/departments.ts (added create/update/delete/csvImport/regenerateDeviceToken — all admin-only, all wrapped in $transaction with writeAuditLog); apps/web/package.json (+lucide-react ^0.460.0 + recharts ^2.13.3); packages/db/src/audit.ts (widened writeAuditLog parameter from Prisma.TransactionClient to AuditLogWriter structural type — accepts both base + L6-extended client's $transaction callback under exactOptionalPropertyTypes); packages/ui/package.json (subpath exports for badge/alert/table); packages/ui/src/index.ts (barrel exports); packages/ui/src/styles/globals.css (--chart-1..5 CSS vars in :root + .dark — Recharts auto-themes); pnpm-lock.yaml (+34 packages, mostly Recharts transitive)
  - Dispatch retrospective: Direct Opus implementation chosen up-front (Step 2.5b escalation) — no Sonnet dispatch. Driven by 5d-1 lesson "Sonnet 30K budget silently exceeded by accumulated tool results across 6+ file ops". Three commit-bundles on scaffold/part-5e for governance visibility: Bundle A (d8761bb — backend + UI primitives, 15 files), Bundle B (d61d383 — admin UI core, 9 files), Bundle C (e649403 — admin extras + superadmin, 5 files). Each bundle passed typecheck + lint cleanly before commit. Total Opus context ~95K — well under 200K budget and below 5d's 110K despite delivering equivalent file count. No mid-session thrashing; no retry of any file.
  - Lessons learned (lessons.md): 🟤 writeAuditLog signature widened to AuditLogWriter — extended-client tx incompatible with base Prisma.TransactionClient under exactOptionalPropertyTypes; structural type accepts both. 🟤 superAdminProcedure deliberately skips runWithTenantContext — platform queries use platformPrisma exclusively; tenant bypass is explicit, never an inline if/else. 🟤 Xendit 503 graceful degradation — checkout.createSession throws SERVICE_UNAVAILABLE when XENDIT_SECRET_KEY env unset; client detects via err.data.code and renders Alert variant=warning. Parallel to LiveKit pattern.
  - Verification: pnpm -w typecheck PASS (7 tasks, FULL TURBO at every bundle commit), pnpm -w lint PASS (7 tasks, FULL TURBO). Branch scaffold/part-5e squash-merged to main and deleted.

- ✅ Phase 4 Part 7 — tools/ + deploy/compose/ + Dockerfile + push.sh + COMMANDS.md + k8s-scaffold + .socraticodecontextartifacts.json (2026-05-14) — Direct Opus implementation per Step 2.5b (no Sonnet dispatch)
  - **32 new source/infra files**:
    - Tools workspace (6): tools/package.json (ajv@8.17.1 + ajv-formats@3.0.1 + js-yaml@4.1.0), tools/.eslintrc.cjs (CLI-script overrides — no-console off + Ajv/js-yaml default-import warnings off), tools/validate-inputs.mjs (Ajv 2020-12 against inputs.schema.json), tools/check-env.mjs (key parity + placeholder detection; DEV_ONLY_KEYS allowlist for LIVEKIT_TURN_UDP_START/COTURN_PORT/SMTP_UI_PORT downgrades intentionally-absent keys to informational warnings), tools/check-product-sync.mjs (entity/module sync Rule 9 + private-tag leak scan Rule 20; normalize() strips `[_\-&/,()[].:]` for snake_case ↔ Title-Case matching), tools/hydration-lint.mjs (SSR/CSR footgun heuristic; SERVER_ONLY_PATH_SEGMENTS allowlist skips /src/server/ /src/lib/ /src/middleware. /src/env. — 66 files scanned, 0 false positives)
    - Dev compose (8): deploy/compose/dev/{docker-compose.db,docker-compose.cache,docker-compose.storage,docker-compose.infra,docker-compose.media,docker-compose.pgadmin,docker-compose.app}.yml + pgadmin-servers.json (auto-registers yelli_dev_postgres + yelli_dev_pgbouncer); LiveKit dev uses `--dev` flag with single UDP 7882 at LIVEKIT_TURN_UDP_START(43537); MailHog port 43507(SMTP)+43508(UI) — dev-only
    - Stage compose (7): deploy/compose/stage/{docker-compose.db,docker-compose.cache,docker-compose.storage,docker-compose.media,docker-compose.pgadmin,docker-compose.app}.yml + pgadmin-servers.json; ports postgres=5433/pgbouncer=6433/valkey=6380/minio=9010/9011/pgadmin=5051; LiveKit uses `--rtc-port-range-start=7882 --rtc-port-range-end=7892` (11 UDP ports exposed directly) + Traefik wss labels at livekit-staging.powerbyte.app for signaling; Coturn UDP relay 49160-49200; app uses image-only (no build) + Traefik labels routing yelli-staging.powerbyte.app, image tag :staging-latest (Komodo auto_update: true polls)
    - Prod compose (7): deploy/compose/prod/{docker-compose.db,docker-compose.cache,docker-compose.storage,docker-compose.media,docker-compose.pgadmin,docker-compose.app}.yml + pgadmin-servers.json; standard ports (postgres=5432/valkey=6379/minio=9000/pgadmin=5050); Traefik routing yelli.powerbyte.app + livekit.yelli.powerbyte.app; image tag :latest (Komodo auto_update: false — human Deploy in Komodo UI)
    - Scripts (2): deploy/compose/start.sh (dispatches compose files per env; --build on dev `up`; .env.<env> via --env-file), deploy/compose/push.sh (manual dev→staging→prod tag promotion; refuses if docker.publish≠true; refuses if not docker login'd; warns on dirty git tree)
    - Dockerfile + dockerignore (2): apps/web/Dockerfile (multi-stage pnpm-workspace-aware: deps stage copies pnpm-workspace.yaml + every workspace package.json BEFORE `pnpm install --frozen-lockfile` for layer cache; builder runs `pnpm --filter @yelli/db prisma generate` then `pnpm --filter @yelli/web... build`; runner is node:22-alpine minimal with Next.js standalone output + non-root nodejs:1001 user), apps/web/.dockerignore (excludes node_modules + .next + .turbo + .env* + CREDENTIALS.md + .cline + .specstory + design-system + deploy/compose + docs + tests)
    - K8s + SocratiCode (2): deploy/k8s-scaffold/README.md (INACTIVE per Rule 6, deploy.k8s.enabled: false — activation procedure documented), .socraticodecontextartifacts.json (4 entries — database-schema/implementation-map/decisions-log/product-definition; gitignored, machine-local for MCP)
    - Project root (1): COMMANDS.md (master human-facing command reference — docker/push.sh/db/test/lint/governance/git/AI-triggers/service-URLs/credentials/utilities)
  - **Modifications**: pnpm-lock.yaml (+4 packages: ajv + ajv-formats + ajv/2020 entry + js-yaml)
  - Dispatch retrospective: Direct Opus implementation up-front (Step 2.5b escalation) — same approach as Part 5e. Driven by cross-file consistency requirements: 17 compose files must share identical COMPOSE_PROJECT_NAME / volume / network / Traefik label patterns; Dockerfile coordinates with all packages/* + apps/web. Single scaffold/part-7 branch with one atomic squash-merge. Total Opus context ~80K — well under 200K budget and lower than 5e's 95K because Part 7 work is infrastructure-mechanical (no runtime-logic reasoning load).
  - Lessons learned (lessons.md — 5 new 🟤 decisions): Compose env_file = ../../../.env.<env> (3 levels up — templates.md ../../ was wrong for the actual deploy/compose/<env>/ depth); LiveKit dev --dev mode single UDP port vs stage/prod --rtc-port-range-start/end explicit 11-UDP-port range (Traefik can't proxy UDP; signal WS at 7880 DOES go through Traefik); check-env DEV_ONLY_KEYS allowlist distinguishes intentionally-absent keys from real failures (empty placeholders always remain errors → Phase 5 pre-flight gate); check-product-sync normalize() expanded to strip `[_\-&/,()[].:]` for "Reports & Export" ↔ `reports_export` matching; Dockerfile multi-stage build copies all workspace package.json files BEFORE pnpm install for layer caching, then `pnpm --filter @yelli/web... build` for transitive workspace build.
  - Verification: pnpm tools:validate-inputs PASS, pnpm tools:check-product-sync PASS, pnpm tools:hydration-lint PASS (66 files, 0 findings), pnpm tools:check-env FAIL by design (8 empty CREDENTIALS.md placeholders — matches Phase 5 pre-flight gate intent — BLOCKERS state since Bootstrap Step 18). pnpm -w typecheck PASS (8/8), pnpm -w lint PASS (8/8). docker compose config --services combined per env produces 11/10/10 valid services dev/stage/prod. Branch scaffold/part-7 squash-merged to main and deleted.

- ✅ Phase 4 Part 5f — Feature surface: call history + recordings library + chat history + in-call overlays (2026-05-14) — Direct Opus implementation per Step 2.5b (no Sonnet dispatch)
  - **12 new source files** delivered in 3 sequential bundles within one Opus session:
    - Bundle A — Backend tRPC (3 new + 1 modified):
      - apps/web/src/server/trpc/routers/recordings.ts — list (paginated, excludes soft-deleted; BigInt file_size_bytes → string for JSON transport), getDownloadUrl (verifyKeyOwnership + storage.getDownloadUrl 1h pre-signed; NOT_FOUND on tenant mismatch — no enumeration vector), softDelete (transactional + writeAuditLog L5 with before/after diff)
      - apps/web/src/server/trpc/routers/chat.ts — listByMeeting (chronological asc, 200/500 max, validates meeting exists in tenant), send (sanitizePlainText before persist, rejects on cancelled/ended meeting, file_url validation when messageType=file)
      - apps/web/src/server/trpc/routers/calls.ts — append listHistory procedure: CallLog with caller/caller_department/recipient_department/meeting includes, optional `type: "intercom"|"meeting"` filter, most-recent-first
      - apps/web/src/server/trpc/router.ts — register chatRouter + recordingsRouter
    - Bundle B — Standalone pages (3 + 1 helper):
      - apps/web/src/app/app/history/page.tsx — RSC, calls.listHistory(100), status badges (completed/missed/failed), type chips (1:1 Call / Meeting), duration formatter, meeting rows link to /app/chat/[id]
      - apps/web/src/app/app/recordings/page.tsx — RSC, recordings.list(100), formatBytes(BigInt-as-string), download button is "use client" island
      - apps/web/src/app/app/chat/[id]/page.tsx — RSC, fetches meetings.byId for title (catch → notFound() for cross-tenant), chat.listByMeeting(500) chronological
      - apps/web/src/components/recordings/recording-download-button.tsx — "use client", trpc.recordings.getDownloadUrl mutation, opens signed URL in new tab with noopener noreferrer
    - Bundle C — In-call overlays (4 new + 2 modified):
      - apps/web/src/components/meeting/in-call-recording-indicator.tsx — pulsing red badge driven by recording_enabled prop (Egress webhook live-state subscription is a follow-up)
      - apps/web/src/components/meeting/in-call-chat.tsx — fixed-right aside (full-width mobile via inset-x-0/sm:right-0/sm:w-80), 3s polling via trpc.chat.listByMeeting refetchInterval, auto-scroll to bottom on new messages, send mutation invalidates query cache
      - apps/web/src/components/meeting/in-call-file-dropzone.tsx — Dialog with native HTML5 dnd + click-to-pick, 10 MB cap matching storage.MAX_UPLOAD_BYTES, posts chat message with messageType=file + file_url=`pending://...` placeholder (upload pipeline = follow-up)
      - apps/web/src/components/meeting/in-call-whiteboard.tsx — Dialog with HTML5 canvas (720×420), pointerdown/move/up drawing, blue stroke on white, Clear button (multiplayer broadcast = follow-up)
      - apps/web/src/components/meeting/meeting-room.tsx — wire all 4 overlays, add header toggle buttons (MessageSquare/Paperclip/PaintBucket icons from lucide-react), accept recordingEnabled prop
      - apps/web/src/app/app/meeting/[id]/page.tsx — extract meeting.recording_enabled and pass to MeetingRoom
  - **Modifications**: apps/web/package.json (+ @yelli/storage workspace dep), pnpm-lock.yaml
  - Schema/migrations: none — CallLog + Recording + ChatMessage models all exist from Part 3
  - Dispatch retrospective: Direct Opus implementation again (Step 2.5b — same as 5d/5e/7). Tier 3 score = 51.5 per memory-governance §1. Three sequential bundles in one Opus session; verify (typecheck+lint) after each bundle caught two errors early — invalid `FAILED_PRECONDITION` (correct identifier is `PRECONDITION_FAILED`) and `Prisma.CallLogFindManyArgs` type-annotation widening that erased the `select` literal-narrowing into the return type (fixed via conditional spread `...(input?.type ? { where } : {})`). Sonnet dispatch was viable for these more-independent bundles, but Opus chosen to keep the 5d→5e→7 pattern and the within-budget margin.
  - Follow-ups documented in component JSDoc + CHANGELOG: chat real-time push (3s poll → Socket.IO sub), dropzone upload (pre-signed PUT), whiteboard multiplayer, Egress live state, Kibo UI swap-in.
  - Verification: pnpm --filter @yelli/web typecheck PASS, pnpm --filter @yelli/web lint PASS (1 import/order auto-fixed). pnpm -w typecheck PASS (8/8), pnpm -w lint PASS (8/8). pnpm tools:validate-inputs PASS, pnpm tools:hydration-lint PASS (76 files — +10 from Part 7, 0 findings). Two-stage review: Stage 1 spec compliance PASS (all 7 declared surfaces present); Stage 2 code quality PASS (no any, L6 + L5 + sanitize + generic errors + scope discipline; tests deferred per Parts 5b–5e precedent). Branch scaffold/part-5f squash-merged to main and deleted.

## Not Yet Built

- Phase 4 Part 8 (final scaffold):
  - .github/workflows/ci.yml + docker-publish.yml
  - MANIFEST.txt (full file inventory)
  - Final README.md rewrite (when PRODUCT.md fully implemented)
  - SocratiCode initial index trigger
- Part 6 apps/mobile — SKIP (Yelli is web-only)
- Part 5f follow-ups (out of Part 5f scope):
  - Socket.IO real-time chat delivery (replace 3s polling)
  - In-call file upload pipeline (pre-signed S3 PUT + storage.uploadObject)
  - Whiteboard multiplayer broadcast
  - LiveKit Egress recording state feed (recording:started/stopped events)
  - Kibo UI dropzone swap-in
- Phase 6+ moderator features: mid-call role promotion, kick participant, force-mute participant (require LiveKit Server SDK)
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

## File Counts (as of 2026-05-14 Phase 4 Part 5f)

- Governance docs: 9 (all initialised + Phase 3 updates locked + Part 2-5e + Part 7 entries appended)
- Spec files: inputs.yml + inputs.schema.json
- Env files: 3 real (gitignored) + 1 example (committed)
- Root config (Part 1): 8 + package.json + pnpm-lock.yaml + COMMANDS.md (Part 7)
- Bootstrap infrastructure files: 13
- Source files (apps/, packages/): apps/web 88 (27 Part 5a + 14 Part 5b + 11 Part 5c + 9 Part 5d + 13 Part 5e new + 3 Part 5e modified-only + Dockerfile + .dockerignore Part 7 + 12 Part 5f new) + packages/shared 18 + packages/api-client 4 + packages/db 11 + packages/ui 23 + packages/jobs 11 + packages/storage 7 = 162
- Tools workspace (Part 7 new): tools/ 6 files (package.json + .eslintrc.cjs + validate-inputs.mjs + check-env.mjs + check-product-sync.mjs + hydration-lint.mjs)
- Deploy infrastructure (Part 7 new):
  - deploy/compose/dev/: 8 files (db/cache/storage/infra/media/pgadmin/app compose + pgadmin-servers.json)
  - deploy/compose/stage/: 7 files (db/cache/storage/media/pgadmin/app compose + pgadmin-servers.json — no MailHog)
  - deploy/compose/prod/: 7 files (db/cache/storage/media/pgadmin/app compose + pgadmin-servers.json — no MailHog)
  - deploy/compose/{start.sh, push.sh}: 2 scripts
  - deploy/k8s-scaffold/README.md: 1 file (INACTIVE placeholder per Rule 6)
- SocratiCode artifacts (Part 7): .socraticodecontextartifacts.json (gitignored, machine-local)
- Phase 4 task files: 8 (staged)
- Total tracked source + infra: 162 (apps/packages) + 6 (tools) + 25 (deploy) + 1 (COMMANDS.md) = 194

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
