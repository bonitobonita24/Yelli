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
