# Lessons Memory — Spec-Driven Platform V31

# Entry format: ## YYYY-MM-DD — [ICON] [Title]

# Types: 🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change

# READ ORDER: 🔴 first → 🟤 second → rest by relevance

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
