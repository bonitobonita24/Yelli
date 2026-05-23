# Decisions Log — Spec-Driven Platform V31

# Locked architectural decisions. Never re-ask anything listed here.

# Format:

# ## [Decision Title]

# Decision: [what was decided]

# Rationale: [why]

# Locked: yes — [date]

# ---

## Dev Environment Mode

Decision: MODE A — WSL2 native (the only supported mode as of V25)
Rationale: Devcontainer adds 4 virtualisation layers on WSL2 + Docker Desktop causing
permission errors, shell server crashes, and socket failures. WSL2 native eliminates all of this.
Docker Desktop provides the Docker socket to WSL2 natively. No DinD needed.
Locked: yes — 2026-05-11. Do not re-ask or scaffold devcontainer files.

## Git Branching Strategy (Rule 23)

Decision: feat/{slug} for features, scaffold/part-{N} for Phase 4 Parts, fix/{slug} for bugs.
Squash-merge to main. Delete feature branches after merge. Conventional commit format.
Rationale: Keeps main linear and clean. Each Phase 4 Part isolated on its own branch
prevents partial scaffolds from corrupting the next Part.
Locked: yes — 2026-05-11.

## Model Routing (Rule 24)

Decision: Planning = Claude Code (Opus 4.6 — Architect). Execution = Sonnet 4.6 (Executor).
Governance writes = Gemini 2.5 Flash-Lite (cheapest, non-critical writes).
Rationale: Architect-Execute Model eliminates context thrashing on mature projects.
Opus plans + decomposes; Sonnet executes scoped tasks ≤30K tokens each.
Locked: yes — 2026-05-11. See memory-governance.md §4 for full protocol.

## Framework Version

Decision: Spec-Driven Platform V31.
Rationale: Latest stable framework version. Includes Phase 2.8 clickable mockup review,
Architect-Execute Model, compact CLAUDE.md architecture, contextual rule loading.
Locked: yes — 2026-05-11.

## App Identity

Decision: Name = "Yelli", slug = "yelli".
Rationale: Per docs/PRODUCT.md — instant video intercom SaaS for offices, hospitals, government departments.
Locked: yes — 2026-05-11.

## Tenancy Mode (Rule 7)

Decision: Multi-tenant for SaaS deployment; single-tenant for self-hosted.
Isolation: shared_schema_with_tenant_id (column = organization_id).
URL routing: subdomain ([org-slug].yelli.powerbyte.app).
DB isolation exception: none — all tenants share database.
Security layers always active: L3 (RBAC) + L5 (AuditLog) + L6 (Prisma guardrails via $allOperations).
Layers dormant in single-tenant self-hosted: L1 (tRPC tenantId scoping), L2 (Postgres RLS), L4 (PgBouncer pool limits).
Activation path: change tenancy.mode → no migration needed (L1+L2+L4 scaffolded but inactive).
Rationale: Same codebase serves SaaS and self-hosted. Per PRODUCT.md Tenancy Model + Security Requirements.
Locked: yes — 2026-05-11.

## Tech Stack (Rule 14 — OSS-first)

Frontend: Next.js 15 (App Router) + TypeScript strict
API: tRPC v11 + Zod (Rule 12)
ORM: Prisma (PostgreSQL 16-alpine + PgBouncer)
Auth: Auth.js v5 (email/password + social + magic link, PostgreSQL sessions)
Cache + Jobs: Valkey 7-alpine + BullMQ (MIT — replaces Redis)
Storage: MinIO (dev/self-hosted) → S3/R2 (SaaS prod)
UI: shadcn/ui + Tailwind + Recharts (via shadcn Chart) + Kibo UI (file dropzone)
Icons: lucide-react (locked — no other libraries per Rule 26)
Media: LiveKit self-hosted (Apache 2.0) + LiveKit Egress (recording)
TURN: Coturn self-hosted (NAT traversal)
Signaling: Socket.IO (presence, in-call chat, ringing, notifications)
Payment: Xendit (PHP — card, GCash, Maya, GrabPay, bank transfer)
Bot protection: Cloudflare Turnstile (managed widget, prod-only real keys)
Mobile: None native — web-only Mobile First responsive (Rule 13 N/A)
Locked: yes — 2026-05-11.

