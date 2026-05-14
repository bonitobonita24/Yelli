# Yelli

Instant video intercom for offices, hospitals, and government departments.
Built with the **Spec-Driven Platform V31** framework.

- **Slug:** `yelli`
- **Domain (prod):** `yelli.powerbyte.app`
- **Domain (staging):** `yelli-staging.powerbyte.app`
- **Image:** `bonitobonita24/yelli`
- **Tenancy:** Multi-tenant SaaS (subdomain routing `[org-slug].yelli.powerbyte.app`) + single-tenant self-hosted path

---

## Quick start (dev — WSL2 native)

```bash
# 1. Install deps
pnpm install --frozen-lockfile

# 2. Generate Prisma client
pnpm --filter @yelli/db prisma generate

# 3. Start backing services (Postgres + PgBouncer + Valkey + MinIO + LiveKit + Coturn + MailHog + pgAdmin)
bash deploy/compose/start.sh dev up -d

# 4. Run migrations + seed the webmaster super-admin
pnpm --filter @yelli/db prisma migrate deploy
pnpm --filter @yelli/db prisma db seed

# 5. Start the Next.js app (live-reload)
pnpm dev
```

App URL → `http://localhost:43512`
First-login credentials → `CREDENTIALS.md` (gitignored, machine-local)

> **Full command reference:** see `COMMANDS.md`.
> **Bootstrap onboarding:** Phase 1 (Node 22 + pnpm 10 + VS Code Remote-WSL) is skipped if already installed.

---

## Service URLs (dev)

| Service          | URL                                     | Notes                                |
|------------------|-----------------------------------------|--------------------------------------|
| App              | http://localhost:43512                  | Next.js 15 App Router                |
| pgAdmin          | http://localhost:43509                  | Credentials in CREDENTIALS.md        |
| MinIO console    | http://localhost:43506                  | S3-compatible storage UI             |
| MailHog UI       | http://localhost:43508                  | SMTP capture (dev only)              |
| LiveKit signal   | ws://localhost:43532                    | SFU WebSocket                        |
| Prisma Studio    | http://localhost:43522                  | `pnpm --filter @yelli/db prisma studio` |

> Ports are non-standard (Rule 22 — `ports.dev.base=43502` in `inputs.yml`) to avoid collisions with
> other projects on the same machine. Staging and prod use standard ports.

---

## Daily commands

```bash
# Quality (mirrors CI)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level=high

# Governance (Phase 5 gates)
pnpm tools:validate-inputs       # inputs.yml against schema
pnpm tools:check-env             # .env.<env> parity + placeholder scan
pnpm tools:check-product-sync    # PRODUCT.md ↔ inputs.yml + private-tag leak scan
pnpm tools:hydration-lint        # SSR/CSR footgun heuristic

# Compose lifecycle (dev | stage | prod)
bash deploy/compose/start.sh dev up -d
bash deploy/compose/start.sh dev down
bash deploy/compose/start.sh dev logs -f

# Manual image promotion (requires docker login)
bash deploy/compose/push.sh dev      # build → push :dev-latest + :dev-sha-{hash}
bash deploy/compose/push.sh staging  # re-tag dev → :staging-latest + :staging-sha-{hash}
bash deploy/compose/push.sh prod     # re-tag staging → :latest + :prod-sha-{hash}

# Log a personal lesson (Rule 18 typed format)
bash scripts/log-lesson.sh
# Or VS Code: Cmd/Ctrl+Shift+P → Tasks: Run Task → Log Lesson
```

Every additional command (Docker cleanup, volume reset, credential rotation, pgAdmin
troubleshooting) lives in **`COMMANDS.md`** at the project root.

---

## Adding a feature — the Phase 7 loop

> **Golden rule:** edit `docs/PRODUCT.md` only. Agents do the rest.

1. **Edit `docs/PRODUCT.md`** — describe what the feature does in plain English.
2. **In Claude Code, say `"Feature Update"`** — it reads all 9 governance docs, runs a
   blast-radius check (if `code-review-graph` is installed), generates a failing test
   first, implements the minimal change to pass, and squash-merges to main with
   conventional-commit messages.
3. **Verify locally:**
   ```bash
   pnpm tools:check-product-sync && pnpm typecheck && pnpm test && pnpm build
   ```

Removal is symmetric — delete the section in `PRODUCT.md`, say `"Feature Update"`,
confirm the file list, and the agent writes the down-migration.

For larger sweeps, say `"Start Phase 8"` to enter the iterative buildout loop —
the agent diffs `PRODUCT.md` against `IMPLEMENTATION_MAP.md` and proposes a batch.

---

## Architecture

| Layer           | Choice                                              |
|-----------------|-----------------------------------------------------|
| Frontend        | Next.js 15 (App Router) + Tailwind + shadcn/ui      |
| API             | tRPC v11 + Zod                                      |
| Auth            | Auth.js v5 (Credentials provider + bcrypt)          |
| ORM             | Prisma + PostgreSQL 16 + PgBouncer                  |
| Cache + Jobs    | Valkey 7 (MIT Redis fork) + BullMQ                  |
| Storage         | MinIO (dev / self-hosted) → S3/R2 (SaaS prod)       |
| Video           | LiveKit self-hosted (SFU + Egress)                  |
| TURN            | Coturn self-hosted                                  |
| Realtime        | Socket.IO (presence, chat, ringing)                 |
| Payments        | Xendit (SaaS only; 503-graceful fallback)           |
| Bot protection  | Cloudflare Turnstile (test keys in dev/staging)     |
| Deploy          | Docker Compose + Komodo + Traefik (V27)             |

