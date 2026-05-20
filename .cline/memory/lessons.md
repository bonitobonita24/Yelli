# Lessons Memory — Spec-Driven Platform V31

# Entry format: ## YYYY-MM-DD — [ICON] [Title]

# Types: 🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change

# READ ORDER: 🔴 first → 🟤 second → rest by relevance

# ---

## 2026-05-20 — 🔴 [[dev-app-redis-url-invalid]] yelli_dev_app instrumentation crash on REDIS_URL

- Type:      🔴 gotcha
- Phase:     Phase 7 (root-landing-page session — incidental finding, NOT this ticket's scope)
- Files:     apps/web/.env.dev (suspected), apps/web/src/env.ts (suspected schema tightening)
- Concepts:  dev-infra, env-validation, instrumentation, redis-url, zod, container-restart
- Narrative:
  Symptom: `curl http://localhost:43512/` → HTTP 500 "Internal Server Error".
  All routes (/, /login, /api/health) return 500. Container is in `Up Xh
  (unhealthy)` state — running but failing healthcheck. Root cause from
  `docker logs yelli_dev_app | grep -A8 "Invalid server"`:
    ❌ Invalid server environment variables:
      REDIS_URL: Invalid url
    Failed to prepare server Error: An error occurred while loading
    instrumentation hook: Invalid server environment variables.
  The instrumentation hook (apps/web/src/instrumentation.ts and its
  transitive imports) runs the @yelli/web env.ts Zod schema at startup.
  Either: (a) the value of REDIS_URL in .env.dev no longer parses as a
  valid URL (someone clobbered it with a non-URL string), OR (b) the
  schema was tightened to require a stricter URL form than what's in
  .env.dev (e.g. redis:// → rediss://, or trailing-slash sensitivity).
  Diagnostic discovered: when an app shows `Up (unhealthy)` for hours,
  ALL routes 500 — there's nothing dynamic returning the 500, the
  instrumentation hook crashed and the server never finished init.
  Recovery path (NOT exercised in this session — punted to a follow-up
  ticket): (1) compare .env.dev REDIS_URL value against env.ts schema
  for the REDIS_URL field, (2) verify the format matches what BullMQ +
  ioredis expect (redis://[:password@]host:port[/db]), (3) restart the
  container so the new env is picked up — `docker compose restart app`.
  Recognition heuristic: any `Up (unhealthy)` Next.js app + uniform
  HTTP 500 across all routes + instrumentation in the stack trace =
  env-validation crash at startup. Always check `docker logs ... |
  grep -B2 -A8 "Invalid server"` first — that's where Zod prints the
  field name and the failure reason.

## 2026-05-20 — 🟡 [[t-slug-dev-routes-broken]] middleware must REWRITE, not just extract

- Type:      🟡 fix
- Phase:     Phase 7 (t-slug-dev-routes-broken)
- Files:     apps/web/src/middleware.ts, apps/web/src/server/tenant-redirect.ts
- Concepts:  middleware, routing, tenant, rewrite, /t/{slug}, NextResponse.rewrite, edge
- Narrative:
  Symptom: `/t/yelli/app/anything` always 404'd in localhost dev even though the
  middleware extracted `tenantSlug="yelli"` into `x-tenant-slug` correctly.
  Root cause: extractTenantSlug() returned the slug but the middleware NEVER
  modified the request path. Next.js then tried to serve `/t/[slug]/app/...`
  which has no route handler. The bug was invisible to existing tests because
  buildTenantRedirectUrl tests only assert URL STRINGS — they never serve a
  request through the middleware → route stack.
  Fix: added pure helper `stripTenantPathPrefix(path, slug)` and wired
  `NextResponse.rewrite(effectivePath, { request: { headers } })` into the
  middleware after the tenant cross-check passes. Three places needed the
  stripped path: (a) `isProtected` check — without it `/t/yelli/app/foo`
  wasn't being treated as a protected route, so unauthenticated users
  silently passed through; (b) `resolveTenantRedirect.path` — without it the
  `/superadmin` bypass didn't match dev URLs; (c) the rewrite itself.
  Diagnostic heuristic worth remembering: if pure-function tests pass but
  the route still 404s, the integration layer (middleware/rewrites/route
  resolution) is the gap — pure tests cover decision logic, NOT request
  serving. Next time, write at least one e2e or supertest-style integration
  test that asserts a 200 from an actual fetch through middleware.
  Headers (including x-tenant-slug) DO survive `NextResponse.rewrite` when
  passed via the `{ request: { headers } }` option — verified via build
  output (middleware bundle unchanged at 141kB, no regressions in 186 tests).
  callbackUrl preserves the ORIGINAL `/t/{slug}/...` so login lands the user
  back on the same tenant URL after auth.

# ---

## 2026-05-20 — 🟡 coturn `--no-tlsv1_1` flag removed in modern image — use minimum-version flags instead

- Type:      🟡 fix
- Phase:     Rule 16 follow-up (coturn-config-fix)
- Files:     deploy/compose/{dev,stage,prod}/docker-compose.media.yml
- Concepts:  coturn, turnserver, TLS, webrtc, docker-image-upgrade, deprecated-flag
- Narrative: `coturn/coturn:latest` (image current at 2026-05-20) silently dropped the `--no-tlsv1_1` flag. Newer coturn inverted the TLS flag scheme: deny-list `--no-tlsv1_X` → minimum-version `--tlsv1_X` / `--no-tlsv1_2`. When the dropped flag is passed, turnserver exits 255 and dumps full `-h` help-text to stdout. The crash loop is hard to diagnose because (a) `docker logs --tail` shows only the help-text (not the actual error at the very top of the log — must `head`, not `tail`), and (b) the deprecation message `0: ERROR: no-cli option is deprecated, see --cli` is just a warning, not the exit cause. Fix: remove `      - --no-tlsv1_1` from coturn command-block in all 3 compose files. `--no-tlsv1` (singular) is still valid in the same image — verified by `docker run --rm coturn/coturn:latest turnserver --no-tlsv1` which started successfully and blocked-on-listen. Modern coturn default already excludes TLS 1.0/1.1, so removal is functionally equivalent to the old behavior. Recognition heuristic for future coturn-image upgrades: when coturn restart-loops with empty `docker logs --tail`, ALWAYS check `docker logs ... 2>&1 | head -20` — the actual error is always on line 1-2, but coturn writes ~135k lines of help-text after it that drown the tail. Related to [[livekit-env-name-mismatch]]: both bugs caused dev WebRTC to fail silently, both diagnosed via Rule 16 cleanup smoke pass.

## 2026-05-19 — 🔴 L6 super-admin bypass leaks cross-org data — never embed bypass in the guarded client

- Type:      🔴 gotcha  `[[l6-super-admin-bypass-leak]]`
- Phase:     Task #21 (admin-users-list-tenant-scope, Rule 16 follow-up)
- Files:     packages/db/src/client.ts, packages/db/src/tenant-context.ts, apps/web/src/server/trpc/trpc.ts, apps/web/src/server/trpc/routers/*.ts
- Concepts:  security, L6, tenant-isolation, super-admin, defense-in-depth, prisma-extension, ALS, IDOR
- Narrative: The L6 tenant-guard Prisma extension shipped in Phase 4 Part 3 originally contained an `if (!ctx || ctx.isSuperAdmin) return query(args)` bypass at the `$allOperations` interceptor. The intent was "super-admins can see across orgs" — but the effect was that EVERY tenant_admin who also happened to carry `is_super_admin=true` (common for the seeded webmaster + any platform-staff dual-role account) silently bypassed tenant filtering on EVERY route using the guarded prisma client. Mallory (user in `evil` org) appeared in webmaster's `/admin/departments` user picker dropdown during Rule 16 smoke verification. security.md §SUPERADMIN AND PLATFORM-LEVEL ROLES rule 4 explicitly forbids this pattern: "NEVER add an inline `if (isSuperadmin) skip tenant filter` inside a regular tenant-scoped resolver" — and the same prohibition applies to the L6 extension itself, because the extension IS the floor of every tenant-scoped resolver. The architectural fix is two-layer: (1) remove the `ctx.isSuperAdmin` bypass at the L6 extension — keep only the `!ctx` pass-through for genuine no-context scripts (bootstrap, seed, data migrations); (2) make cross-tenant code use `platformPrisma` (the unguarded singleton in `packages/db/src/platform-client.ts`) from a dedicated `superAdminProcedure` router (`apps/web/src/server/trpc/routers/superadmin.ts`). Defense-in-depth: also add explicit `where: { organization_id: ctx.organizationId }` to every list/count/aggregate query — clarity-of-intent at the call site plus a backstop if a future regression accidentally drops the L6 extension. PATTERN TO RECOGNIZE: any phrase like "bypass for super-admin" or "skip tenant guard if X" inside a Prisma extension, middleware, or shared resolver helper. The bypass is invisible at the call site — the resolver looks tenant-safe but isn't. Fix at the extension layer, not by trying to patch every resolver.

# ---

## 2026-05-17 — 🟤 Presence roster `{wasFirst}` / `{isLast}` coalescing pattern

- Type:      🟤 decision  `[[presence-roster-coalesce-pattern]]`
- Phase:     Phase 7 #11 (presence)
- Files:     apps/web/src/server/socket/presence.ts, apps/web/src/server/socket/presence.test.ts
- Concepts:  presence, multi-tab, broadcast, idempotency, socket-coalescing
- Narrative: User-level realtime presence MUST coalesce per-socket events into per-user state changes. Naive impl: emit "online" on every socket.connect and "offline" on every socket.disconnect — flickers users offline/online during HMR reconnect, tab refresh, mobile-to-wifi handoff, page navigation. Fix: track a `Map<orgId, Map<userId, Set<socketId>>>`; `addSocket` returns `{wasFirst:true}` iff that user's socket-set went 0→1 (real online transition); `removeSocket` returns `{isLast:true}` iff the set went 1→0. The wiring layer emits ONLY on the boolean transitions. This makes the broadcast contract idempotent w.r.t. per-socket churn — what subscribers see matches user-perceived reality. The roster API is intentionally impl-agnostic: single-process in-memory Map now, Redis hash + Lua atomicity post-Phase 6 — the `{wasFirst, isLast}` contract stays the same so the wiring layer never changes when the storage swaps.

# ---

## 2026-05-17 — 🟤 Two parallel Socket.IO servers coexist — distinct-event-name discipline

- Type:      🟤 decision  `[[parallel-socket-servers-coexistence]]`
- Phase:     Phase 7 #11 (presence)
- Files:     apps/web/src/lib/socket/types.ts, apps/web/src/lib/socket/server.ts (legacy), apps/web/src/server/socket/server.ts (auth-gated), apps/web/src/app/api/socket/route.ts
- Concepts:  socket-server, type-collision, backwards-compat, event-namespacing
- Narrative: Yelli currently runs TWO Socket.IO servers in parallel — legacy `apps/web/src/lib/socket/server.ts` on `/api/socket` (Phase 5b Speed Dial path, consumed by `app/api/socket/route.ts` + the calls router's `emitIncomingCall`) and the auth-gated `apps/web/src/server/socket/server.ts` on SOCKET_PORT (Phase 7 #8e+, auth middleware + revalidation loop). The shared `apps/web/src/lib/socket/types.ts` event-map is consumed by BOTH servers, so adding new events for the auth-gated server cannot reshape existing legacy event signatures. Discipline: use DISTINCT event names on the new server (`presence:user` + `presence:snapshot` for Phase 7 #11) — never overload the same event name with two different payload shapes across servers. Even if a client only ever connects to one server at a time, sharing the type map means name collision = compile-time war between the two servers' type contracts. Legacy server retirement is a separate ticket; until then, additive-only changes on the shared type map.

# ---

## 2026-05-17 — 🔴 `pnpm audit` (pnpm 10) ignores `.npmrc audit-level` for its exit code

- Type:      🔴 gotcha
- Phase:     Phase 7 #10 (socket-client) — caught Phase 7 #9 false-completion claim
- Files:     .github/workflows/ci.yml, .npmrc
- Concepts:  pnpm, audit, .npmrc, ci-gate, exit-code, false-completion, vulnerability-threshold
- Narrative: Phase 7 #9 attempted to lift the audit threshold from HIGH to CRITICAL by adding `audit-level=critical` to a new `.npmrc` at project root AND dropping the `--audit-level=high` CLI flag from ci.yml's security job, theorising that `.npmrc` would become the single source of truth. STATE.md from that ticket claimed "`pnpm audit` exit 0". This is FALSE on pnpm 10.0.0. Verified empirically: `pnpm config get audit-level` returns `critical` (the .npmrc IS read) but `pnpm audit` STILL exits 1 when HIGH advisories are present, even with `npm_config_audit_level=critical` set as an env var. The exit code only respects the explicit `--audit-level=<level>` CLI flag. `.npmrc` becomes documentation-only for the audit command. CI was silently broken from Phase 7 #9 (no push to origin caught it; Phase 7 #10's `pnpm build` validation caught both this AND the #8e Edge-stub regression in one pass). **Rule:** for unfixed HIGH CVEs with documented acceptance, keep `.npmrc audit-level=critical` AS DOCUMENTATION (so `pnpm config get audit-level` returns the intent) AND add `--audit-level=critical` to the CI command line as the authoritative enforcement. Two declarations of the same policy in two places is the price of pnpm 10's behavior. Revisit when pnpm fixes this or migrates to a different audit pipeline. Cross-links: [[nodemailer-cve-mitigation]] (the documented-acceptance pattern this gotcha refines).

# ---

## 2026-05-17 — 🔴 Next.js instrumentation hook needs Edge-runtime webpack stub for Node-only deps

- Type:      🔴 gotcha
- Phase:     Phase 7 #10 (socket-client) — caught Phase 7 #8e build regression
- Files:     apps/web/next.config.ts, apps/web/src/instrumentation.ts
- Concepts:  nextjs-15, instrumentation, webpack, edge-runtime, server-external-packages, dynamic-import, runtime-gate, static-analysis, socket-io
- Narrative: Phase 7 #8e's instrumentation.ts uses the textbook pattern — early-return `if (process.env.NEXT_RUNTIME !== "nodejs") return;` then `await import("http")` + `await import("@/server/socket/server")`. The comments at line 36-38 of instrumentation.ts explicitly claim "Dynamic imports keep this file Edge-bundle-safe". This is FALSE. Webpack performs STATIC analysis of dynamic-import string literals and creates chunks for BOTH the Node AND Edge graphs, regardless of any runtime gate. The chunks then try to resolve every transitive import — the Edge graph has no `http`/`crypto`/`path` because Edge runtime is V8 isolate, not Node. Result: `Module not found: Can't resolve 'http'` on every `pnpm build` after Phase 7 #8e. STATE.md from #8e and #9 both claimed "CURRENT_BUILD: 27 routes — unchanged"; the value was stale from Phase 7 #7 and was never re-verified by re-running `pnpm build`. Phase 7 #10 caught it on the first validation pass. **Fix:** in next.config.ts `webpack: (config, { nextRuntime }) => { if (nextRuntime === "edge") config.resolve.alias = { ..., "socket.io": false, "@/server/socket/server": false, "@/server/socket/revalidation": false } }` plus `config.resolve.fallback = { http: false, https: false, crypto: false, path: false }`. The runtime gate keeps Node behaviour intact; the alias satisfies webpack's static analysis pass on Edge. `serverExternalPackages` does NOT help here — it applies to Server Components, not the instrumentation Edge chunk. **Discipline:** every ticket that adds an instrumentation.ts import MUST run `pnpm build` as part of validation, not just test+typecheck+lint. Add `pnpm build` explicitly to Phase 7 step 19 validation reminders for any ticket touching server-only imports. Cross-links: [[edge-safe-vs-db-revalidating-callback-duplication]] (sibling pattern — Edge runtime constraints surface late).

# ---

## 2026-05-17 — 🟤 Socket.IO client provider pattern — pure factory + pure handler + thin React shell

- Type:      🟤 decision
- Phase:     Phase 7 #10 (socket-client)
- Files:     apps/web/src/lib/socket/client.ts, apps/web/src/lib/socket/session-invalidation.ts, apps/web/src/lib/socket/socket-context.tsx
- Concepts:  socket-io, react-context, pure-helper-extraction, node-env-vitest, jsdom-not-installed, ssr-safety, lazy-useState, withCredentials
- Narrative: The client-side Socket.IO foundation factors into three concerns: (1) `createSocketClient(opts)` — pure factory wrapping `io()` with the Yelli contract (`withCredentials:true` so the Auth.js cookie flows cross-origin since SOCKET_PORT=43515 ≠ APP_PORT=43512 = separate origins, `transports: ["websocket", "polling"]`, `reconnectionAttempts: 5`, `reconnectionDelay: 2_000`). (2) `attachSessionInvalidationHandler(socket, onInvalidated)` — pure helper that subscribes to the `session:invalidated` server event (emitted by the 60s revalidation loop landed in Phase 7 #8e-2) and returns a disposer. (3) `SocketProvider` — thin React Context provider that composes (1) + (2) with `useRouter` from `next/navigation`, injecting `() => { router.push("/login"); router.refresh(); }` as the invalidation callback. Why this factoring: Yelli's vitest config uses `environment: "node"` and jsdom is NOT installed, so React component tests with `@testing-library/react` are impossible. By extracting the testable behavior into pure modules, RED→GREEN runs in node env (10 tests covering URL, withCredentials, transports, reconnection cap, autoConnect default + override, event registration, callback invocation, disposer, no-fire-on-unrelated-events). The Provider has zero unit tests but is shielded by typecheck + lint + manual Visual QA. This matches and extends the [[pure-helper-extraction-pattern]] from Phase 7 #7c-2 / #8e (separate-file extraction of Edge-incompatible logic) — same insight applied to React-incompatible test environments. Pattern reusable for any future React Context where the testable behavior can be lifted into a non-React module: feature flags, theme switcher, websocket reconnect orchestration. Provider stays minimal; logic stays node-testable. Cross-links: [[pure-helper-extraction-pattern]] (Phase 7 #7c-2 + #8e), [[socket-cross-org-api-surface-guard]] (Phase 7 #8e-2 — companion server-side correct-by-construction pattern).

# ---

## 2026-05-16 — 🟤 Auth.js v5 JWE decode requires cookie name as `salt` — wrong salt returns null even with right secret

- Type:      🟤 decision
- Phase:     Phase 7 #8(e)-1 (Socket.IO auth middleware)
- Files:     apps/web/src/server/socket/auth.ts
- Concepts:  auth-js-v5, jwe, jwt-decode, cookie-name, salt, aead, domain-separation, socket-io
- Narrative: Auth.js v5 introduced a domain-separation feature where each session cookie's JWE is salted with the cookie name itself. The `decode` function from `next-auth/jwt` (and `@auth/core/jwt`) takes a `salt` parameter that MUST match the cookie name used to wrap the token. Cookie name differs by environment: `authjs.session-token` (dev / HTTP) or `__Secure-authjs.session-token` (prod / HTTPS). If you pass the wrong salt (e.g., always pass the dev name in prod), `decode` returns `null` silently — no error, no log, just unauthenticated. This is intentional: it prevents a token harvested from one Auth.js cookie context from being usable in another (e.g., a dev tunnel cookie being replayed against prod). The Socket.IO auth middleware in `apps/web/src/server/socket/auth.ts` reads the cookie name based on `isProduction` (which the caller derives from `env.NODE_ENV === "production"`), parses the cookie value, and passes the SAME cookie name to `decode` as the `salt` argument. Test `auth.test.ts` "ignores the dev cookie when in production mode" asserts that even if a dev-named cookie is present, the prod-mode path won't decode it. When wiring Auth.js v5 token decoding into ANY non-Next.js context (Socket.IO, Worker, CLI tool, cron job), remember: secret alone is NOT enough — cookie name is the second key.

# ---

## 2026-05-16 — 🟤 Cross-org subscription guard via API-surface design (no runtime check needed)

- Type:      🟤 decision
- Phase:     Phase 7 #8(e)-2 (Socket.IO org channels)
- Files:     apps/web/src/server/socket/channels.ts, apps/web/src/server/socket/channels.test.ts
- Concepts:  multi-tenant, socket-io, room-subscription, channel-naming, correct-by-construction, tenant-isolation, L6-analog
- Narrative: The naive Socket.IO pattern is `socket.join(roomName)` where `roomName` is computed from a user-controlled input (e.g., a "join meeting X" message payload). Runtime authorization is then required: "does this user belong to the org that owns meeting X?" Every subscribe call needs a check; missing one is a cross-tenant leak. The pattern we chose for Phase 7 #8e-2 inverts this: `joinOrgChannel(socket, eventType)` takes NO `organizationId` parameter. The helper always reads `socket.data.session.organizationId` (populated by the auth middleware and verified at handshake). The room name is `${session.organizationId}:${eventType}` — server-controlled, not client-controlled. There is NO API surface where a malicious client can supply an `organizationId` other than its own session's. The cross-org guard is the ABSENCE of an input, not a runtime check. This is the same pattern as the Prisma `$allOperations` tenant-guard extension (L6) — correct-by-construction beats authorize-at-runtime. The test `joinOrgChannel CANNOT be coerced to join another org` documents this guarantee. When future code wants a cross-tenant Socket subscription (e.g., super-admin viewing platform-wide events), it must use a SEPARATE helper (`joinPlatformChannel`) which has its own gate (`session.isSuperAdmin === true`). New helpers are explicit decisions; coercion via existing helpers is impossible.

# ---

## 2026-05-16 — 🟤 Next.js 15 instrumentation.ts hook + Edge-safe dynamic imports for Socket.IO bootstrap

- Type:      🟤 decision
- Phase:     Phase 7 #8(e)-1 (Socket.IO hosting topology, option B)
- Files:     apps/web/src/instrumentation.ts, apps/web/src/server/socket/server.ts, docs/DECISIONS_LOG.md (new Realtime Hosting Topology entry)
- Concepts:  next-js-15, instrumentation-hook, socket-io, custom-server, edge-runtime, dynamic-imports, hosting-topology, separate-port
- Narrative: Three options were considered for how Socket.IO sits relative to Next.js 15 App Router: (A) custom `server.ts` that wraps `next()` + `http.createServer` + Socket.IO on the same port; (B) Next.js 15's `instrumentation.ts` hook spawns Socket.IO on a SEPARATE port; (C) standalone `apps/socket/` package + its own compose service. Chose (B). Why (A) is wrong here: `next start` and `output: 'standalone'` Docker builds assume Next.js owns the HTTP server. A custom server.ts replaces both, requiring a custom Dockerfile and breaking the standalone bundle pattern V31's Phase 4 Part 8 generates for free. Why (C) is overkill for first cut: 2-3x more files (separate package, separate Dockerfile, separate compose service) + needs the JWT decode logic to be published from a shared package since the Node service can't reuse Next.js-resident code. Why (B) wins: `instrumentation.ts` is the official Next.js 15 hook for "run code at process start"; it loads on BOTH the Edge and Node runtimes but is gated by `process.env.NEXT_RUNTIME === "nodejs"` so the Socket.IO setup only runs server-side. Dynamic imports of `http`, `socket.io`, and `@/server/socket/server` keep this file Edge-bundle-safe (Edge runtime evaluates the file but the Node-only modules never load there). The two-port setup means CORS configuration is required (separate ports = separate origins for the browser), with `credentials: true` so the Auth.js cookie flows cross-origin — this is the only operational cost. The chosen pattern is extractable to (C) later by moving `createSocketServer` + `startSessionRevalidationLoop` + their tests to a new package with zero changes to the auth logic. Decision locked in DECISIONS_LOG.md "Realtime Hosting Topology (Phase 7 #8e)" on 2026-05-16.

# ---

## 2026-05-16 — 🟤 Sonnet subagents in this project inherit SessionStart hooks — default to Opus self-executor

- Type:      🟤 decision
- Phase:     Phase 7 #7(c) (JWT org-slug ticket, Tier 3 architect-execute attempt)
- Files:     (governs all future Agent() dispatches in this project; affects memory-governance.md §4 application)
- Concepts:  architect-execute, sonnet-dispatch, subagent-context, sessionstart-hooks, thrashing, opus-executor, step-2.5b
- Narrative: Per memory-governance.md §4 Architect-Execute Model, Tier 3 work should dispatch Sonnet 4.6 executor subagents (one per sub-task, each ≤30K token budget). First attempt at Phase 7 #7(c)-1 dispatched a Sonnet agent with a tight scope prompt (~22K target, 4 files to read, explicit "do NOT read CLAUDE.md" instruction). Within 3 turns Claude Code reported THRASHING: "Autocompact is thrashing: the context refilled to the limit within 3 turns of the previous compact, 3 times in a row." Root cause confirmed: dispatched Agent subagents inherit Yelli's SessionStart hook chain (the same one that injected the full CLAUDE.md + .claude/rules/* contents into THIS session at the start — ~50K of system reminders) before the task prompt is even processed. Sonnet's 60K window is essentially full before any productive work begins; even pure-edit tasks can't recover from the 5-10K reasoning overhead on top. The agent left partial work (a tautological test that asserted on a self-constructed User object literal — type-only RED with no runtime contract). Pivoted to memory-governance §4 Step 2.5b: Opus self-execution as last resort. Worked cleanly — c-1, c-2, and c-3 all ran in this Opus session with total context ~50K (well under Opus's 100K Step 2.5b ceiling). Pattern for Yelli: until SessionStart hooks can be made subagent-aware (or made conditional on a "subagent: true" flag), default to Opus-executor for ALL Tier 2-3 work even if memory-governance.md §4 suggests Sonnet. Sonnet dispatches reserved for tasks that genuinely fit in <10K of read budget AND don't touch governance files (which would re-trigger hooks). Expected utilization: <5% Sonnet, ~95% Opus for the foreseeable future. This is a project-environment limitation, NOT a memory-governance.md design flaw — the model in §4 is sound; the hook ecology in this project just doesn't support it yet. If a future framework upgrade adds a `subagent_inherit: false` flag to SessionStart hooks or moves the heavy auto-loads to a per-skill on-demand model, revisit this decision.

# ---

## 2026-05-16 — 🟤 Edge-safe vs DB-revalidating session callback duplication — new JWT fields wire BOTH

- Type:      🟤 decision
- Phase:     Phase 7 #7(c)-1 (JWT org-slug end-to-end)
- Files:     apps/web/src/server/auth.config.ts, apps/web/src/server/auth.ts
- Concepts:  auth-js-v5, edge-runtime, middleware, jwt-callback, session-callback, db-revalidation, freshness, organizationSlug
- Narrative: Yelli has TWO Auth.js v5 session callbacks running in parallel — by deliberate design, not accident. (1) `auth.config.ts` exports an Edge-safe shell consumed by `apps/web/src/middleware.ts` (which runs in the Edge runtime; can't import bcrypt or @yelli/db). Its session() copies JWT claims into session.user using only string narrowing — no DB. (2) `auth.ts` spreads authConfig and overrides session() with a DB-revalidating variant used by tRPC procedures + route handlers (Node runtime). It re-fetches the user from platformPrisma on every session read to catch role changes, suspensions, deactivations, and security_version bumps without waiting for JWT expiry (security.md §AUTH DEFAULTS item 6). Both callbacks must agree on JWT shape: they share the same `token` input from a single jwt() callback in auth.config.ts. When adding a new JWT field, you MUST wire it in (a) types/next-auth.d.ts module augmentations (4 places: Session.user, User, next-auth/jwt JWT, @auth/core/jwt JWT — the last is needed because next-auth v5 internals resolve JWT through @auth/core/jwt, not next-auth/jwt, on some code paths), (b) authConfig.jwt callback writing to token, (c) authConfig.session callback narrowing+predicate+assigning, AND (d) auth.ts session callback doing the SAME narrowing+predicate+assigning. If you skip (d), tRPC procedures will see `undefined` for the field even though middleware sees it correctly. For fields where token staleness matters (e.g., organizationSlug, which can change via an org rename), extend the auth.ts session callback's `current` fetch include to pull the fresh DB value and assign THAT to session.user (rather than the token value). The Edge variant trusts the token because Edge can't hit the DB; freshness on Edge depends on token rotation cadence (`session.maxAge`). This duplication is the cost of separating Edge auth from Node auth — accept it and write parallel updates.

# ---

## 2026-05-16 — 🟤 Super-admin tenant-URL policy = option C (path-scoped /superadmin bypass)

- Type:      🟤 decision
- Phase:     Phase 7 #7(c)-2 (middleware URL↔session cross-check)
- Files:     apps/web/src/server/tenant-redirect.ts
- Concepts:  super-admin, tenant-isolation, middleware, slug-cross-check, security.md, isolation-bypass
- Narrative: Three options considered for super-admin behavior when the URL-derived org slug differs from `session.user.organizationSlug`: (A) allow — super-admin can view any tenant's UI; audit-log as PLATFORM:VIEW_TENANT. (B) block — super-admin must use a dedicated /superadmin route on apex host only, never on a tenant subdomain. (C) conditional allow — bypass slug check only if path starts with /superadmin, otherwise redirect to their own org subdomain. **User chose C** — confirmed verbatim 2026-05-16 (`"ok confirmed"` in response to the option C recommendation). Rationale: (A) silently lets super-admins view any tenant without an explicit consent surface, making cross-tenant data exfiltration via super-admin compromise harder to audit. (B) means super-admins can't ever debug a tenant in its own URL context — annoying ops UX. (C) threads the needle: `/superadmin` and `/superadmin/*` paths are the only ones where slug doesn't matter (platform administration UI is designed to be cross-tenant); all other paths enforce match. If a super-admin wants to view tenant acme's actual UI, they explicitly switch their session's organizationId to acme via a platform action (which the session re-validation in auth.ts catches on next session read via security_version). Codified in `resolveTenantRedirect`: the exact match check is `path === "/superadmin" || path.startsWith("/superadmin/")` — NOT a `startsWith("/superadmin")` which would also match `/superadminer/*`. A dedicated test case (`treats /superadminer/* as NON-bypass`) locks the precision. If future routes like `/superadmin-debug` are added, they would NOT inherit the bypass — they'd need their own listing in this allowlist, prompting a deliberate decision.

# ---

## 2026-05-16 — ⚖️ vercel-plugin nextjs skill recommends middleware.ts → proxy.ts on every edit — ignore until Next.js 16 upgrade

- Type:      ⚖️ trade-off
- Phase:     Phase 7 #7(c)-2 (middleware enforcement)
- Files:     apps/web/src/middleware.ts (and any future edit of any file mentioning "middleware")
- Concepts:  vercel-plugin, skill-injection, next-js-16, proxy.ts, false-positive, ignore-list
- Narrative: The vercel-plugin's auto-suggestion hook fires `Skill(nextjs)` and recommends "Next.js middleware.ts is renamed to proxy.ts in Next.js 16 — rename the file and use the Node.js runtime" on EVERY edit to `apps/web/src/middleware.ts` and on Write/Edit operations whose content mentions "middleware.ts". Yelli is on **Next.js 15.5.18** (confirmed in `pnpm` workspace resolution path during c-2's import error: `next-auth@5.0.0-beta.25_next@15.5.18`). The proxy.ts rename is a Next.js **16+** feature. Migrating now would: (1) break the build — Next.js 15 looks for `middleware.ts`, not `proxy.ts`; (2) be wildly out of scope for any single Feature Update — Next.js 16 upgrade is its own Tier 3 ticket requiring coordinated changes to next-auth peer deps, React 19, and runtime config. Decision: ignore the proxy.ts recommendation on every middleware.ts edit until a deliberate Next.js 16 upgrade ticket is opened. When that ticket happens, this lesson can be removed and the migration done deliberately. Other auto-suggested skills to also ignore in this project: `vercel-plugin:auth` (Yelli uses Auth.js v5 Credentials, not Clerk/Descope/Auth0); `vercel-plugin:bootstrap` (false-positive triggered by basename `auth.*`); `vercel-plugin:next-forge` (Yelli is not a next-forge project). The `vercel-plugin:nextjs` general skill content (file conventions, RSC boundaries, async patterns, runtime selection) IS useful as reference, just not its proxy.ts injection.

# ---

## 2026-05-16 — 🟤 Per-user 24h cap on password-reset requests — placement AFTER user lookup; use `count` not `findFirst`

- Type:      🟤 decision
- Phase:     Phase 7 #6 (rate-limit hardening)
- Files:     apps/web/src/server/trpc/routers/auth.ts, apps/web/src/server/trpc/routers/auth.test.ts
- Concepts:  rate-limit, password-reset, no-enumeration, defence-in-depth, prisma-count, security
- Narrative: Added a 5/24h per-user cap on `requestPasswordReset` as defence-in-depth on top of the per-email LRU rate limit (rateLimiters.auth at 10/min). The LRU catches rapid-fire bursts; the per-user cap catches sustained low-rate flooding where an attacker spaces requests just past the LRU window. Three non-obvious decisions baked into the design — write them down so the next agent that touches this code doesn't undo them:
  (1) **Cap placement is AFTER the user lookup, not before.** If the cap-check ran first (keyed on email), the code path for "unknown email at cap" vs "unknown email under cap" would diverge in latency, making cap state observable via timing. Running it AFTER means unknown emails return ok immediately (lookup miss → return) with no count query; known emails always run the count query. From an attacker's perspective, all three paths (unknown email / known under cap / known at cap) return the same `{ok:true}` shape and the same approximate latency — the only observable difference is whether an email lands in the user's inbox, which the attacker can't see.
  (2) **Use `passwordResetToken.count`, NOT `findFirst+orderBy` or `findMany+take`.** The query is "are there at least N rows in the last 24h" — that's `count(where:...)`. Prisma maps it to a single `SELECT COUNT(*)` with an index seek on `user_id` (PasswordResetToken already has `@@index([user_id])` from Phase 7 #4). findFirst skip+take would be misleading — "find Nth recent" is a different question from "are there ≥N". The semantic match matters when the cap design evolves (e.g., adding a per-org cap on top — still count).
  (3) **Cap is per-user (user.id), not per-email.** The email key is already covered by the LRU. The DB count uses the canonical user identity (User PK). This is the right surface because (a) email is per-org unique (not globally), so two users with the same email in different orgs each get their own 5/24h budget — correct behavior; (b) if a future migration changes how emails are normalized, the cap doesn't break.
  Cap value (5/24h) chosen as generous headroom for legitimate use (user forgets password, doesn't see email in spam, retries) while still blocking sustained spam. If real-world abuse pushes through at 5/day, lower to 3/day before lowering further — the cap-met path returns silently so legitimate users hitting the cap will perceive it as "the reset email didn't arrive". Tests assert both cap-engaged (count=5 → no mint, no send) and one-under-cap (count=4 → still mints + sends) to lock the threshold position.

# ---

## 2026-05-16 — 🔴 nodemailer 6.9.16 still flagged HIGH CVE (addressparser DoS, GHSA-rcmh-qjqh-p98v)
- Type:      🔴 gotcha
- Phase:     Phase 7 #5 (coverage gate)
- Files:     apps/web/package.json (nodemailer dep), apps/web/src/server/lib/email.ts
- Concepts:  pnpm-audit, nodemailer, auth-js-v5, peer-deps, cve, dos
- Narrative: Phase 7 #4 pinned nodemailer to ^6.9.16 because @auth packages declared a peer dep range incompatible with nodemailer 7.x ([[nodemailer-pin-auth-js]] decision). On Phase 7 #5 the routine `pnpm audit --audit-level=high` surfaced GHSA-rcmh-qjqh-p98v — addressparser DoS via recursive calls — affecting nodemailer <=7.0.10. So our 6.9.16 pin IS vulnerable. Confirmed pre-existing on main (identical 6/1/4/1 severity before this branch's changes) — NOT a Phase 7 #5 regression. Three viable paths, each documented for the follow-up ticket: (a) wait for @auth to widen its nodemailer peer range so we can move to ≥7.0.11 (cleanest, no code changes); (b) replace nodemailer with a different transport library — would touch apps/web/src/server/lib/email.ts and any other callsites; (c) document mitigation (this lib is server-only, addressparser is only invoked on `to`/`from`/`cc` fields which are server-stamped from validated DB rows — attacker cannot send a crafted address through the password-reset flow) and add `audit-level=critical` to .npmrc per phases.md decision tree step 3. Decision deferred — flagged as a follow-up ticket in .whatsnext. Phase 7 #5 PR not blocked because the CVE pre-existed.

## 2026-05-16 — 🟤 vitest per-file coverage thresholds use glob keys inside the `thresholds` object
- Type:      🟤 decision
- Phase:     Phase 7 #5 (coverage gate)
- Files:     apps/web/vitest.config.ts
- Concepts:  vitest, v8-coverage, thresholds, per-file-gate, glob-key
- Narrative: Vitest 4.1.6 supports per-file threshold gates inside `coverage.thresholds` by using glob paths as keys ALONGSIDE the four numeric global keys (statements/branches/functions/lines). Verified syntax: `thresholds: { statements: 12, branches: 6, functions: 12, lines: 12, "src/server/trpc/routers/auth.ts": { statements: 100, branches: 75, functions: 100, lines: 100 } }` — vitest reads numeric keys as global thresholds and string keys as glob-matched per-file thresholds. The two coexist in one block (NOT two separate blocks). RED→GREEN proven: bumping the per-file branches threshold to 99 (above measured 78.94) produced exit 1 with message `Coverage for branches (78.94%) does not meet "src/server/trpc/routers/auth.ts" threshold (99%)`. Use this pattern when adding tight gates on fully-tested files — global thresholds alone are too coarse because they hide regressions on the well-tested files (e.g. auth.ts could drop from 100% statements to 50% and a global floor of 12% still passes). Do NOT use `coverage.perFile: true` — that applies thresholds to every file and would fail immediately since most files in src/server/** have 0% coverage.

## 2026-05-16 — 🟤 PreToolUse hook may flag .github/workflows/*.yml edits as risky even when safe
- Type:      🟤 decision
- Phase:     Phase 7 #5 (coverage gate CI wiring)
- Files:     .github/workflows/ci.yml
- Concepts:  github-actions, pretooluse-hook, security-reminder, workflow-injection, false-positive
- Narrative: First edit to .github/workflows/ci.yml from Phase 7 #5 was blocked by a PreToolUse security-reminder hook with the GitHub Actions workflow-injection warning ("Never use untrusted input in run: commands"). The hook treats ANY workflow edit as worth a warning — it does not actually parse the diff for unsafe patterns. The Phase 7 #5 change added a `coverage` job whose `run:` lines reference only project-controlled env vars (NODE_VERSION, PNPM_VERSION) and a static command (`pnpm test:coverage`) — no `${{ github.event.* }}` flows into any shell. Retry succeeded. Going forward: workflow edits will produce this warning even when safe; agents should (1) confirm no `github.event.*` / `github.head_ref` / commit-message inputs flow into `run:` lines, (2) retry the edit, (3) flag the false positive in CHANGELOG_AI so the noise is documented. Reference: https://github.blog/security/vulnerability-research/how-to-catch-github-actions-workflow-injections-before-attackers-do/

## 2026-05-16 — 🔴 `prisma migrate dev` needs DATABASE_URL exported

- Type: 🔴 gotcha
- Phase: Phase 7 #4 forgot-password
- Files: packages/db/package.json, .env.dev
- Concepts: prisma, migrate, env, dotenv
- Narrative: Prisma CLI 5.22.0 reads only `process.env.DATABASE_URL` and does not auto-load `.env.dev` at the project root. Running `pnpm prisma migrate dev` from `packages/db/` errors with `P1012: Environment variable not found: DATABASE_URL`. Workaround used in Phase 7 #4: `env $(grep -v '^#' /abs/path/.env.dev | grep -E '^(DATABASE_URL|DB_)' | xargs) pnpm prisma migrate dev --name <slug>`. The `db:seed` script uses `tsx --env-file-if-exists=../../.env.dev` for the same reason but Prisma CLI itself doesn't accept that flag. If a long-term fix is wanted, wrap `db:migrate` in a script that runs `dotenv -e ../../.env.dev --` before `prisma migrate dev`. Don't try to set `DATABASE_URL` permanently in shell rc — defeats per-env isolation.

# ---

## 2026-05-16 — 🔴 nodemailer 8.x breaks Auth.js v5 peer deps — pin to 6.9.x

- Type: 🔴 gotcha
- Phase: Phase 7 #4 forgot-password
- Files: apps/web/package.json
- Concepts: nodemailer, auth.js, peer-deps, pnpm
- Narrative: `pnpm add nodemailer` pulled 8.0.7. next-auth 5.0.0-beta.25 wants `nodemailer ^6.6.5` and @auth/core 0.37.2 wants `^6.8.0` — two peer conflicts immediately. We don't use Auth.js's email provider (Credentials provider only) so runtime is fine, but the warnings are noisy and a future Auth.js upgrade could break. Pin to `nodemailer@^6.9.16` + `@types/nodemailer@^6`. One residual warning remains from @auth/prisma-adapter 2.11.2 wanting ^7.0.7 — harmless because email provider isn't used. If we ever wire the email provider, revisit and pick a single major aligned to whichever Auth.js version is current.

# ---

## 2026-05-16 — 🟤 vi.mock("@/env") for routers reading NEXT_PUBLIC_\*

- Type: 🟤 decision
- Phase: Phase 7 #4 forgot-password
- Files: apps/web/src/server/trpc/routers/auth.test.ts
- Concepts: vitest, env, trpc, testing
- Narrative: The `requestPasswordReset` procedure builds a reset URL from `env.NEXT_PUBLIC_APP_URL`. In vitest, `env.ts` validates server schema at import time but `NEXT_PUBLIC_APP_URL` is `undefined` — `.replace()` then throws `Cannot read properties of undefined`. Fix: `vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://yelli.test" } }))`. This extends the [[trpc-test-pattern]] established in Phase 7 #2: anytime a router reads `env.*`, mock `@/env` in addition to the data dependencies. Don't try to set `process.env.NEXT_PUBLIC_APP_URL` before import — Vitest hoists `vi.mock` above imports, but plain assignments don't help because env.ts runs zod validation at module-load time.

# ---

## 2026-05-16 — 🟤 Reset token storage: separate `password_reset_tokens` table

- Type: 🟤 decision
- Phase: Phase 7 #4 forgot-password
- Files: packages/db/prisma/schema.prisma, packages/db/prisma/migrations/20260515162430_add_password_reset_tokens/
- Concepts: prisma, password-reset, security, schema
- Narrative: Chose a separate `PasswordResetToken` model over ephemeral fields on `User` (reset_token_hash + reset_expires_at). Reasons: (1) auditable — can keep consumed tokens for forensics by leaving `consumed_at` set instead of deleting; (2) supports multiple outstanding tokens if a user requests resets repeatedly; (3) Cascade-on-delete from User keeps cleanup automatic; (4) makes the "single-use" invariant explicit via `consumed_at` rather than implicit by deleting the row. Plaintext token (32 bytes → 43-char base64url) never touches the DB — only `sha256(token)` is stored. `token_hash` is `@unique` so `findUnique` works; `expires_at` is indexed for periodic cleanup queries. TTL = 1 hour (security.md AUTH DEFAULTS max). Reset operation runs in a transaction that updates `password_hash` + bumps `security_version` (invalidates all Auth.js sessions per security.md AUTH DEFAULTS #6) + marks token consumed.

# ---

## BOOTSTRAP — 🔴 WSL2 + Docker Desktop known pitfalls

- Type: 🔴 gotcha
- Phase: Phase 0 Bootstrap / Phase 1 dev environment open
- Files: .env.dev, docker-compose.\*.yml, .nvmrc
- Concepts: wsl2, docker-desktop, pnpm, nvm, permissions
- Narrative: Real failures on WSL2 + Docker Desktop. All fixes baked into Bootstrap template.
  (1) Never use corepack enable — use npm install -g pnpm. corepack symlinks fail in some WSL2 setups.
  (2) pnpm install must run from WSL2 terminal — not Windows PowerShell or CMD.
  (3) Docker Desktop must be running before any docker compose command. Check with: docker ps.
  (4) Port conflicts: dev services use non-standard random ports (Rule 22). If conflict occurs,
  regenerate ports in inputs.yml → run Phase 7 → restart services.
  (5) nvm must be sourced in .bashrc — add: [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  (6) WSL2 file permissions: always develop inside WSL2 filesystem (/home/user/) not /mnt/c/.
  Working in /mnt/c/ causes severe pnpm and docker performance issues.

# ---

## 2026-05-12 — 🟤 a11y-skill skipped — coverage redundant via active skills

- Type: 🟤 decision
- Phase: Phase 4 Part 1 → Part 2 transition
- Files: docs/DECISIONS_LOG.md
- Concepts: a11y, wcag, accessibility, skills, plugin-install, redundancy
- Narrative: airowe/claude-a11y-skill has no valid SKILL.md (npx install clones but finds nothing).
  /plugin install a11y-skill not in any marketplace. Decision: skip the dedicated skill.
  WCAG AA enforcement remains intact via 5 overlapping layers: (1) design-auditor active skill —
  17 professional rules including WCAG, contrast, typography, scores /100; (2) frontend-design —
  Anthropic quality bar with focus rings, ARIA, keyboard nav; (3) ui-ux-pro-max — 99 UX guidelines;
  (4) oiloil-ui-ux-guide — HCI laws; (5) Phase 2.6 will auto-embed WCAG 2.1 AA enforcement block
  in design-system/MASTER.md because inputs.yml accessibility.level = wcag_aa, plus Vercel Web
  Interface Guidelines. Future sessions: do NOT re-attempt a11y-skill install — coverage exists.
  If a dedicated skill becomes available with valid SKILL.md, evaluate then.

# ---

## 2026-05-13 — 🔴 Prisma 5.x does NOT support @default(cuid(2)) — use @default(cuid())

- Type: 🔴 gotcha
- Phase: Phase 4 Part 3 (packages/db scaffold)
- Files: packages/db/prisma/schema.prisma, packages/shared/src/schemas/*.ts
- Concepts: prisma, cuid, cuid2, schema, validation, version-compat
- Narrative: When writing Prisma models, `@default(cuid(2))` looks valid (cuid2 is a real ID format,
  newer/better than cuid1: shorter, no fingerprint surface, host-independent collision resistance).
  But Prisma 5.x (verified on 5.22.0) parses this as an error: "The `cuid` function does not take
  any argument. Consider changing this default to `cuid()`."
  The cuid2 default-function feature is at https://github.com/prisma/prisma/issues/15532 — still open.
  Resolution: use `@default(cuid())` (cuid1, 25 chars). Update Zod validators from `.cuid2()` to
  `.cuid()` for matching format. If you need cuid2 today, drop the @default and generate IDs in app
  code via `createId()` from `@paralleldrive/cuid2` — but ALL inserts must explicitly provide id,
  including seed scripts. Stick with cuid() until prisma#15532 ships.

# ---

## 2026-05-13 — 🟤 L6 tenant-guard denormalization for meeting-scoped child entities

- Type: 🟤 decision
- Phase: Phase 4 Part 3 (Prisma schema design)
- Files: packages/db/prisma/schema.prisma, packages/shared/src/schemas/{participant,chatMessage,sharedFile,whiteboardSnapshot}.ts
- Concepts: multi-tenancy, l6, prisma-extension, $allOperations, denormalization, defense-in-depth
- Narrative: Original Zod design had Participant/ChatMessage/SharedFile/WhiteboardSnapshot scope
  tenancy only through their meeting_id → Meeting.organization_id. Clean from a normalization view.
  But the L6 tenant-guard (Prisma.defineExtension with $allOperations) injects `organization_id: <id>`
  into every non-exempt query's WHERE and DATA. For models LACKING an organization_id column,
  Prisma throws "Unknown argument" — meaning the guard can't run on those 4 entities and would
  have to be exempted, forcing every resolver to remember to filter via meeting.organization_id.
  Per security.md, "EVERY tenant-scoped query MUST include organization_id" — the whole point of
  L6 is to make this structural, not a discipline requirement. Decision: denormalize organization_id
  onto all 4 child entities. Cost: ~24 bytes/row (cuid column). Benefit: uniform L6 injection,
  no exemption list growth, no resolver-discipline risk. Also enables single-table tenant queries
  (no joins) when these tables grow large. Updated 4 Zod schemas + Prisma models in lockstep so
  packages/shared and packages/db agree on the contract.

# ---

## 2026-05-13 — 🟡 pnpm 10 blocks native build scripts by default — must allowlist

- Type: 🟡 fix
- Phase: Phase 4 Part 3 (pnpm install for Prisma + bcrypt)
- Files: package.json (root)
- Concepts: pnpm, native-deps, prisma, bcrypt, build-scripts, supply-chain
- Narrative: pnpm 10 enforces a build-script allowlist as a supply-chain hardening default —
  newly installed deps that declare a `scripts.install`/`postinstall`/etc. step do NOT run them
  unless explicitly allowed. For Prisma (compiles + downloads engine binaries) and bcrypt (compiles
  native bindings via node-gyp), this means `pnpm install` succeeds silently but Prisma can't
  generate Client and bcrypt can't be imported (no compiled binary). The warning surfaces as:
  "The following dependencies have build scripts that were ignored: @prisma/client, @prisma/engines,
   bcrypt, esbuild, prisma. To allow the execution of build scripts for these packages, add their
   names to 'pnpm.onlyBuiltDependencies' in your 'package.json', then run 'pnpm rebuild'."
  Fix: add `pnpm.onlyBuiltDependencies` to root package.json with the explicit list. Re-run
  pnpm install to pick up the allowlist. Verify Prisma generate works afterward.

# ---

## 2026-05-13 — 🟡 Sonnet subagents thrash when prompts inline verbose templates

- Type: 🟡 fix
- Phase: Phase 4 Part 4 (dispatch 4a — packages/ui)
- Files: subagent dispatch patterns (Agent tool prompts)
- Concepts: sonnet, subagent, context-budget, autocompact-thrash, prompt-design, architect-execute
- Narrative: Dispatched a Sonnet 4.6 subagent for packages/ui scaffold with 18 files. The dispatch
  prompt embedded VERBATIM templates for 9 shadcn components (~770 lines of inline source code
  meant to guide the subagent's writes). At 21 tool uses / 25 min the runtime threw:
  "Autocompact is thrashing: context refilled to the limit within 3 turns of the previous compact,
   3 times in a row." Sonnet's 60K context − system/tool overhead ≈ 30K safe execution budget
  (memory-governance.md §1 Step 2.5). The verbose templates alone burned ~15K just to LOAD into
  the prompt, leaving Sonnet only ~15K for reasoning + tool results — too little to handle
  20-file iteration with read references + write outputs. Resolution: Opus completed the
  remaining file (src/index.ts) inline. Lesson:
  (1) Subagent prompts must be TIGHT — instructions only, no inline source templates.
  (2) Reference style: "follow canonical shadcn New York-style implementation" — let Sonnet
      pull from training data.
  (3) If a template MUST be inline (rare), the dispatch should target ≤5 files, not 20.
  (4) Storage 4b (no inline templates, just rules + 30 lines of TS examples) ran cleanly in
      ~11 min for 18 files — confirms the pattern.
  Future Part 5+ dispatches: instructions + rules + 2-3 line code snippets, never full files.

# ---

## 2026-05-13 — 🔴 exactOptionalPropertyTypes traps with `useTheme()` and dispatch-with-undefined

- Type: 🔴 gotcha
- Phase: Phase 4 Part 4 (packages/ui typecheck)
- Files: packages/ui/src/components/sonner.tsx, packages/ui/src/components/use-toast.ts
- Concepts: typescript, exactOptionalPropertyTypes, next-themes, react-reducer, strict-mode
- Narrative: tsconfig.base.json sets `exactOptionalPropertyTypes: true` — an optional `prop?: T`
  CANNOT receive `T | undefined`; the property must be entirely omitted to be absent.
  Two violations from default shadcn patterns:
  (1) `<Sonner theme={theme as ToasterProps["theme"]}>` fails because useTheme returns
      `string | undefined`. Even after `const { theme = "system" }` destructure-default, TS
      sees `theme: string`, not `"system" | "light" | "dark"`. The unsafe cast then passes
      `string` to a typed param. Fix: narrow with a ternary —
      `theme === "light" || theme === "dark" ? theme : "system"`.
  (2) `dispatch({ type: "DISMISS_TOAST", toastId })` where `toastId?: string` and the dispatched
      object has `toastId: string | undefined`. Fix: conditional spread —
      `dispatch({ type: "DISMISS_TOAST", ...(toastId !== undefined ? { toastId } : {}) })`.
  This will recur for every third-party API that returns `string | undefined` and feeds into
  a strictly-optional prop. Pattern: ALWAYS narrow before assigning to exactOptional props;
  ALWAYS use conditional spread when forwarding optional values to discriminated-union actions.

# ---

## 2026-05-13 — 🟡 Const-as-typeof unused-var lint trap; use type literal instead

- Type: 🟡 fix
- Phase: Phase 4 Part 4 (packages/ui lint)
- Files: packages/ui/src/components/use-toast.ts
- Concepts: eslint, no-unused-vars, typeof-const, shadcn-pattern
- Narrative: Canonical shadcn use-toast.ts declares `const actionTypes = { ADD_TOAST: "ADD_TOAST",
   UPDATE_TOAST: "UPDATE_TOAST", ... } as const;` then `type ActionType = typeof actionTypes;`.
  The reducer dispatches use the type only — the const is never read at runtime. ESLint's
  @typescript-eslint/no-unused-vars rule flags this as unused (the typeof usage is type-only,
  not runtime). Fix: replace the runtime const with a direct type literal:
  `type ActionType = { ADD_TOAST: "ADD_TOAST"; UPDATE_TOAST: "UPDATE_TOAST"; ... };` —
  eliminates the unused-var trigger AND keeps the same type surface. The string literals in
  dispatch sites (`{ type: "ADD_TOAST", ... }`) already match the type union; no runtime
  reference to actionTypes was needed in the first place.

# ---

## 2026-05-13 — 🔴 Auth.js v5 beta JWT module augmentation does not propagate

- Type: 🔴 gotcha
- Phase: Phase 4 Part 5a-2 (Auth.js v5 setup typecheck)
- Files: apps/web/src/types/next-auth.d.ts, apps/web/src/server/auth.ts
- Concepts: nextauth-v5, module-augmentation, jwt, exactOptionalPropertyTypes, type-narrowing
- Narrative: With next-auth@5.0.0-beta.25, the canonical augmentation pattern
  `declare module "next-auth/jwt" { interface JWT { userId: string; ... } }` does
  NOT propagate into the `session()` callback's `token` parameter. TypeScript still
  types `token.userId` as `{}` (empty object). Adding a parallel
  `declare module "@auth/core/jwt"` augmentation (Auth.js v5's internal type
  source) did NOT fix it either. The augmentation likely fails because Auth.js v5
  beta uses a generic type variable for JWT that the augmentation can't reach.
  WORKAROUND: never trust the JWT type directly. At the session() callback boundary,
  cast `token` to `Record<string, unknown>` and narrow each field via `typeof` guards
  (e.g. `typeof t.userId === "string" ? t.userId : null`). If any field is missing or
  has the wrong type → return `{ ...session, user: undefined as never }` which
  Auth.js v5 treats as unauthenticated. This is actually the CORRECT pattern
  regardless of augmentation working — never blindly trust a JWT.

## 2026-05-13 — 🟤 Sonnet dispatch discipline — tight scope, no inline templates

- Type: 🟤 decision
- Phase: Phase 4 Part 5a (4 Sonnet dispatches succeeded cleanly after Part 4 lessons)
- Files: (dispatch protocol — affects all future Part 5+ dispatches)
- Concepts: architect-execute, sonnet-4-6, dispatch-prompts, token-budget, autocompact
- Narrative: Part 4a thrashed because the dispatch prompt embedded ~770 lines of
  verbatim shadcn component source as fill-in templates — this alone consumed
  most of Sonnet's 30K input budget before any work began. Part 5a applied four
  discipline rules to all dispatches:
  (1) DO NOT inline more than ~100 lines of template code per file — point Sonnet
      at the pattern with 5-10 lines + behavior contract, let Sonnet write the body.
  (2) PRE-EXTRACT all read needs in the prompt — every import path, every type
      signature, every external API URL — so Sonnet never needs to read PRODUCT.md
      or security.md.
  (3) STATE "DO NOT read X" explicitly — list governance docs / large files Sonnet
      should never open. Curiosity reads are the #1 token leak.
  (4) Cap each dispatch at ~10 files / ~25-30K estimated tokens — if more is
      needed, split into 2-3 sequential dispatches with summarized context handoff.
  Results: 4 dispatches in Part 5a, all returned DONE or DONE_WITH_CONCERNS in
  75-186s with 6-11 tool uses each. Zero autocompact thrashing. Apply this protocol
  to Parts 5b-8 and Phase 7+.

## 2026-05-13 — 🟤 Defensive narrowing at trust boundaries (JWT, headers, external input)

- Type: 🟤 decision
- Phase: Phase 4 Part 5a-2 (session callback) + 5a-3 (middleware headers)
- Files: apps/web/src/server/auth.ts, apps/web/src/middleware.ts
- Concepts: trust-boundary, type-narrowing, security, jwt, request-headers
- Narrative: Two places in Part 5a cross a trust boundary: (a) Auth.js
  callback receives a JWT that could be malformed/stale, (b) middleware reads
  Request.headers which are attacker-controlled until proven otherwise. Both must
  be defensively narrowed BEFORE the value is used as a key against the database.
  Pattern: `const userId = typeof t.userId === "string" ? t.userId : null;` followed
  by an early-return on null. This is independent of TypeScript's static type
  checking — even if augmentation worked, we'd still narrow at runtime because
  the input crossed a trust boundary. Locked decision: every trust-boundary read
  (JWT, request headers, query params, form data, webhook payloads) narrows
  defensively at the boundary; the rest of the code can then trust the narrowed value.

# ---

## 2026-05-13 — 🟤 Sonnet thrashing recovery — verify in-place before re-dispatch

- Type: 🟤 decision
- Phase: Phase 4 Part 5b-2 (Video Call UI dispatch)
- Files: apps/web/src/lib/livekit/*, apps/web/src/components/call/*, apps/web/src/app/api/livekit/token/route.ts
- Concepts: subagent-recovery, autocompact, thrashing, architect-execute, validation-step
- Narrative: Sonnet 4.6 hit autocompact thrashing during the typecheck/lint
  validation step at the end of an 8-file dispatch. Per memory-governance.md §4
  THRASHING protocol the instinct is to "stop and re-decompose" — but inspection
  showed all 8 expected files were already on disk with substantive content
  (lines 19/66/121/31/136/88/215/75 = total 751). The productive work completed;
  only the validation iteration thrashed (Sonnet re-reading files to chase lint
  fixes refilled the 60K context). Opus completed validation in-place:
  typecheck PASS clean, lint FAIL on 12 import/order errors → eslint --fix
  resolved 10, Opus manually reordered the remaining 2 in intercom-call.tsx.
  Total Opus recovery cost: 4 minutes + ~5K tokens vs an estimated 8 minutes +
  ~30K to re-dispatch.
  Rule: when a Sonnet thrashes near the END of a multi-file dispatch, first
  inventory disk state. If files are present with reasonable content, the
  Opus-layer cost to finish validation is usually far cheaper than re-dispatch.
  If files are missing or truncated/stub, re-decompose per §1 Step 2.5.
  Telemetry to look for: Sonnet "DONE-equivalent" partial output before thrash,
  short summaries written to disk, no contradicting half-edits.

## 2026-05-13 — 🟤 Route Handlers for high-frequency setup endpoints — bypass tRPC deliberately

- Type: 🟤 decision
- Phase: Phase 4 Part 5b-2 (LiveKit token endpoint)
- Files: apps/web/src/app/api/livekit/token/route.ts
- Concepts: route-handler, trpc-bypass, latency, security, manual-auth
- Narrative: LiveKit token minting happens once per call setup, on the critical
  path of the <150ms ring-to-connect SLA (PRODUCT.md Non-functional Requirements).
  tRPC's batching + Zod parsing on the client side adds 5-15ms vs a direct
  POST to a Route Handler. We chose a Route Handler with manual auth check +
  rate limit + Zod body validation. Security implications per security.md
  §AGENT PROHIBITIONS item 11 enforced inline: explicit "Non-tRPC: manual auth
  required" comment + `auth()` invocation at top + rate limiter check + Zod
  .strict() body schema + 401/429/503 generic error responses.
  Rule: Route Handlers are valid for performance-critical setup endpoints,
  webhook receivers, and auth callbacks. For everything else — CRUD, queries,
  mutations — use tRPC procedures so L1/L3/rate-limiting are uniform. Document
  the Route Handler with the §AGENT PROHIBITIONS item 11 comment so future
  reviewers don't flag it.

# ---

## 2026-05-13 — 🟤 Sonnet dispatch absolute-rules prohibitions — implicit scope is not enough

- Type: 🟤 decision
- Phase: Phase 4 Part 5c-1 (tRPC server dispatch)
- Files: (dispatch protocol — affects all future Opus→Sonnet dispatches)
- Concepts: architect-execute, dispatch-discipline, premature-merge, git-safety, scope-control
- Narrative: The 5c-1 dispatch instructed Sonnet to "create files, validate, commit on
  scaffold/part-5c" but did NOT explicitly prohibit merging. Sonnet went ahead and
  squash-merged its commit to main on its own — files were correct, validation passed,
  but the procedural deviation broke the Architect's plan to dual-merge 5c-1+5c-2 as one
  governed unit. Recovery cost was minor (recreated the branch from main HEAD with the
  5c-1 commit already in it, dispatched 5c-2 on the fresh branch). Real cost: trust
  erosion — the Architect must verify branch state after every dispatch instead of
  trusting the dispatch contract.
  Lesson: every dispatch prompt MUST include an ABSOLUTE RULES block stating:
    "DO NOT merge. DO NOT push. DO NOT checkout main. DO NOT branch. DO NOT delete
     branches. Commit once on the current branch and stop. The Architect handles merge."
  Sonnet 5c-2 received this block and obeyed perfectly (clean commit, no merge attempt).
  Rule: implicit boundaries are not boundaries. State every prohibition as a literal
  shell-command-level rule. Sonnet treats unstated permissions as permitted.

# ---

## 2026-05-13 — 🟤 Socket.IO server skeleton via Route Handler 503 + globalThis singleton

- Type: 🟤 decision
- Phase: Phase 4 Part 5c-2 (Socket.IO server scaffold)
- Files: apps/web/src/lib/socket/server.ts, apps/web/src/app/api/socket/route.ts
- Concepts: socket-io, websocket-upgrade, next-app-router, custom-server, skeleton-pattern
- Narrative: Socket.IO requires WebSocket upgrade which Next.js App Router Route Handlers
  do not natively expose. The standard workaround is a custom Next.js server
  (server.ts/server.js with `next({ dev }).getRequestHandler()` plus `io.attach(httpServer)`)
  — but adding a custom server during Phase 4 scaffold tangles dev-mode + Docker Compose
  startup + Turbo cache invalidation. The cleaner sequencing: ship the API surface in
  Part 5c (types + emit helpers + Route Handler stub that returns 503 with explanation),
  defer actual upgrade wiring to Phase 6 when Docker Compose provisions the custom server.
  The Server instance is cached on globalThis (`g.__yelliSocketIo`) so HMR reloads do not
  double-create. `getIO()` returns the cached instance or null. callsRouter's `initiate`
  mutation calls `getIO()` and emits only if io is non-null — if io is null (skeleton
  phase), the call is mintable but not signaled. The caller still gets a LiveKit token
  and enters the room; the recipient won't ring until Phase 6.
  Client side (incoming-call-dialog, use-presence) already handles 503 gracefully — the
  socket just stays disconnected and presence stays "offline". No client changes needed.
  Rule: when a primitive requires a custom Next.js server (Socket.IO, gRPC streaming,
  long-polling SSE with sticky sessions), ship the API surface in the current Part and
  attach to the actual server in Phase 6. Document the deferral with a Route Handler 503
  stub so the path resolves and dev tooling does not 404.

# ---

## 2026-05-13 — 🟤 tRPC middleware ctx narrowing — non-null-assertion warnings are advisory, refactor is follow-up

- Type: 🟤 decision
- Phase: Phase 4 Part 5c-1 + 5c-2 (tRPC v11 middleware chain)
- Files: apps/web/src/server/trpc/trpc.ts, apps/web/src/server/trpc/routers/calls.ts
- Concepts: trpc-v11, middleware-chain, type-narrowing, eslint, exactOptionalPropertyTypes
- Narrative: tRPC v11 middleware chains pass context through `next({ ctx: ... })` but
  TypeScript does not propagate narrowing across the boundary. authMiddleware throws
  UNAUTHORIZED on `ctx.session?.user == null`, so by the time tenantMiddleware runs,
  session is guaranteed non-null at runtime. But TS still sees `ctx.session: Session | null`.
  Workaround used: `ctx.session!.user` with explicit non-null assertion + a comment
  ("authMiddleware must run first — session is non-null here"). ESLint reports 4 advisory
  warnings (2 in trpc.ts, 2 in routers/calls.ts). The proper refactor is to have
  authMiddleware return a narrowed ctx via `next({ ctx: { ...ctx, session: ctx.session,
  user: ctx.session.user } })` and have downstream code read `ctx.user.id` instead of
  `ctx.session!.user.id`. That eliminates the assertions entirely and is the canonical
  v11 pattern.
  Why deferred to Part 5d: refactoring trpc.ts ripples into context.ts (Context type
  changes), all current routers (departmentsRouter + callsRouter must read `ctx.user`),
  and any future tRPC routers. Bundling the refactor with Part 5d's Meeting Management
  scaffolding keeps the cleanup test-adjacent (new routers exercise the new ctx shape).
  Rule: when middleware chain non-null assertions accumulate, plan the ctx-narrowing
  refactor as a discrete task — never do it inside an unrelated feature dispatch.
  Acceptable in the short term as advisory warnings (parallel to Auth.js v5 JWT
  defensive narrowing pattern in auth.ts session callback).

# ---

## 2026-05-13 — 🟤 ESLint glob patterns resolve relative to config file location

- Type: 🟤 decision
- Phase: Phase 4 Part 5c-1 (lint fix for Rule 13 server-side @yelli/db exemption)
- Files: .eslintrc.js (root), apps/web/.eslintrc.cjs
- Concepts: eslint, glob-resolution, monorepo, overrides, rule-13
- Narrative: Rule 13 forbids @yelli/db imports outside the server boundary (mobile apps
  must use @yelli/api-client). The Part 5a Sonnet had added an `eslint-disable-next-line
  no-restricted-syntax` comment for the single server-component import. With 5c-1 adding
  multiple tRPC routers under apps/web/src/server/trpc/ all importing @yelli/db, the
  inline disables would multiply. The clean fix is an `overrides` block. Initially placed
  only in apps/web/.eslintrc.cjs with pattern `apps/web/src/server/**` — failed because
  ESLint glob patterns in `overrides[].files` resolve RELATIVE to the config file's
  directory, not the project root. From apps/web/.eslintrc.cjs the pattern needed to be
  `src/server/**`. AND the root .eslintrc.js's no-restricted-syntax rule also fires when
  running lint from root, so the root config also needed an override with `apps/*/src/server/**`.
  Dual declaration required because each config evaluates patterns against its own dir.
  Rule: ESLint `overrides[].files` patterns are relative to the config file. For the same
  override to apply both when linting from a workspace package and from the root, declare
  it in BOTH configs with the appropriate relative pattern.

# ---

## 2026-05-13 — 🔴 Sonnet 30K budget can be silently exceeded by accumulated tool results across 6+ file ops

- Type: 🔴 gotcha
- Phase: Phase 4 Part 5d-1 (Sonnet dispatch via Agent tool)
- Files: apps/web/src/server/trpc/routers/meetings.ts, apps/web/src/app/app/meetings/**, apps/web/src/components/speed-dial/speed-dial-grid.tsx
- Concepts: subagent, thrashing, token-budget, architect-execute, decomposition
- Narrative: Dispatch prompt was carefully scoped to 6 files (4 new + 4 modified, no shadcn
  installs, no PRODUCT.md/lessons.md reads, integration facts pre-inlined). Estimated 30K-edge.
  Actual outcome: Sonnet thrashed at 25 tool calls / ~13 minutes — produced 4/6 files (with
  bugs: wrong Prisma relation names, `name` not `display_name`, bogus `server-only` import,
  wrong link path), skipped _meeting-form.tsx entirely, skipped speed-dial-grid wiring. The
  failure mode is NOT "task too complex" — it's accumulated tool-result context: each Read
  result, each Edit confirmation, each typecheck/lint output adds to context. 6 file ops with
  typecheck/lint runs and fix loops exceeded 30K in tool returns alone, regardless of how
  tight the prompt was. The 🟤 decision from Part 5c-2 (dispatch prompts MUST include explicit
  shell-command-level prohibitions) was followed perfectly here, and the thrash still happened
  because that decision addresses scope creep, not budget overflow.
  Rule: when dispatching Sonnet 4.6 for a multi-file scaffold task, plan as ≤4 file operations
  per dispatch — NOT 6+. For 7+ file scopes, prefer one of:
    (a) Split into 2 dispatches of ≤4 files each (research → execute, OR module-by-module)
    (b) Direct Opus implementation per memory-governance.md §1 Step 2.5b ("genuinely atomic
        + exceeds 30K + would require awkward splitting" — Opus 200K context comfortably handles)
    (c) Skip typecheck/lint inside the dispatch; have Opus run those after the dispatch
        returns and apply fixes itself
  The recovery cost here was ~30 minutes (relation-name fixes, two-stage TS type errors,
  missing _meeting-form, speed-dial wiring) — about as expensive as a Sonnet re-dispatch
  would have been, with the added benefit that the work is now verifiably correct.
  Cross-link: [[opus-step-2.5b-when-to-escalate]] (decision log entry to write next session
  if this pattern repeats).

# ---

## 2026-05-13 — 🟤 tRPC v11 standalone middleware loses ctx narrowing across chain steps

- Type: 🟤 decision
- Phase: Phase 4 Part 5d-1 (typecheck errors after ctx narrowing refactor)
- Files: apps/web/src/server/trpc/trpc.ts
- Concepts: trpc, middleware, type-narrowing, context, architecture
- Narrative: First attempt at refactoring authMiddleware to propagate narrowed `user` defined
  three standalone middleware identifiers (`authMiddleware`, `tenantMiddleware`,
  `apiRateLimitMiddleware`) each via `middleware(async ({ctx, next}) => ...)` and then
  chained them via `procedure.use(authMiddleware).use(tenantMiddleware).use(apiRateLimitMiddleware)`.
  Result: TypeScript errors `Property 'user' does not exist on type {session, req}` at the
  tenant + rate-limit middleware sites. Reason: standalone `middleware(fn)` declarations are
  typed against the base Context only — they do NOT see the narrowed output of an upstream
  middleware they're chained with at the call site. Type narrowing flows through .use(...)
  chain composition, but only when middlewares are inlined into the chain (or built up
  incrementally as `t.procedure.use(...)` returning a new procedure with augmented ctx, then
  layering further .use on that procedure).
  Rule: When propagating narrowed context through tRPC middleware steps, inline the chain:
    export const protectedProcedure = procedure
      .use(async ({ ctx, next }) => { /* guards + narrow */ return next({ctx: {...ctx, X}}); })
      .use(async ({ ctx, next }) => { /* sees ctx.X */ ... })
      .use(async ({ ctx, next }) => { /* sees ctx.X */ ... });
  Avoid `middleware(fn)` standalone definitions when downstream middlewares need to see the
  augmented ctx. They work fine for terminal-only middlewares (e.g. rate-limit that doesn't
  return augmented ctx to subsequent steps).
  Cross-link: [[trpc-v11-architecture]] (V31 stack baseline).

# ---

## 2026-05-13 — 🟤 Prisma strict create input + L6 $allOperations: cast pattern

- Type: 🟤 decision
- Phase: Phase 4 Part 5d-1 / 5d-2 (Meeting.create + CallLog.create typecheck failures)
- Files: apps/web/src/server/trpc/routers/meetings.ts, apps/web/src/server/lib/call-log.ts
- Concepts: prisma, l6-tenant-guard, strict-create-input, type-safety
- Narrative: The L6 tenant-guard extension uses Prisma `$allOperations` to inject
  organization_id into both `data` (for create/update) and `where` (for reads) at runtime.
  This is the framework's primary defense-in-depth mechanism (security.md L6). Problem:
  Prisma's compile-time `MeetingCreateInput`/`CallLogCreateInput` types still require
  organization_id because the schema declares the column as NOT NULL. Two options:
    A) Use the loose Prisma.MeetingUncheckedCreateInput type and pass organization_id
       explicitly from ctx.organizationId (which the protectedProcedure tenant middleware
       already extracted from session). L6 will then "inject" the same value at runtime —
       a redundant write but semantically identical, and TS is happy.
    B) Use the strict input + `as Prisma.MeetingCreateInput` cast omitting organization_id.
       L6 fills it at runtime, but TS sees the cast as a type-system bypass.
  Chose option A: typed data binding via `const data: Prisma.MeetingUncheckedCreateInput = {
    organization_id: ctx.organizationId, host_user_id: ctx.user.id, ... }`. Reasons:
    - The explicit field is documentation: future readers see the L6 contract at the call site.
    - Defense in depth: if L6 ever fails (extension removed, $allOperations name change in
      Prisma upgrade), the explicit field still scopes the write correctly.
    - Documents the dependency on ctx.organizationId (visible in code review).
  Inline comment at the call site explains the cast: "L6 tenant-guard injects organization_id
  at runtime — cast satisfies Prisma's strict create input type that demands organization_id
  at compile time."
  Rule: When writing through prisma.create with L6-scoped entities, declare `const data:
  Prisma.{Entity}UncheckedCreateInput = {organization_id: ctx.organizationId, ...}` rather
  than relying solely on L6 injection. Documents the security contract at the call site.

