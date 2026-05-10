# Implementation Map — Yelli
# Current build state. Rewritten after every phase or feature update (Rule 3).
# ---

## Project Status
Phase: 4 Part 1 complete — root config baseline in place. Next: Part 2 in a new session.
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
  - pnpm-workspace.yaml (apps/* + packages/* + tools)
  - turbo.json (build/lint/typecheck/test/dev/clean pipelines + globalEnv)
  - tsconfig.base.json (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + ES2022 + Bundler resolution)
  - .editorconfig (LF, 2-space, UTF-8)
  - .prettierrc (singleQuote, semi, trailingComma all, printWidth 100)
  - .eslintrc.js (@typescript-eslint + import/order + no-explicit-any error + Rule 13 packages/db guard)
  - .gitignore finalised (added coverage, playwright-report, test-results, .idea, Thumbs.db, *.swp, next-env.d.ts)
  - package.json upgraded with turbo + lint + typecheck + format + tools:* scripts
  - pnpm-lock.yaml generated (first install — 249 packages)
  - Branch scaffold/part-1 → squash-merged to main

## Not Yet Built
- Phase 4 Parts 2-8 (full scaffold)
  - Part 2: packages/shared + packages/api-client
  - Part 3: packages/db (Prisma schema, migrations, seed, AuditLog, tenant-guard $allOperations extension)
  - Part 4: packages/ui + packages/jobs + packages/storage
  - Part 5: apps/web (Next.js, tRPC, Auth.js v5, security headers, rate limit, sanitize, Dockerfile)
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

## File Counts (as of 2026-05-11 Phase 4 Part 1)
- Governance docs: 9 (all initialised + Phase 3 updates locked)
- Spec files: inputs.yml + inputs.schema.json
- Env files: 3 real (gitignored) + 1 example (committed)
- Root config (Part 1): 8 (pnpm-workspace + turbo + tsconfig.base + editorconfig + prettierrc + eslintrc + gitignore + nvmrc) + package.json + pnpm-lock.yaml
- Bootstrap infrastructure files: 13
- Source files (apps/, packages/): 0 (Parts 2-7 not yet started)
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