## Docker Image Publishing (V15)

Decision: docker.publish = true.
Registry: docker.io (Docker Hub)
Repository: bonitobonita24/yelli
Image name: yelli
Tags pushed by CI: :latest (main branch), :staging-latest (Komodo auto-update), :sha-{short} (every push)
Platforms: linux/amd64, linux/arm64
Trigger: push to main only (Rule 23 squash-merge guarantees clean main)
GitHub Secrets required: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN
Locked: yes — 2026-05-11.

## Deployment Manager (V27)

Decision: Komodo with V27 model — auto_update: true for staging, manual deploy for production.
Reverse proxy: Traefik on `proxy` external network. App service uses Traefik labels for HTTPS
routing — no host port exposure in staging/prod. Dev keeps direct port mapping.
TRAEFIK_NETWORK = proxy (locked).
Docker Hub is the handoff point between CI and deployment. No webhook required.
Locked: yes — 2026-05-11.

## Payment Gateway (V27 — framework default for SEA)

Decision: Xendit. Currency PHP. Methods: card, GCash, Maya, GrabPay, bank transfer.
Recurring: enabled (via Xendit Plans API).
Refunds: full + partial supported.
Multi-currency: no — single PHP currency for v1.
Webhook security: x-callback-token verification (constant-time compare), idempotent processing.
Locked: yes — 2026-05-11.

## Bot Protection (V27 — framework default)

Decision: Cloudflare Turnstile. Widget mode: managed.
Protected pages: login, register, forgot password, guest meeting join (/join/:token).
Hostname strategy: only prod domain registered on real widget (dev + staging use test keys → saves
hostname budget — 1 of 10 slots used per app).
Locked: yes — 2026-05-11.

## Spec Stress-Test (Phase 2.7)

Decision: vibe_test.enabled = true. Phase 2.7 runs automatically before Phase 3.
Stress-test PASSED on 2026-05-11 with 0 gaps found.
Locked: yes — 2026-05-11.

## Accessibility (V23)

Decision: accessibility.level = wcag_aa.
Rationale: Required for government and hospital deployments per PRODUCT.md Non-functional Requirements.
Enforcement: Phase 4 Part 5 generates WCAG AA checklist for every UI component.
Dedicated a11y-skill SKIPPED — see 2026-05-12 decision below.
Locked: yes — 2026-05-11.

## a11y-skill Installation Skipped

Decision: Do NOT install a dedicated a11y-skill. WCAG AA enforcement is covered by overlapping active skills.
Rationale: airowe/claude-a11y-skill has no valid SKILL.md (npx skills add fails). /plugin install a11y-skill
not in any marketplace. Coverage already redundant via: (1) design-auditor — 17 professional rules
including WCAG/contrast/typography, scores /100; (2) frontend-design — Anthropic quality bar with focus
rings, ARIA, keyboard nav; (3) ui-ux-pro-max — 99 UX guidelines; (4) oiloil-ui-ux-guide — HCI laws;
(5) Phase 2.6 design-system/MASTER.md will auto-embed WCAG 2.1 AA enforcement block (contrast 4.5:1
normal / 3:1 large, focus rings, alt text, ARIA labels, keyboard nav, form labels, error announcement)
because inputs.yml accessibility.level = wcag_aa; (6) Vercel Web Interface Guidelines embedded in MASTER.md.
Five-layer redundancy is stronger than one external skill of uncertain quality.
Locked: yes — 2026-05-12.

## Dev Port Assignment (Rule 22)