# ---

## 2026-05-14 — 🟤 writeAuditLog parameter widened from Prisma.TransactionClient → AuditLogWriter structural type

- Type: 🟤 decision
- Phase: Phase 4 Part 5e Bundle A (writeAuditLog usage in admin/billing/superadmin routers)
- Files: packages/db/src/audit.ts, apps/web/src/server/trpc/routers/{departments,admin,billing,superadmin}.ts
- Concepts: prisma-extensions, l6-tenant-guard, exactoptionalpropertytypes, structural-typing, type-compat
- Narrative: Part 5e was the first session to exercise `writeAuditLog` from the framework's
  audit.ts helper (Part 5d's CallLog persistence used a separate path). The existing signature
  required `tx: Prisma.TransactionClient` — the base unextended client's transaction type.
  Problem: our `prisma` export from `packages/db/src/client.ts` is the L6-extended
  `Prisma.defineExtension` $allOperations client, whose `$transaction` callback parameter is
  typed as `Omit<DynamicClientExtensionThis<...>, "$extends" | ... >` — structurally similar
  to but textually incompatible with `Prisma.TransactionClient` under
  `exactOptionalPropertyTypes: true`. TS error:
    "Type 'SelectSubset<T, SubscriptionFindUniqueArgs<DefaultArgs>>' is not assignable to type
     'Exact<T, SubscriptionFindUniqueArgs<InternalArgs & {result:{}; model:{}; query:{}; client:{};}>>'"
  Same issue affects `platformPrisma` (unguarded but still extended client).
  Decision: widen the parameter to a minimal structural type `AuditLogWriter` that only
  requires `auditLog.create(args)`. This accepts:
    - The base `Prisma.TransactionClient` (legacy callers)
    - The L6-extended client's `$transaction` callback param
    - The platformPrisma client's `$transaction` callback param
  Why this is safe: AuditLog itself is in the L6 exempt list (packages/db/src/client.ts) —
  the extension's $allOperations does nothing on AuditLog writes. So even though the type is
  structural, the runtime behavior is identical across all three clients. The JSDoc preserves
  the "always call inside $transaction" atomicity contract that callers must honor.
  Alternative considered + rejected: cast each call site to `Prisma.TransactionClient` with
  `as unknown as`. This is ugly, spreads through every router, and fails on Prisma version
  bumps that further specialize the type. The structural widening localises the workaround.
  Rule: Helpers that touch only L6-exempt tables (AuditLog, Organization, PlatformSettings)
  should use structural parameter types, not `Prisma.TransactionClient`. Helpers that touch
  L6-scoped tables must still use the strict tx type to inherit the extension's runtime
  scoping.

# ---

## 2026-05-14 — 🟤 superAdminProcedure deliberately skips runWithTenantContext

- Type: 🟤 decision
- Phase: Phase 4 Part 5e Bundle A (trpc.ts middleware design)
- Files: apps/web/src/server/trpc/trpc.ts, apps/web/src/server/trpc/routers/superadmin.ts
- Concepts: rbac, super-admin, l6-tenant-guard, platform-prisma, explicit-bypass
- Narrative: security.md §SUPERADMIN AND PLATFORM-LEVEL ROLES rule 1:
    "Superadmin queries that bypass tenant scoping MUST use a dedicated Prisma client instance
     WITHOUT the L6 tenant-guard extension — never an inline if/else in resolvers."
  Two ways to implement super-admin queries:
    A) protectedProcedure-based (runs inside runWithTenantContext, sets ALS tenant context,
       but use `platformPrisma` in the resolver to bypass L6) — implicit bypass.
    B) Separate procedure chain that NEVER calls runWithTenantContext + use platformPrisma —
       explicit bypass at the procedure level.
  Chose B. superAdminProcedure is `procedure.use(auth+gate).use(rateLimit)` with no tenant
  context middleware. Even if a future engineer accidentally imports `prisma` (L6-guarded)
  inside a superadmin resolver, the missing ALS tenant context means L6's `requireTenantContext`
  would throw at runtime ("super-admin bypass via ALS" only works when isSuperAdmin is set in
  the ALS context, which we never set here). This produces a loud failure instead of silent
  cross-tenant data exposure.
  Trade-off: superadmin routers cannot use `prisma` at all — they must use `platformPrisma`.
  This is the desired constraint per security.md; the procedure chain enforces it
  architecturally instead of via reviewer vigilance.
  Cross-link: [[trpc-middleware-architecture]] (protectedProcedure middleware chain — V31 stack baseline).