**Security stack (Rule 7):**

| Layer | Mechanism                              | State                        |
|-------|----------------------------------------|------------------------------|
| L1    | tRPC `tenantId` scoping                | Active in SaaS, dormant in self-hosted |
| L2    | PostgreSQL RLS                          | Dormant — commented in migration |
| L3    | RBAC middleware (`adminProcedure`, `superAdminProcedure`) | **Always active** |
| L4    | PgBouncer per-tenant pool limits        | Active in SaaS               |
| L5    | Immutable `AuditLog`                    | **Always active**            |
| L6    | Prisma `$allOperations` tenant-guard    | **Always active**            |

---

## Codebase intelligence

- **SocratiCode (MCP)** — `codebase_search` / `codebase_graph_query` / `codebase_context_search`.
  Requires Docker; auto-pulls Qdrant + Ollama on first use. Indexes the 4 artifacts in
  `.socraticodecontextartifacts.json` (Prisma schema, IMPLEMENTATION_MAP, DECISIONS_LOG, PRODUCT.md).
- **Context7 (MCP)** — append `"use context7"` to any task involving an external library
  to fetch current version-specific docs (Next.js 15, Prisma, Auth.js v5, tRPC v11, BullMQ, etc.).
- **shadcn MCP** — natural-language component install (`"add a date picker"` → `npx shadcn add date-picker`).

All three are pre-wired in `.vscode/mcp.json` (Bootstrap Step 10).

---

## SpecStory — change history

Every Claude Code session is auto-captured to `.specstory/history/` (gitignored).
Diffs from manual edits and Copilot autocomplete are also captured. The
`Governance Sync` command reconciles unattributed diffs into `CHANGELOG_AI.md`.

---

## Project structure

```
yelli/
├── apps/web/                # Next.js 15 app
├── packages/
│   ├── shared/              # 13 Zod schemas + derived TS types
│   ├── api-client/          # Generic typed tRPC client wrapper
│   ├── db/                  # Prisma client + L6 tenant-guard + L5 audit
│   ├── ui/                  # shadcn/ui workspace (New York style)
│   ├── jobs/                # BullMQ queues + workers
│   └── storage/             # S3-compatible (MinIO → S3/R2)
├── tools/                   # Governance scripts (validate-inputs, check-env, check-product-sync, hydration-lint)
├── deploy/compose/          # 22 compose files (dev/stage/prod) + start.sh + push.sh
├── deploy/k8s-scaffold/     # INACTIVE placeholder (Rule 6)
├── docs/                    # PRODUCT.md + governance docs + DESIGN.md
├── scripts/                 # log-lesson.sh + sync-credentials-to-env.sh
├── .claude/rules/           # Modular CLAUDE.md rules (loaded contextually)
├── .cline/                  # STATE.md + lessons.md + agent-log.md + task files
└── .github/
    ├── workflows/           # ci.yml + docker-publish.yml
    └── skills/              # Cross-agent skill standard
```

**File inventory:** see `MANIFEST.txt` for the complete list.

---

## Phase status

- ✅ Phase 0 Bootstrap
- ✅ Phase 2 / 2.5 / 2.7 Discovery + spec stress-test (PASS, 0 gaps)
- ✅ Phase 2.6 Design system — skipped (Phase 2.8 mockup + `docs/DESIGN.md` serve as fallback)
- ✅ Phase 3 Spec file generation
- ✅ Phase 3.5 Execution plan
- ✅ Phase 4 — Parts 1, 2, 3, 4, 5a, 5b, 5c, 5d, 5e, 5f, 7, 8 (Part 6 mobile SKIPPED — web-only)
- ⏳ **Phase 5 — Validation** ← blocked on CREDENTIALS.md placeholders
- ⏳ Phase 6 — Docker services + Visual QA
- ⏳ Phase 7 — Feature update loop (the daily workflow)

---

## Before Phase 5 — credentials checklist

`CREDENTIALS.md` is gitignored and contains AI-generated placeholders for the secrets
that require human action. Fill these before running `pnpm tools:check-env`:

- 🐙 GitHub username + Personal Access Token
- 🐳 Docker Hub access token (username locked as `bonitobonita24`)
- 📧 SMTP credentials (staging + prod — dev uses MailHog)
- 🦎 Komodo UI URL
- 💳 Xendit API keys (test + live + webhook token)
- 🛡️ Cloudflare Turnstile LIVE keys (prod only — dev/staging use test keys)
- 🔑 LiveKit API key + secret + URL (Yelli core dependency)
- 🔁 Coturn static-auth-secret

Then run:

```bash
bash scripts/sync-credentials-to-env.sh
pnpm tools:check-env
```

When `check-env` passes with zero placeholder warnings, say `"Start Phase 5"` in Claude Code.

---

## License + ownership

- All files under `packages/` and `apps/` are project source — copyright the project owner.
- `CLAUDE.md`, `.claude/rules/`, `.clinerules`, `AGENTS.md`, and `.github/skills/spec-driven-core/`
  are derived from the open-source **Spec-Driven Platform V31** framework.
- shadcn/ui components are MIT-licensed; Kibo UI MIT; lucide-react ISC; Recharts MIT; Prisma Apache 2.0.
- `docs/DESIGN.md` is derived from the MIT-licensed `awesome-design-md` collection per Scenario 33.