Decision: dev port base = 43502 (random pick from 40000-49999 range during Phase 3).
All dev services use base + fixed offsets — see inputs.yml ports.dev for full table.
COMPOSE_PROJECT_NAME = yelli_dev / yelli_staging / yelli_prod (Rule 22 container isolation).
Locked: yes — 2026-05-11.

## Video Infrastructure (Yelli-specific)

SFU: LiveKit self-hosted in Docker Compose (separate container with UDP port exposure).
TURN: Coturn self-hosted in Docker Compose for NAT traversal.
Egress: LiveKit Egress service writes recordings to MinIO bucket in dev/self-hosted; S3/R2 in SaaS prod.
Max participants per room: 50 (hardware-dependent — enforced by LiveKit token TTL + room config).
Free tier: 8 participants. Pro: 25. Enterprise: 50.
Call setup target: <150ms ring-to-connect.
Rationale: Per PRODUCT.md Tech Stack Preferences + Infrastructure Notes. Self-hosted retains
OSS-first posture (Rule 14) and avoids per-minute provider fees (LiveKit Cloud is paid).
Locked: yes — 2026-05-11.

## Realtime Signaling

Decision: Socket.IO. Used for presence engine (WebSocket-based online/offline/in-call), in-call
chat delivery, call ringing notifications, and general realtime notifications.
Security: heartbeat every 30s, session re-validation every 60s (security.md Realtime Connection Safety).
Channel naming: ${tenantId}:${eventType} — never broadcast globally.
Locked: yes — 2026-05-11.

## Realtime Hosting Topology (Phase 7 #8e)