# ---

## 2026-05-14 — 🟤 Xendit 503 graceful degradation pattern in tRPC + client

- Type: 🟤 decision
- Phase: Phase 4 Part 5e Bundle A (billing.checkout.createSession) + Bundle C (/admin/billing UI)
- Files: apps/web/src/server/trpc/routers/billing.ts, apps/web/src/app/admin/billing/page.tsx
- Concepts: payment-gateway, graceful-degradation, env-driven-feature-flags, trpc-error-codes
- Narrative: STATE.md (post-5d) committed Part 5e to "Xendit checkout UI will be 503-graceful
  when XENDIT_SECRET_KEY env unset, parallel to the existing LiveKit pattern". This locks in a
  framework-wide pattern for env-driven third-party integrations.
  Server side: `billing.checkout.createSession` checks `env.XENDIT_SECRET_KEY` first. If unset:
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Billing is not configured ..." })
  The TRPCError code is the wire-format signal (httpStatus 503 + data.code "SERVICE_UNAVAILABLE").
  Client side: `/admin/billing/page.tsx` reads `checkout.error?.data?.code` after a failed
  mutation and conditionally renders an `Alert variant="warning"` with a "Billing is not
  configured" message instead of a destructive toast. The upgrade buttons remain enabled so
  the user can still trigger the check — and immediately see the explanatory Alert.
  Why this approach over hiding the buttons preemptively: the env state is server-side, not
  exposed in clientEnv. The client doesn't know about XENDIT_SECRET_KEY. Sending a probing
  mutation on page load would be wasteful; instead, the explanatory Alert appears on first
  attempted upgrade. This matches the LiveKit token-mint pattern from Part 5b which throws
  503 when LIVEKIT_API_KEY is unset and the call-initiation UI shows a graceful error.
  Rule: For any third-party integration with optional env-driven configuration:
    1. Server throws TRPCError code SERVICE_UNAVAILABLE when the env key is unset.
    2. Client checks `err.data.code === "SERVICE_UNAVAILABLE"` on mutation error.
    3. Render an explanatory Alert variant=warning, not a destructive toast.
    4. Never expose the env state via clientEnv — keep the failure surface server-side.

# ---

## 2026-05-14 — 🟤 Compose env_file path is 3 levels up from deploy/compose/<env>/

- Type:      🟤 decision
- Phase:     Phase 4 Part 7 (deploy/compose scaffold)
- Files:     deploy/compose/{dev,stage,prod}/docker-compose.*.yml
- Concepts:  docker-compose, env_file, path-resolution, monorepo
- Narrative: docker-compose's env_file path is resolved relative to the YAML file
  location, not the project root or the `docker compose -f` invocation directory.
  Yelli compose files live at deploy/compose/<env>/<file>.yml — to reach the root
  .env.<env> requires `../../../.env.<env>` (3 hops up), NOT `../../.env.<env>`
  as the V31 templates.md template suggests (that template assumed 2-level depth).
  Wrong path silently passes `docker compose config` but fails at runtime with
  obscure "variable is not set" warnings. Always use the 3-level path; verify
  with `docker compose --env-file .env.<env> -f <file> config` from project root.

# ---

## 2026-05-14 — 🟤 LiveKit dev mode vs stage/prod UDP exposure strategy

- Type:      🟤 decision
- Phase:     Phase 4 Part 7 (deploy/compose/{dev,stage,prod}/docker-compose.media.yml)
- Files:     deploy/compose/dev/docker-compose.media.yml, deploy/compose/stage/docker-compose.media.yml, deploy/compose/prod/docker-compose.media.yml
- Concepts:  livekit, webrtc, udp, port-range, --dev, rtc-port-range
- Narrative: LiveKit needs UDP exposure for media. Two distinct dev/prod strategies:
  DEV: use `--dev` flag (binds RTC to a single UDP port = 7882). Map host
       LIVEKIT_TURN_UDP_START (43537) → container 7882/udp. Single-machine WSL2
       dev has loopback NAT — single UDP port suffices for local clients.
  STAGE/PROD: drop --dev, use explicit `--rtc-port-range-start=7882
       --rtc-port-range-end=7892` (11-port UDP range). Map host 7882-7892 →
       container 7882-7892/udp. Real clients across NAT need port diversity;
       Traefik canNOT proxy UDP, so direct port mapping is the only option.
       LiveKit signaling WebSocket (7880 TCP) DOES go through Traefik for WSS
       termination at livekit-staging.powerbyte.app / livekit.yelli.powerbyte.app.
  Coturn UDP relay range 49160-49200 (40 ports) sized for max_participants_per_room=50
  with a small reserve. Hardcoded in compose files — not env vars — because changing
  these requires Coturn restart and matching firewall changes (not a per-deploy knob).