Decision: Option B — Next.js 15 `instrumentation.ts` hook bootstraps a separate Socket.IO HTTP
server on its own port (`SOCKET_PORT` env var, dev port 43515 = base+13). The Next.js HTTP
server on `APP_PORT` and the Socket.IO server on `SOCKET_PORT` are siblings, not coupled. The
browser connects to `NEXT_PUBLIC_SOCKET_URL` (CORS-allowed with `credentials: true` so the
Auth.js session cookie flows cross-origin).
Rationale: Considered three options on 2026-05-16. (A) Custom Next.js `server.ts` wrapping
`next()` + Socket.IO on the same port — rejected because it breaks `next start` and
`output: 'standalone'` Docker builds, requiring a custom Dockerfile. (B) instrumentation hook
+ separate port — chosen for minimum-change-to-deployment-pipeline. (C) Separate Node service
in `apps/socket/` — deferred as a scale-out option when load warrants; current pattern can be
extracted to (C) by moving `createSocketServer` + `startSessionRevalidationLoop` + their tests
to a new package with zero changes to the auth logic.
Cookie naming: `authjs.session-token` (dev/HTTP) or `__Secure-authjs.session-token` (prod/HTTPS)
per Auth.js v5 convention. The cookie name IS the JWE salt (Auth.js derives the AEAD key from
`secret + cookie-name`); passing the wrong salt makes `decode` return null even with the right
secret. The Socket auth middleware reads the cookie name based on `env.NODE_ENV === "production"`.
Channel ownership: each org subscribes to `${organizationId}:${eventType}` rooms. The
`joinOrgChannel(socket, eventType)` helper takes NO `organizationId` parameter — it always
reads from `socket.data.session.organizationId`, so a malicious client cannot coerce
subscription to another org's room through the API surface. Super-admin cross-tenant events
use a parallel `platform:${eventType}` channel reachable only via `joinPlatformChannel`
which checks `session.isSuperAdmin === true`.
Super-admin tenant URL policy (analog of Phase 7 #7c option C): super-admins on `/superadmin/*`
paths bypass org-slug enforcement but still cannot cross-subscribe to other tenants' Socket.IO
channels — they must use `platform:*` channels for cross-tenant administrative events.
Locked: yes — 2026-05-16.

## Unfixed CVE acceptance — nodemailer GHSA-rcmh-qjqh-p98v (Phase 7 #9) — SUPERSEDED 2026-05-23

> **SUPERSEDED 2026-05-23 (Phase 8 Batch 1 Item 1):** This unfixed-CVE acceptance is no longer
> needed. nodemailer was patched in-tree via `pnpm.overrides` (`"nodemailer@<=7.0.10": ">=7.0.11"`
> at root `package.json`) after empirical verification that next-auth 5.0.0-beta.25 + @auth/core
> 0.41.2 + @auth/prisma-adapter 2.11.2 all accept nodemailer 7.x at runtime (peer warnings only,
> not load failures — `pnpm install` succeeds, `pnpm typecheck` clean, 32 test files / 299 tests
> pass). The HIGH advisory no longer appears in `pnpm audit --audit-level=high` output.
> `.npmrc audit-level=critical` and the JSDoc mitigation banner on `apps/web/src/server/lib/email.ts`
> are retained as defense-in-depth — if a future Auth.js / @auth/core bump unwinds the override,
> the mitigation reasoning is preserved. The original acceptance rationale below is kept for
> historical context.

Decision: Accept the unfixed HIGH advisory GHSA-rcmh-qjqh-p98v (nodemailer `addressparser`
recursive-call DoS, affects <=7.0.10) by raising `.npmrc audit-level` from the previous CI-hardcoded
`high` to `critical`. Risk accepted because the exploit path is unreachable in this codebase:
`apps/web/src/server/lib/email.ts` is the only `nodemailer.createTransport` call site, and it feeds
the address parser only server-stamped values — `from` from `env.SMTP_FROM`, `to` from the
Zod-validated User.email column, subject/body composed from server-controlled constants (`resetUrl`
built from `env.NEXT_PUBLIC_APP_URL` plus a server-generated token). No user-controlled string
reaches the vulnerable parser.
Rationale: nodemailer is pinned to 6.9.16 by the Auth.js v5 peer range. Three resolution paths were
documented in `.cline/memory/lessons.md` after Phase 7 #5: (a) wait for @auth/core to widen its peer
range — unbounded wait; (b) replace nodemailer with a different transport library — touches
email.ts + every callsite + adds a new dep with its own audit surface; (c) document mitigation and
lift `.npmrc audit-level` per `.claude/rules/phases.md` Phase 5 CVE decision tree Step 3. Path (c)
is the realistic short-term option and is single-commit reversible. The in-code mitigation is
documented as a JSDoc header on `email.ts` so any future contributor sees the risk model before
modifying the file.
Implementation: NEW `.npmrc` at project root with `audit-level=critical` (was implicit pnpm default).
CI's `pnpm audit` call in `.github/workflows/ci.yml` dropped its hardcoded `--audit-level=high` flag
so `.npmrc` becomes the single source of truth for the audit threshold — change one file to revisit
the policy. CRITICAL severity still blocks both local + CI.
Revisit triggers: (1) `@auth/core` widens its nodemailer peer range to allow >=7.0.11 — at that
point bump nodemailer in `apps/web/package.json` and drop `.npmrc audit-level` back to `high`;
(2) a new HIGH CVE appears in any other dependency where the exploit path IS reachable —
re-evaluate per the phases.md decision tree; (3) Auth.js v5 itself replaces its nodemailer
dependency with a different mail transport — same as (1).
Locked: yes — 2026-05-17.

## Phase 7 — fresh-client-presence-snapshot-race fix approach

Decision: Use the **client-emitted `presence:ready` handshake** to gate
`presence:snapshot` emission (option a from the AskUserQuestion lock on 2026-05-22).
Server `attachPresenceHandlers` registers a `presence:ready` listener and defers the
socket-direct snapshot emit until that event fires. Client `attachUserPresenceHandlers`
emits `presence:ready` AFTER both `presence:snapshot` and `presence:user` listeners are
registered. Idempotent on the server via `snapshotEmitted` flag (defends against React
StrictMode double-fire or reconnect-resume edge cases).

Rationale: Three candidates were evaluated for the race where fresh clients (first page
load) dropped the synchronously-emitted `presence:snapshot` because the React `useEffect`
listener attach landed AFTER `socket.connected`. (a) `presence:ready` handshake —
deterministic, protocol-level, minimal LOC, both sides explicit about handshake
completion; the only protocol change is one new ClientToServerEvents entry. (b) Server
timeout-and-retry (`setTimeout` 0/100/500ms) — fragile under load, wastes bandwidth on
every connect, does not actually eliminate the race; rejected. (c) tRPC-bootstrapped
snapshot via `presence.snapshot.useQuery()` — creates two sources of truth (REST snapshot
+ socket deltas) requiring dedup/last-write-wins logic, adds a round-trip per consumer
mount, and shifts the race to "tRPC bootstrap vs first socket delta"; rejected as larger
blast radius than option (a) for no determinism gain.

Implementation locked: option (a). Five files / +185 / -22 / 1 module:
- `apps/web/src/server/socket/presence.ts` — gate snapshot emit on `PRESENCE_READY_EVENT`
- `apps/web/src/server/socket/presence.test.ts` — 3 new race tests; 2 updated
- `apps/web/src/lib/presence/user-presence-handler.ts` — emit `presence:ready` after listener attach
- `apps/web/src/lib/presence/user-presence-handler.test.ts` — 3 new handshake tests
- `apps/web/src/lib/socket/types.ts` — add `presence:ready` to `ClientToServerEvents`

Wider rule: any future server→client bootstrap delivered via socket (initial roster,
snapshot, state) MUST be gated on a client→server `ready` event. Listener attach happens
in the consumer's React useEffect, which is post-commit and may post-date
`socket.connected`. The handler architecture pattern is documented in
[[pure-helper-extraction-pattern]] in `.cline/memory/lessons.md`. Sibling engines using
the same pattern (e.g. `call:active-snapshot` in `in-call.ts`) should be audited for the
same race in a follow-up ticket if multi-user smoke shows the symptom.

Revisit triggers: (1) Socket.IO ships a built-in handshake-complete event that obviates
the application-layer handshake — switch to it and drop the `presence:ready` event from
ClientToServerEvents; (2) move to a different transport (WebTransport / SSE) where
listener-attach-then-bootstrap is the native primitive — drop the handshake; (3) discover
that `call:active-snapshot` has the same race — apply the same pattern there for
consistency rather than inventing a second.
Locked: yes — 2026-05-22.

## Phase 7 Hardening Notes — 9 Guardrails From Realtime-Engine Build (Phase 8 Batch 1 Item 1)

Decision: Codify nine recurring failure-mode guardrails surfaced across 30 🔴 gotcha entries
in `.cline/memory/lessons.md` between 2026-05-13 → 2026-05-23 (Phase 7 #1 → SLOT 2 close-out).
These are not new rules — they are domain-specific applications of existing CLAUDE.md rules
that recurred frequently enough that future Phase 8 work must default to the hardened pattern,
not re-discover it. Each guardrail is a single-sentence default-pattern with a one-line
"if you violate this you will see" symptom anchor and the canonical lesson it traces to.

#### G1 — Webpack runtime singletons MUST live on `globalThis[Symbol.for(...)]`
Pattern: any module-local `let instance` accessed via cross-chunk static `import` paths will
silently bifurcate into per-chunk copies under Next.js + webpack code-splitting (no warning,
no error — emits dead-code silently). Always store the singleton at
`globalThis[Symbol.for("yelli.<scope>.<name>")]`. Symptom anchor: "the emit ran but the receiver
never got it." Lesson: [[webpack-module-duplication-singleton-trap]] (2026-05-23). Applies to:
Socket.IO `io` instance, presence/in-call rosters, any future Redis/queue client used from
both an `instrumentation.ts` entry and a tRPC route.

#### G2 — Runtime environment gates MUST use APP_ENV, never `process.env.NODE_ENV`
Pattern: Webpack's DefinePlugin inlines `process.env.NODE_ENV` as a compile-time constant
during `next build` (production bundle gets `"production"` literally substituted). Any runtime
branch like `if (env.NODE_ENV !== "production")` becomes a no-op in prod regardless of how the
container is started. Always read `APP_ENV` (a regular runtime env var) for development/staging/
production gating. Symptom anchor: prod-only guard code "works in dev, silently disabled in prod."
Lesson: [[webpack-define-plugin-trap]] (2026-05-23). Applies to: Turnstile hostname-mismatch
guard, e2e-bypass provider gate, any debug-only logic.

#### G3 — Dev compose MUST expose every port the browser dials, not only APP_PORT
Pattern: cross-port realtime infrastructure (Socket.IO on SOCKET_PORT, LiveKit on LIVEKIT_PORT,
MinIO console on STORAGE_CONSOLE_PORT) needs explicit `ports:` mapping in `docker-compose.app.yml`
even when the service shares the app container — `expose:` alone keeps it Docker-internal.
Always verify with `docker compose ps | grep PORT` after every port-touching change. Symptom
anchor: "service runs but browser DevTools shows `net::ERR_CONNECTION_REFUSED`." Lesson:
[[dev-compose-socket-port-exposure]] (2026-05-23). Applies to: any new dev-time service
addressable by the browser bundle.

#### G4 — Socket.IO bootstrap MUST gate snapshots on a client→server `:ready` event
Pattern: fresh-client first-page-load has a race where the React `useEffect` listener-attach
lands AFTER `socket.connected`, so synchronously-emitted server snapshots (presence, roster,
active-call) drop on the floor. Server side stores `snapshotEmitted` flag idempotent against
StrictMode double-fire. Always pair `attachXHandlers` + `attachUserXHandlers` with a
`{namespace}:ready` event in `ClientToServerEvents`. Symptom anchor: "presence indicator stays
gray on first load, fixes after navigate-away-and-back." Lesson:
[[fresh-client-presence-snapshot-race]] (2026-05-22) + DECISIONS_LOG existing entry.

#### G5 — SocketProvider StrictMode cleanup MUST be guarded against permanent disconnect
Pattern: React 18 StrictMode runs effect cleanup → re-effect in dev. A naive
`useEffect(() => { connect(); return () => disconnect(); }, [])` will fire `disconnect()`
without re-`connect()` if the parent unmounts/remounts atomically — leaving the socket dead
and presence/dialog flows silently broken. Always use the connection-pooling SocketProvider
(`apps/web/src/lib/socket/SocketProvider.tsx`) which detects StrictMode and skips premature
cleanup. Symptom anchor: "presence and incoming-call dialog work in prod but break in dev."
Lesson: [[strictmode-socket-disconnect-permanent]] (2026-05-22).

#### G6 — LiveKit URL MUST return `NEXT_PUBLIC_LIVEKIT_URL` to the browser
Pattern: server-side `LIVEKIT_URL` env var points at a docker-internal hostname
(`http://livekit:7880`) for SFU↔server traffic. The token-mint tRPC procedure MUST return
`env.NEXT_PUBLIC_LIVEKIT_URL` (host-reachable) to the client — never the server-side URL.
Symptom anchor: "token mints successfully but `connect()` ICE fails / `ERR_NAME_NOT_RESOLVED`
on the LiveKit hostname." Lesson: [[livekit-url-host-reachability]] (2026-05-23) +
[[livekit-dev-docker-node-ip-port-mismatch]] (2026-05-21).

#### G7 — Multi-environment env-var renames MUST sweep `.env.dev / .env.staging / .env.prod / .env.example` + compose files in the same commit
Pattern: code grep + rename in `src/env.ts` is half the work. Every `.env.*` file AND every
compose file referencing the old name MUST also be updated atomically. Otherwise the variable
silently resolves as `undefined` in one environment and works in another. Symptom anchor: "dev
works, staging crashes with `env.X is undefined`." Lesson: [[livekit-env-name-mismatch]]
(2026-05-19).

#### G8 — Prisma standalone Docker build MUST `COPY` the engine binary explicitly
Pattern: `next build --output=standalone` traces JS but does not detect Prisma's native engine
binary. Production Dockerfile MUST include `COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-*.so.node ./node_modules/.prisma/client/`
(adjust for the active target triple). Symptom anchor: "container starts, first DB query throws
`PrismaClientInitializationError: cannot find query engine`." Lesson:
[[prisma-standalone-engine-bundling]] (2026-05-23).

#### G9 — PgBouncer AUTH_TYPE MUST match Postgres `password_encryption`
Pattern: Postgres 14+ defaults to `scram-sha-256`. PgBouncer's default `AUTH_TYPE=md5` will
forward auth that Postgres rejects with `password authentication failed (wrong password type)`
on every connection — not on PgBouncer's own listener. Always set
`AUTH_TYPE=scram-sha-256` in the PgBouncer compose env when Postgres ≥14. Symptom anchor:
"PgBouncer accepts the client connection but every upstream forward fails auth." Lesson:
[[pgbouncer-scram-auth]] (2026-05-23).

#### Domain cross-reference — full gotcha → guardrail mapping
| Domain                  | Lesson IDs                                                                  | Guardrail |
|-------------------------|------------------------------------------------------------------------------|-----------|
| Webpack/bundling        | [[webpack-module-duplication-singleton-trap]] · [[webpack-define-plugin-trap]] · packages-shared-js-leftover · typescript-consistent-type-imports | G1 · G2  |
| Realtime/Socket.IO      | [[fresh-client-presence-snapshot-race]] · [[strictmode-socket-disconnect-permanent]] · [[trpc-client-procedure-type-missing]] · [[dev-compose-socket-port-exposure]] | G3 · G4 · G5 |
| LiveKit                 | [[livekit-url-host-reachability]] · [[livekit-dev-docker-node-ip-port-mismatch]] · [[livekit-client-initiated-dual-meaning]] · [[livekit-env-name-mismatch]] | G6 · G7  |
| Database/Prisma         | [[pgbouncer-scram-auth]] · [[prisma-standalone-engine-bundling]] · prisma-migrate-needs-database-url · prisma-no-cuid2 | G8 · G9  |
| Auth.js v5 / JWE        | [[auth-bypass-prod-guard]] · [[playwright-smoke-auth-configuration-blocker]] · authjs-jwt-module-augmentation | G2 (APP_ENV gate applies)  |
| Dependency / CVE        | nodemailer-cve-superseded (this doc, prior section) · nodemailer-8x-peer-break · pnpm-audit-level-ignored | (no new G — covered by pnpm.overrides pattern) |
| Routing / Guest meeting | [[t-slug-dev-routes-broken]] · [[guest-meeting-layout-bypass-missing]]      | (Phase-7-specific, not recurring) |
| Dev environment         | bootstrap-wsl2-docker · nextjs-instrumentation-edge-stub                    | (one-time setup, not recurring) |
| TypeScript strict       | exactoptional-usetheme · sonnet-30k-budget-tool-results                     | (handled by Rule 12 + memory-governance §1) |

#### Use of these guardrails
Phase 8 Batch 2+ work and all future Phase 7 Feature Updates SHOULD treat G1–G9 as default
implementation patterns. They do not require a new check in CI — they are reviewer/agent-level
guardrails, applied during planning (Tiered Decomposition §1) and execution (TDD per Rule 25).
When a new realtime/bundling/env failure mode surfaces that does not match G1–G9, write a 🔴
gotcha to lessons.md AND append a tenth guardrail here in a follow-up edit.

Locked: yes — 2026-05-23.