# ---

## 2026-05-14 — 🟤 check-env DEV_ONLY_KEYS allowlist for env-specific keys

- Type:      🟤 decision
- Phase:     Phase 4 Part 7 (tools/check-env.mjs)
- Files:     tools/check-env.mjs
- Concepts:  governance-tools, env-validation, dev-only-keys, allowlist
- Narrative: .env.example acts as the master key list (driven by dev needs).
  Some keys are legitimately dev-only:
    LIVEKIT_TURN_UDP_START — dev maps a single UDP port (43537), stage/prod
                              use a hardcoded 7882-7892 range in the compose
    COTURN_PORT             — dev maps Coturn (43542), stage/prod use 3478
    SMTP_UI_PORT            — MailHog web UI is dev-only (stage/prod use real SMTP)
  A strict "every .env.example key must exist in every env file" check is wrong —
  it would mask the real signal (empty CREDENTIALS.md placeholders that BLOCK Phase 5).
  Solution: DEV_ONLY_KEYS Set in check-env.mjs — a missing key in stage/prod yields
  an INFORMATIONAL warning if the key is in the allowlist; otherwise it's an error.
  Empty/placeholder values are ALWAYS errors regardless of env (this is the actual
  BLOCKERS signal that needs to fail Phase 5 pre-flight until CREDENTIALS.md is filled).

# ---

## 2026-05-14 — 🟤 check-product-sync normalize() strips connectors

- Type:      🟤 decision
- Phase:     Phase 4 Part 7 (tools/check-product-sync.mjs)
- Files:     tools/check-product-sync.mjs
- Concepts:  governance-tools, snake_case, title-case, normalization, substring-match
- Narrative: inputs.yml uses snake_case module/entity names (`reports_export`,
  `speed_dial_board`). PRODUCT.md uses Title Case section headings and prose
  ("Reports & Export", "Speed Dial Board"). Naive lowercase-substring fails
  because of connector chars: `reports_export` normalized → `reports export`
  but PRODUCT.md "Reports & Export" lowercased → `reports & export` — substring
  miss. Fix: normalize() strips `[_\-&/,()[].:]` AND collapses whitespace on
  BOTH sides before substring check. Trade-off accepted: false-negative risk
  rises slightly (e.g. an unrelated mention of "reports" + later "export" in
  the same sentence could match). For 13 modules × the rich PRODUCT.md text,
  the false-positive cost was massive (10 false sync violations) — false-negative
  cost is theoretical. Move on; tighten if it ever produces a real missed sync.

# ---

## 2026-05-14 — 🟤 hydration-lint excludes /src/server/ /src/lib/ /src/middleware. /src/env.

- Type:      🟤 decision
- Phase:     Phase 4 Part 7 (tools/hydration-lint.mjs)
- Files:     tools/hydration-lint.mjs
- Concepts:  ssr-hydration, lint-scope, false-positive-suppression, server-only
- Narrative: Hydration footguns matter ONLY for code that renders into HTML on
  the server AND re-renders on the client. tRPC routers (apps/web/src/server/
  trpc/routers/*.ts), auth callbacks, route handlers, server libraries, the
  middleware, and the env validator never render HTML. They run in handlers/
  callbacks where `new Date()` and `Date.now()` are correct and necessary.
  Initial scan flagged 8 footguns — ALL false positives in src/server/* or src/lib/*.
  Solution: SERVER_ONLY_PATH_SEGMENTS allowlist that skips files whose path
  contains `/src/server/`, `/src/lib/`, `/src/middleware.`, `/src/env.`. Result:
  66 files scanned, 0 findings. Genuine hydration footguns in src/app/* or
  src/components/* still get flagged. Add a directory to the allowlist if a
  new server-only convention emerges (e.g. /src/actions/ for server actions).

# ---

## 2026-05-14 — 🟤 Dockerfile multi-stage build for pnpm workspace monorepo

- Type:      🟤 decision
- Phase:     Phase 4 Part 7 (apps/web/Dockerfile)
- Files:     apps/web/Dockerfile, apps/web/.dockerignore
- Concepts:  dockerfile, multi-stage, pnpm, workspace, monorepo, turborepo, caching
- Narrative: Yelli's monorepo has apps/web depending on packages/{shared,api-client,
  db,jobs,storage,ui}. A naïve Dockerfile (`COPY . . && pnpm build`) means any
  source change invalidates the deps layer and triggers full `pnpm install` on
  every build. Solution: three stages.
    Stage 1 (deps): COPY pnpm-workspace.yaml + ALL package.json files first
      (one COPY per workspace package), THEN `pnpm install --frozen-lockfile`.
      This layer is cached as long as no manifest changes.
    Stage 2 (builder): bring deps + COPY . . + `pnpm --filter @yelli/db prisma generate`
      (must precede build — Prisma client is compiled into Next.js bundle) +
      `pnpm --filter @yelli/web... build` (the `...` syntax builds web AND all
      its transitive workspace deps via Turborepo).
    Stage 3 (runner): node:22-alpine minimal, COPY only .next/standalone +
      .next/static + public. Runs as nextjs:1001 non-root user. `output: standalone`
      in next.config.ts produces the apps/web/server.js entrypoint.
  Build context = monorepo ROOT (not apps/web) — required so the Dockerfile can
  COPY packages/* and pnpm-workspace.yaml. Build command:
    docker build -f apps/web/Dockerfile -t bonitobonita24/yelli:dev-latest .
  (the trailing `.` is monorepo root). Dev compose wires `context: ../../..` so
  the same Dockerfile is used by `docker-compose.app.yml` with `build: { context, dockerfile }`.

# ---


## 2026-05-15 — 🔴 packages/shared `.js` extension leftovers latent until first consumer
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 2 → surfaced in Phase 7 #1
- Files:     packages/shared/src/{index,schemas/index,types/index,schemas/subscription}.ts
- Concepts:  monorepo, barrel exports, webpack, .js extensions, latent bug
- Narrative: Phase 4 Part 2 generated `packages/shared` with `.js` extensions in all barrel re-exports. The package was structurally valid (tsc was happy because of TS module resolution) and went undetected through 7 subsequent Parts because nothing actually imported from `@yelli/shared/schemas` at runtime — types-only imports never traversed the barrel. Phase 7 #1 (auth.register) was the FIRST runtime consumer: the register page imports `registerInputSchema` for use with `zodResolver`. Webpack tried to resolve `./meeting.js` and failed. Same exact pattern as the storage scaffold-bug from the 2026-05-15 dev-bringup session. **Lesson for future Parts**: when a package barrel is generated, immediately add a smoke import from any apps/web route + run `pnpm build` to verify the package actually loads — don't trust that typecheck passing means the package works at runtime. Webpack module resolution is stricter than TS module resolution.

## 2026-05-15 — 🟤 Opus escalation per §2.5b: first real-world trigger
- Type:      🟤 decision
- Phase:     Phase 7 #1 (auth.register)
- Files:     n/a — process decision
- Concepts:  sonnet-thrashing, opus-escalation, memory-governance, §2.5b, dispatch-discipline
- Narrative: First Phase 7 Feature Update dispatched to Sonnet 4.6 thrashed at ~18 tool uses with the documented "autocompact thrashing" error. Brief was long (~3K) + Sonnet had to read existing register page (~150 lines), trpc.ts base (~140 lines), shared schemas index, login flow auth.ts — tool results accumulated past 30K. Per memory-governance §4 status handling, did NOT re-dispatch the same task. Per §2.5b, escalated to Opus 4.7 direct execution (last-resort path). Justification: each fix exposed the next (snake_case → email-uniqueness → createCallerFactory → .js extensions in barrels), and the cross-file context needed to be held in one head. Completed in one Opus session, ~55K context. **For future Phase 7 dispatches**: when the implementation requires understanding 4+ existing files to do correctly, the Opus brief approach (Opus reads, pre-digests into the Sonnet brief, Sonnet only writes new code) works better than a discovery-style brief. Tighten the read budget BEFORE dispatching, not after thrashing. Cost: this was the 1st of <20% Opus-exec allotment per §2.5b — track future escalations and reassess decomposition strategy if frequency rises.

## 2026-05-15 — 🟤 Rule 25 TDD ordering deferred — no test infra yet
- Type:      🟤 decision
- Phase:     Phase 7 #1 (auth.register)
- Files:     package.json (root), apps/web/package.json
- Concepts:  vitest, tdd, rule-25, phase-7, test-infrastructure, scaffold-gap
- Narrative: Phase 4 Part 8 generated a root `pnpm test` → `turbo run test` script but no package implements the `test` task — vitest is not installed anywhere in the repo. Rule 25 says "write failing test FIRST" but the test runner doesn't exist to run a test. Strict adherence to Rule 25 would have forced this Phase 7 ticket to install vitest as a prerequisite, ballooning scope from Tier 2 to Tier 3 (vitest deps + config + jsdom or happy-dom + turbo pipeline wiring + tsconfig pathing). With user approval, deferred tests for this commit and opened follow-up Phase 7 ticket: "Install vitest + write auth.register coverage". **For future Phase 7 tickets touching server code**: install vitest as PR #1, then resume strict TDD ordering for everything thereafter. Document deviations from Rule 25 in CHANGELOG_AI Phase 7 entry under "Tests: DEFERRED" — never silent.

# ---

## 2026-05-15 — 🟤 Vitest 4 supports tsconfig paths natively — drop vite-tsconfig-paths
- Type:      🟤 decision
- Phase:     Phase 7 #2 (vitest install)
- Files:     apps/web/vitest.config.ts
- Concepts:  vitest, vite, tsconfig-paths, monorepo, alias-resolution
- Narrative: Initial vitest.config.ts used `vite-tsconfig-paths` plugin (the historical default for resolving `@/` alias from tsconfig.json `paths`). On first `pnpm test` run, vitest 4.1.6 printed: "The plugin 'vite-tsconfig-paths' is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option." Verified — dropping the plugin and setting `resolve: { tsconfigPaths: true }` in vitest.config gives identical resolution behavior with one less dep. Tests still pass in ~600ms. **For all future packages adding vitest configs in this repo**: do NOT install vite-tsconfig-paths. Use `resolve.tsconfigPaths: true` directly in defineConfig. Saves a transitive dep + simplifies the config.

# ---

## 2026-05-15 — 🟤 tRPC router test pattern — mocks for @yelli/db + sibling libs, real Zod
- Type:      🟤 decision
- Phase:     Phase 7 #2 (auth.test.ts pattern establishment)
- Files:     apps/web/src/server/trpc/routers/auth.test.ts (reference implementation)
- Concepts:  vitest, vi.mock, trpc-testing, createCallerFactory, prisma-mocking, isolation
- Narrative: First tRPC router test in the repo. Pattern that worked cleanly:
  (1) Mock `@yelli/db` to provide a fake `platformPrisma` with `vi.fn()` for each `.model.method()` consumed — DO NOT mock the whole `prisma` ecosystem if you only use `platformPrisma`.
  (2) Mock sibling lib modules entirely with `vi.mock(path, factory)` — for auth.test that's `@/server/lib/turnstile` and `@/server/lib/rate-limit`. Factory mode prevents the real module from loading (so env.ts doesn't fire from inside turnstile).
  (3) Keep `@yelli/shared/schemas` real — Zod validation is part of what we're testing.
  (4) Use `createCallerFactory(specificRouter)` for unit-scoped tests, not the full `appRouter` — gives `caller.method(input)` not `caller.namespace.method(input)`. Faster, no unrelated middleware fires.
  (5) Mock `bcryptjs` with BOTH `default: { hash }` and named `hash` export — the seed.ts gotcha (named import on bcryptjs failing) showed both shapes matter depending on consumer.
  (6) Context: `{ session: null, req: new Request(...) }` — the router calls `ctx.req.headers.get(...)` so a real Request constructor works fine.
  (7) `beforeEach` resets all mocks AND installs default "sane" implementations so each test only overrides what it cares about (e.g. happy-path defaults: rate-limit allows, turnstile succeeds, slug is free, $transaction returns the tx callback's result).
  (8) For TypeScript-strict mocks of Prisma findUnique that return only a narrowed select: cast `mockResolvedValueOnce({ id } as never)` and add an inline comment explaining the runtime select narrows it. Cleaner than building the full ~10-field Organization shape.
  Test pattern reusable for all future tRPC router tests in this codebase. Cross-link: [[trpc-v11-architecture]].

# ---

## 2026-05-15 — 🟤 SKIP_ENV_VALIDATION=1 in vitest test.env unblocks env-importing routers
- Type:      🟤 decision
- Phase:     Phase 7 #2 (vitest config)
- Files:     apps/web/vitest.config.ts, apps/web/src/env.ts
- Concepts:  vitest, env-validation, server-only, zod-parse-on-import, test-config
- Narrative: apps/web/src/env.ts parses `process.env` against a Zod schema at module-load when `typeof window === "undefined"` AND `process.env.SKIP_ENV_VALIDATION !== "1"`. Any test that transitively imports the auth router (which imports the turnstile module which imports env) would trigger this parse with vitest's empty `process.env`, throwing on the first missing required field. Fix: set `test.env: { SKIP_ENV_VALIDATION: "1" }` in vitest.config.ts. vitest injects this into `process.env` BEFORE the test files are loaded — earlier than any vi.mock factory, earlier than any import. The mocked turnstile module never reads env at all (we mock the whole module), but the safety net is still needed for any future test that doesn't mock the full transitive chain. **Rule**: every vitest.config.ts in this monorepo must set `test.env.SKIP_ENV_VALIDATION=1` unless the test specifically wants to verify env validation behavior.

# ---

## 2026-05-15 — 🟤 Shared schema split — Client input vs entity-projection schemas
- Type:      🟤 decision
- Phase:     Phase 7 #3 (/app/meetings/new tests + RHF polish)
- Files:     packages/shared/src/schemas/meeting.ts
- Concepts:  zod, shared-schemas, client-server-boundary, prisma-input-types, security
- Narrative: packages/shared had `MeetingCreateInputSchema` derived from `MeetingSchema.omit(...).extend(...)` — it included server-stamped fields (`organization_id`, `host_user_id`, `meeting_link_token`, `livekit_room_name`, `status`). That shape is wrong for client form input — those fields MUST come from `ctx` or `crypto.randomUUID()` on the server, never the client. Hidden risk: a future developer wiring a form to `MeetingCreateInputSchema` would have given the client power to set `host_user_id` or `organization_id`, bypassing L1 tenant scoping. **Pattern (lock for all future entities)**: name client-facing schemas `<Entity>CreateClientInputSchema` (only fields the client legitimately provides) — distinct from `<Entity>CreateInputSchema` (entity projection for admin/internal contexts where server fields are visible too) and `<Entity>UpdateInputSchema` (partial). The two schemas can coexist in the same `meeting.ts` file — different consumers import the right one. Inline comment documents the boundary. Cross-link: [[trpc-v11-architecture]], [[security-md-route-handlers]].

# ---

## 2026-05-15 — 🔴 @typescript-eslint/consistent-type-imports + namespace imports
- Type:      🔴 gotcha
- Phase:     Phase 7 #3 (shadcn Form primitive)
- Files:     packages/ui/src/components/form.tsx
- Concepts:  eslint, type-imports, namespace-imports, react, label-primitive, lint-rule
- Narrative: `import * as React from "react"` is fine when you call React.forwardRef etc as JSX/values (label.tsx works). But in form.tsx I had `import * as LabelPrimitive from "@radix-ui/react-label"` and only used it in `typeof LabelPrimitive.Root` positions (no JSX render). Lint fail: "All imports in the declaration are only used as types. Use `import type`." Namespace imports cannot be `import type * as ...` so the fix is structural, not stylistic. **Two fixes that work together**:
  (1) Convert React namespace to named imports: `import { createContext, forwardRef, useContext, useId, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from "react"`. Now value imports (createContext etc.) and type imports are clearly delineated, and the lint rule passes.
  (2) Drop type-only namespace imports entirely. If `LabelPrimitive` was only used as `typeof LabelPrimitive.Root`, replace with `typeof Label` where `Label` is the local re-export (a forwardRef from `./label.tsx`). Same type information, no namespace import.
  **Rule for future UI primitives in @yelli/ui**: if you find yourself writing `typeof X.Y` for a Radix primitive that you don't render in JSX, you don't need the import — reference the local @yelli/ui re-export instead.

# ---

## 2026-05-15 — 🟡 vi.mocked Prisma create mock — `as never` on the function, not the return
- Type:      🟡 fix
- Phase:     Phase 7 #3 (meetings.test.ts)
- Files:     apps/web/src/server/trpc/routers/meetings.test.ts
- Concepts:  vitest, prisma, fluent-api, mock-implementation, type-narrowing, dynamic-extension
- Narrative: Phase 7 #2 lessons documented `mockResolvedValueOnce(payload as never)` for static returns (the findUnique single-field select case). Phase 7 #3 needed dynamic returns based on input shape, so I used `mockImplementation(async args => {...})`. Typecheck failed with "Argument of type '(args: unknown) => Promise<never>' is not assignable to parameter of type '...DynamicModelExtensionFluentApi & PrismaPromise<...>...'". Prisma's `create` (and similar) does NOT return `Promise<T>` — it returns `DynamicModelExtensionFluentApi<...> & PrismaPromise<...>` so you can chain `.then(...)` AND `.organization.findMany(...)` on it. The fluent thing is a Prisma-specific intersection. **Fix**: cast the WHOLE arrow function `as never`, not just the return value:
```
vi.mocked(prisma.meeting.create).mockImplementation((async (args: unknown) => {
  // ...build dynamic return from args.data
  return {...};  // plain object — TypeScript infers, no inner `as` needed
}) as never);
```
The outer `as never` satisfies the DynamicModelExtensionFluentApi parameter type. The function still returns a plain Promise — Vitest only ever calls it like a regular async function, so the fluent-api intersection is structurally irrelevant at runtime. **Extends [[trpc-test-pattern]] from Phase 7 #2**: use `mockResolvedValue(x as never)` for static returns, `mockImplementation((async (args) => {...}) as never)` for dynamic returns. Both bypass the Prisma fluent type.

# ---

## 2026-05-15 — 🟤 shadcn Form primitive scoped to @yelli/ui — UI Rule #4 closure
- Type:      🟤 decision
- Phase:     Phase 7 #3 (form refactor + UI primitive install)
- Files:     packages/ui/src/components/form.tsx, packages/ui/package.json, packages/ui/src/index.ts
- Concepts:  shadcn-ui, react-hook-form, form-primitive, monorepo-ui, peer-deps, ui-rule-4
- Narrative: UI Rule #4 mandates "use shadcn/ui Form component with React Hook Form + Zod validation" for all forms. Before #3, the only form in apps/web (`/app/meetings/new`) used a useState chain — direct violation. Resolution: install the canonical shadcn Form primitive in `packages/ui/src/components/form.tsx` so every future form can `import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@yelli/ui'`. Three setup steps for the monorepo:
  (1) `form.tsx` itself — canonical shadcn code, adapted for the lint rule (named React imports, `typeof Label` instead of `typeof LabelPrimitive.Root` — see the lint gotcha entry above).
  (2) `packages/ui/package.json`: add `"./form": "./src/components/form.tsx"` to exports + add `"react-hook-form": "^7.53.0"` to peerDependencies (apps must provide it — apps/web already had 7.53.2 as a direct dep).
  (3) `packages/ui/src/index.ts`: barrel re-export the 7 components + the `useFormField` hook.
  pnpm install wires the peer dep cleanly (3-line lockfile diff). **Pattern for all future forms in apps/web**: `useForm<FormShape>({ resolver: zodResolver(formSchema) })` + `<Form {...form}><FormField control={form.control} name="..." render={({ field }) => (<FormItem><FormLabel>...</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />`. See `_meeting-form.tsx` for the reference implementation. Forms that need datetime-local inputs: define a local `formSchema` with `scheduled_at: z.string()` (matching the input element's string value), then transform to `Date | null` in `onSubmit` before invoking the tRPC mutation — the wire schema (`MeetingCreateClientInputSchema`) still validates the transformed shape server-side. Cross-link: [[trpc-test-pattern]] for Zod consistency across client + server.

# ---

## 2026-05-17 — 🟤 nodemailer GHSA-rcmh-qjqh-p98v documented-acceptance mitigation `[[nodemailer-cve-mitigation]]`
- Type:      🟤 decision
- Phase:     Phase 7 #9 ticket (j)
- Files:     .npmrc (new), apps/web/src/server/lib/email.ts, .github/workflows/ci.yml
- Concepts:  cve, security, audit, nodemailer, auth-js, peer-deps, documented-mitigation, .npmrc, ci, audit-level
- Narrative: Phase 7 #5 surfaced HIGH advisory GHSA-rcmh-qjqh-p98v (nodemailer `addressparser` recursive-call DoS, affects <=7.0.10) on every `pnpm audit --audit-level=high` run. nodemailer is pinned to 6.9.16 by the Auth.js v5 peer range, so we cannot upgrade past 6.x without breaking @auth/core. Three resolution paths were enumerated in the Phase 7 #5 lessons entry: (a) wait for @auth to widen its nodemailer peer range to allow >=7.0.11, (b) replace nodemailer with a different transport library, (c) document mitigation and raise `.npmrc audit-level` per phases.md Phase 5 CVE decision tree Step 3. This ticket implements path (c) as a Tier 1 single-commit fix. **Decision tree for unfixed HIGH CVEs in transitively-pinned deps** (lock this as the framework default response):
  (1) Identify the call site(s) of the vulnerable function (here: `nodemailer.createTransport` → `sendMail` → addressparser on `to`/`from`/`cc` strings).
  (2) Trace whether user-controlled input can reach the vulnerable function. Here: `from` is `env.SMTP_FROM` (server constant); `to` is `User.email` (Zod-validated at registration, stored in DB, never reflected raw from request body); subject/body are constants composed from server-controlled values (`resetUrl = env.NEXT_PUBLIC_APP_URL + server-generated token`). No user-controlled string reaches the parser.
  (3) If exploit path is reachable → upgrade or replace the dep immediately. If unreachable → write a JSDoc header on the call site file documenting the risk model (so a future contributor who refactors the file sees the invariant before breaking it) + write a DECISIONS_LOG entry naming the CVE + locking the acceptance + listing revisit triggers.
  (4) Raise `.npmrc audit-level=critical` so the build stays clean. CRITICAL severity still blocks (preserves the audit gate's value for genuinely-exploitable CVEs).
  (5) Drop any hardcoded `--audit-level=high` flag from CI workflows so `.npmrc` is the single source of truth — change one file to revisit the policy.
  **Revisit triggers** (write them into the DECISIONS_LOG entry so they're not lost):
  (i) Upstream fix: when @auth/core widens its peer range, bump nodemailer in apps/web/package.json and drop `.npmrc audit-level` back to `high`.
  (ii) Codebase change: any PR that adds a new `nodemailer.sendMail` call site MUST re-evaluate whether the new site preserves the no-user-input invariant. The JSDoc on email.ts is the in-code reminder.
  (iii) New CVE in another dep where exploit path IS reachable → re-evaluate per the same decision tree; do NOT just raise `.npmrc audit-level` further (that hides real risk).
  **Why not path (b)** (replace nodemailer): touches email.ts + every call site + adds a new dep with its own audit surface. Net risk increase for marginal benefit when the exploit path is already unreachable. Defer until path (a) closes or until we need a feature nodemailer doesn't have.
  **Why not just leave `--audit-level=high` and live with the failing CI**: defeats the audit gate. Every future PR would carry a known-fail audit step; contributors would learn to ignore audit output; the gate's value collapses. Better to encode the acceptance explicitly so the gate continues to catch NEW HIGH advisories.
  Cross-link: [[nodemailer-pin-auth-js]] (Phase 7 #4 — why we're stuck on 6.x); the Phase 7 #5 lessons entry enumerating the three paths (line 100 above); DECISIONS_LOG.md "Unfixed CVE acceptance — nodemailer GHSA-rcmh-qjqh-p98v" entry locked 2026-05-17.

## 2026-05-19 — 🔴 LiveKit env var name renamed in code but never in env/compose files `[[livekit-env-name-mismatch]]`
- Type:      🔴 gotcha
- Phase:     Rule 16 cleanup smoke pass (Phase 7 follow-up; 2026-05-19)
- Files:     apps/web/src/env.ts, apps/web/src/lib/livekit/client.ts, .env.dev, .env.example, .env.staging, .env.prod, deploy/compose/{dev,stage,prod}/docker-compose.app.yml
- Concepts:  env-var, livekit, rename, naming-mismatch, audit-gap, latent-bug, smoke-test-detection
- Narrative: meetings.getJoinToken returned HTTP 503 "Video service is temporarily unavailable" on EVERY meeting creation attempt — discovered only via end-to-end browser smoke during Rule 16 cleanup pass. Root cause: apps/web/src/env.ts schema declared `LIVEKIT_WS_URL` but ALL env files (.env.dev/.env.example/.env.staging/.env.prod) AND all compose files (deploy/compose/{dev,stage,prod}/docker-compose.app.yml) use `LIVEKIT_URL`. mintLiveKitToken in lib/livekit/client.ts read `env.LIVEKIT_WS_URL` which was always undefined → threw "LiveKit not configured" → tRPC catch returned 503. The unit tests passed because they mock mintLiveKitToken at the import boundary (vi.mock at the top of meetings.test.ts + calls.test.ts). The Edge bundle build passed because env validation is optional (`SKIP_ENV_VALIDATION=1` during build per [[instrumentation-edge-stub-required]]) — Zod's `.optional()` on the URL field meant undefined was accepted silently. **The latent bug had been there since the partial rename was applied — typecheck + lint + test + build all passed.** Only an end-to-end browser smoke catches this class of "config name drift across source-of-truth files."
  **Lesson**: any cross-file identifier rename (env var, config key, magic string) MUST be applied to ALL source-of-truth files in one PR. The framework's source-of-truth files for env vars are: (a) apps/web/src/env.ts schema, (b) apps/web/src/env.ts getServerEnv + getClientEnv, (c) every .env.* file, (d) every deploy/compose/*/docker-compose.*.yml file. ALL must use the same identifier; renaming one without the others causes silent failures gated by Zod `.optional()` clauses.
  **Add to Rule 16 follow-up checklist** (encode the smoke discipline so this doesn't recur): "Run pnpm dev + curl all critical tRPC endpoints with auth cookies (/api/trpc/meetings.getJoinToken, /api/trpc/calls.initiate, /api/trpc/auth.signOut, etc.). Any 503 with a try/catch generic message ('Service unavailable', 'Failed to ...') hides a config bug like this. Match each 503 to the underlying server error in dev.log to confirm it's a real I/O failure vs a silent config mismatch."
  Fixed via 5-line code-side rename (LIVEKIT_WS_URL → LIVEKIT_URL in env.ts + NEXT_PUBLIC_LIVEKIT_WS_URL → NEXT_PUBLIC_LIVEKIT_URL in env.ts client section + env.LIVEKIT_WS_URL → env.LIVEKIT_URL in client.ts) on branch `fix/livekit-url-env-rename` (commit `417ed97`); squash-merged to main as `f9f88bf` on 2026-05-19. No env/compose file changes required since they already used the correct name. Code-side rename was the minimal change.
  Cross-link: [[proxy-ts-false-positive]] (vercel-plugin suggested next-forge skill on this file — ignored per Yelli's bespoke env.ts); the Rule 16 cleanup CHANGELOG_AI entry locked 2026-05-19.

## 2026-05-19 — 🔴 /t/{slug}/* dev URL pattern has no route handlers — always 404s `[[t-slug-dev-routes-broken]]`
- Type:      🔴 gotcha
- Phase:     Rule 16 cleanup smoke pass (Phase 7 follow-up; 2026-05-19); Phase 7 #7c original implementation gap
- Files:     apps/web/src/middleware.ts, apps/web/src/server/tenant-redirect.ts, apps/web/src/server/tenant-redirect.test.ts, apps/web/src/app/t/  (does not exist)
- Concepts:  middleware, tenant, subdomain, dev-routing, 404, unit-test-gap, integration-gap
- Narrative: Phase 7 #7c shipped middleware that handles BOTH subdomain pattern (acme.yelli.powerbyte.app) AND /t/{slug}/* dev convenience pattern. The middleware logic is correct: extractTenantSlug correctly parses "evil"/"system" from /t/evil/app or /t/system/app paths; resolveTenantRedirect makes the correct decision (redirect for non-super-admin mismatch, allow for super-admin); buildTenantRedirectUrl swaps the slug in /t/{slug}/* via regex preserving the suffix. BUT: there is no apps/web/src/app/t/ directory at all. So /t/system/app, /t/evil/app, /t/anything/anything all return Next.js 404 regardless of session/auth state. The tenant-redirect unit tests (server/tenant-redirect.test.ts) pass because they ONLY verify buildTenantRedirectUrl returns the correct URL string — they never check whether the URL actually serves a page. The subdomain pattern (acme.yelli.powerbyte.app) probably works in production because the prod app is bound to *.yelli.powerbyte.app — Next.js serves the root path of any matching subdomain via the same route tree. The /t/{slug} pattern was meant as a dev convenience but no one wired it to Next.js routing.
  **Two possible fixes**:
  (a) Add minimal [slug]/page.tsx route handlers under apps/web/src/app/t/[slug]/(app|admin|superadmin)/ that re-render the parent equivalents (mirrors the actual route tree under apps/web/src/app/). Pro: explicit + discoverable. Con: doubles every protected route's footprint; new routes must be added to /t mirror; easy to miss new routes.
  (b) [PREFERRED] Rewrite /t/{slug}/* to /* in middleware after extracting the slug to x-tenant-slug header. Pro: single source of truth; new /app routes work automatically under /t/{slug}/app; same x-tenant-slug downstream resolution. Con: rewrite is invisible in the URL bar but the existing redirect path already uses /t prefix → may need cosmetic-only redirect to mirror prefix.
  **Why this gap existed**: integration tests for middleware would have caught it (request /t/evil/app + assert HTTP 200 with correct page content). Unit tests at the helper level (buildTenantRedirectUrl returns correct string) are not sufficient — they prove the URL is constructed correctly but not that the constructed URL is servable. Adding a fastify-style integration test that boots the Next.js dev server + curls /t/system/app + checks status would catch this immediately.
  **Add to Rule 16 follow-up checklist**: for any new middleware-based routing pattern, include a smoke test that curls the constructed URL + checks status != 404. Cross-link: queued ticket (t-slug-dev-routes-broken) for the fix.

## 2026-05-19 — 🟤 Rule 16 cleanup smoke pass findings + multi-user testing limitation locked as framework decision `[[rule-16-cleanup-2026-05-19]]`
- Type:      🟤 decision
- Phase:     Rule 16 cleanup smoke pass (Phase 7 follow-up; 2026-05-19)
- Files:     (multiple — see individual findings below)
- Concepts:  rule-16, smoke-test, visual-qa, multi-user, livekit, coturn, playwright, test-rig, decision-lock
- Narrative: First full Rule 16 cleanup smoke pass since 10 smoke items had accumulated across Phase 7 (#3, #4, #7c, #8e, #10, #11, #12, #13, #14, #15, #16). Played all 12 smoke tasks via Playwright MCP with system Chrome. Required preflight: user installed google-chrome-stable via Google's apt repo (the Playwright MCP server defaults to /opt/google/chrome/chrome, not the Playwright-bundled chromium at /home/me/.cache/ms-playwright/chromium-1224/...).
  **SUMMARY OF RESULTS**:
  - **PASSED (6)**: #8e Socket.IO handshake (curl + browser socket id verified via React fiber introspection: connected=true, id allocated, listeners attached), #10 session:invalidated (security_version bump → redirect to /login in ~120s = 2× the 60s revalidation loop interval — corrects the smoke spec's ≤60s claim; plain sign-out alone does NOT trigger session:invalidated, only role/status/security_version changes do), #4 forgot-password full flow (non-enumerating message → MailHog email → reset link → new password → login), #11 presence multi-tab (snapshot caught with carol's id appearing once despite 2 sockets — multi-tab coalescing verified; closing tab B did not break tab A — isLast=false path works), #12 Speed Dial green-dot (alice signs in → Reception bound to alice goes online + clickable; bound users not signed in stay offline + disabled), #13 admin-binding-ui (sidebar + table + dropdowns render; non-admin alice → redirected from /admin to /app).
  - **PARTIAL (1)**: #3 /app/meetings/new (form + creation + LiveKit token mint OK after env rename fix; WebRTC peer connection fails on coturn restarting 255 — STATE.md previously claimed "dev video calls work without it on localhost" is WRONG, queued as (coturn-config-fix)).
  - **BLOCKED (5)**: #14 in-call yellow-dot + #15 incoming-call dialog + #16 dept-filter routing — all need (a) 2+ distinct user sessions concurrently AND (b) working WebRTC; #7c subdomain redirect — /t/{slug}/* always 404 (see [[t-slug-dev-routes-broken]]).
  **REAL BUGS FOUND**: (1) [[livekit-env-name-mismatch]] — fixed inline via `f9f88bf`; (2) [[t-slug-dev-routes-broken]] — queued separately; (3) cross-org users (Mallory in evil org) visible in admin.users.list user picker dropdown when current user is_super_admin=true — may be intentional super-admin visibility OR a leak per security.md §SUPERADMIN ("never inline if (isSuperadmin) skip tenant filter"); needs verification with a plain tenant_admin (queued as (admin-users-list-tenant-scope)).
  **OBSERVATIONS WORTH NOTING** but not blocking: (a) login form silently fails when workspace field is required and missing (no error toast — UX 🟡 polish ticket); (b) SocketProvider initial-mount race may lose first presence:snapshot but state catches up via subsequent broadcasts (not consistently reproducible — worth a follow-up if real complaints surface).
  **LOCKED FRAMEWORK DECISION**: Playwright MCP single-context shares cookies across all tabs in the same browser session. This means a single Playwright MCP session CANNOT simulate multi-user concurrent scenarios (caller + recipient + observer). Tickets touching multi-user realtime flows MUST therefore have unit-test coverage at the handler level (selectIncomingCall, attachIncomingCallHandler, etc.) + queue manual e2e smoke as a Rule 16 follow-up when a multi-browser rig is available. Possible future test-rig improvements: (a) two real browsers on different machines, (b) extend Playwright MCP to multi-context isolation, (c) ship a /superadmin/impersonate route to switch sessions without sign-out/in flow (would benefit other smoke flows too).
  **Queued follow-up tickets**: (rule-16-followup-multi-user) for #14/#15/#16 e2e once rig + coturn are ready; (t-slug-dev-routes-broken); (admin-users-list-tenant-scope); (coturn-config-fix).
  Cross-link: STATE.md PHASE block 2026-05-19; CHANGELOG_AI.md "Rule 16 cleanup smoke pass" entry; .whatsnext promoted the 4 new tickets to the Phase 7 #17 backlog.
