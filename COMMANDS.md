# Yelli — Command Reference

All commands run from the project root unless noted.
ENV placeholder: `dev` | `staging` | `prod`.

---

## 🐳 Docker — Start / Stop / Rebuild

| Command | What it does |
|---|---|
| `bash deploy/compose/start.sh dev up -d` | Start all dev services (db, cache, storage, pgadmin, media, mailhog, app). App rebuilds from source. |
| `bash deploy/compose/start.sh dev down` | Stop all dev services (containers removed, named volumes preserved). |
| `bash deploy/compose/start.sh dev restart` | Restart all dev services. |
| `bash deploy/compose/start.sh staging up -d` | Start staging services (app pulls image from Docker Hub, traffic via Traefik). |
| `bash deploy/compose/start.sh prod up -d` | Start production services. |
| `docker compose -f deploy/compose/dev/docker-compose.app.yml logs -f app` | Tail app container logs. |
| `docker compose -f deploy/compose/dev/docker-compose.media.yml logs -f livekit` | Tail LiveKit logs. |
| `docker compose -f deploy/compose/dev/docker-compose.db.yml ps` | Check DB + PgBouncer health. |

---

## 🧹 Docker — Clean / Reset

> ⚠ Destructive — read carefully.

| Command | What it does | Data lost? |
|---|---|---|
| `bash deploy/compose/start.sh dev down` | Stop + remove containers | ❌ No |
| `bash deploy/compose/start.sh dev down --volumes` | Stop + remove containers + named volumes | ✅ YES — dev DB/cache/storage |
| `docker volume rm yelli_dev_postgres_data` | Remove dev Postgres volume only | ✅ YES — dev DB |
| `docker volume rm yelli_dev_valkey_data` | Remove dev Valkey volume only | ✅ YES — dev cache |
| `docker volume rm yelli_dev_minio_data` | Remove dev MinIO volume only | ✅ YES — dev files |
| `docker volume ls \| grep yelli` | List all Yelli volumes |  |
| `docker builder prune -a -f` | Remove all build cache | ❌ No |
| `docker system prune -a -f` | Remove all unused images + containers | ❌ No |

**Full dev reset (nuclear):**
```bash
bash deploy/compose/start.sh dev down --volumes
docker builder prune -f
bash deploy/compose/start.sh dev up -d
pnpm db:migrate
pnpm db:seed
```

---

## 📦 Docker — Manual Image Pipeline (push.sh)

| Command | What it does |
|---|---|
| `bash deploy/compose/push.sh dev` | Build app image from source → push `:dev-latest` + `:dev-sha-{hash}` |
| `bash deploy/compose/push.sh staging` | Re-tag dev → push `:staging-latest` + `:staging-sha-{hash}` |
| `bash deploy/compose/push.sh prod` | Re-tag staging → push `:latest` + `:prod-sha-{hash}` |
| `docker pull bonitobonita24/yelli:staging-latest` | Manual pull on staging server |
| `docker pull bonitobonita24/yelli:latest` | Manual pull on prod server |

**GitHub Actions also pushes `:latest` + `:staging-latest` + `:sha-{hash}` on every merge to main** — both paths share the same Docker Hub repo (`bonitobonita24/yelli`). Use `push.sh` to promote a dev build that has NOT yet merged to main.

**Rollback (prod):** edit `APP_IMAGE_TAG=prod-sha-{previous-hash}` in `.env.prod` → Komodo UI → Deploy.

---

## 🗄️ Database

| Command | What it does |
|---|---|
| `pnpm db:migrate` | Run all pending Prisma migrations |
| `pnpm db:generate` | Regenerate Prisma client after schema change |
| `pnpm db:seed` | Seed dev data (creates webmaster account + demo orgs) |
| `pnpm db:reset` | **DEV ONLY** — drop + recreate + migrate + seed |
| `pnpm db:studio` | Open Prisma Studio at http://localhost:43522 |

**First admin account** (created by `pnpm db:seed`):
- Username: `webmaster`
- Password: see `CREDENTIALS.md` "First Admin Account" section
- URL: http://localhost:43512/login

---

## 🧪 Testing

| Command | What it does |
|---|---|
| `pnpm test` | Run all tests (unit + integration) |
| `pnpm test --watch` | Watch mode |
| `pnpm test --filter @yelli/web` | Test the web app only |

---

## 🔍 Code Quality

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint across all packages |
| `pnpm typecheck` | TypeScript type check (tsc --noEmit) |
| `pnpm format` | Prettier format all files |
| `pnpm build` | Full production build via Turborepo |
| `pnpm audit --audit-level=high` | Dependency CVE scan (Phase 5 gate) |

---

## ⚙️ Governance Tools

| Command | What it does |
|---|---|
| `pnpm tools:validate-inputs` | Validate inputs.yml against inputs.schema.json |
| `pnpm tools:check-env` | Verify .env.dev/.env.staging/.env.prod key parity |
| `pnpm tools:check-product-sync` | PRODUCT.md ↔ inputs.yml sync + private-tag leak check |
| `pnpm tools:hydration-lint` | Heuristic SSR/CSR hydration footgun scan |

---

## 🌿 Git Workflow (Rule 23)

| Command | What it does |
|---|---|
| `git checkout -b feat/<slug>` | Create feature branch before any work |
| `git checkout -b scaffold/part-N` | Phase 4 Part branch |
| `git add -A && git commit -m "feat(module): description"` | Atomic conventional commit |
| `git checkout main && git merge --squash feat/<slug>` | Squash-merge to main |
| `git branch -d feat/<slug>` | Delete feature branch after merge |
| `git rev-parse --short HEAD` | Current commit short SHA (used in image tags) |

---

## 🤖 AI Agent Triggers (in Claude Code)

| Trigger | What it does |
|---|---|
| `Feature Update` | Start Phase 7 — implement a PRODUCT.md change |
| `Start Phase 8` | Begin iterative buildout loop |
| `Resume Session` + 3 docs | Resume from STATE.md position |
| `Governance Sync` + 9 docs | Reconcile code ↔ governance |
| `Governance Retro` | Last-session retrospective |
| `Re-run Phase 2.7` | Re-run spec stress-test |

---

## 🔌 Dev Services — URLs

(Ports assigned during Phase 3 — see `.env.dev`.)

| Service | URL | Credentials |
|---|---|---|
| App | http://localhost:43512 | webmaster / see CREDENTIALS.md |
| pgAdmin | http://localhost:43509 | see CREDENTIALS.md |
| MinIO Console | http://localhost:43506 | see CREDENTIALS.md |
| MailHog | http://localhost:43508 | (no auth) |
| Prisma Studio | http://localhost:43522 | (no auth) |
| LiveKit (signaling) | ws://localhost:43532 | LIVEKIT_API_KEY + SECRET |
| Coturn (TURN) | localhost:43542 | COTURN_STATIC_AUTH_SECRET |

Run `cat .env.dev | grep _PORT` to list all assigned ports.

---

## 🔐 Credentials

| Command | What it does |
|---|---|
| `cat CREDENTIALS.md` | View all credentials (gitignored — safe to view locally) |
| `grep -i password CREDENTIALS.md` | Quick password lookup |
| `bash scripts/sync-credentials-to-env.sh` | Propagate human-filled CREDENTIALS.md values into .env.dev/.env.staging/.env.prod |
| `git status \| grep CREDENTIALS` | Verify CREDENTIALS.md is NOT tracked |
| `openssl rand -base64 32 \| tr -d '\\n' \| head -c 22` | Generate a strong 22-char secret |

> ⚠ `CREDENTIALS.md` is gitignored. Clones do NOT see it. Run Phase 3 to regenerate.

---

## 🛠️ Utilities

| Command | What it does |
|---|---|
| `cat .env.dev \| grep _PORT` | List all assigned dev ports |
| `docker stats` | Live CPU/memory/network stats |
| `docker exec -it yelli_dev_postgres psql -U yelli_dev -d yelli_dev` | Open PostgreSQL shell |
| `docker exec -it yelli_dev_valkey valkey-cli -a "$REDIS_PASSWORD"` | Open Valkey CLI |
| `docker logs yelli_dev_app --tail 100` | Last 100 lines of app logs |
| `git log --oneline -10` | Last 10 commits |
| `git rev-parse --short HEAD` | Current short SHA (used in image tags) |

---

## 🔁 Typical Daily Flow

```bash
# 1. Start backing services (Docker)
bash deploy/compose/start.sh dev up -d

# 2. Run the app natively (faster HMR)
pnpm --filter @yelli/web dev

# 3. Verify, then promote
pnpm test && pnpm typecheck && pnpm lint
bash deploy/compose/push.sh dev
# (later, after dev verified) bash deploy/compose/push.sh staging
# (later, after staging verified) bash deploy/compose/push.sh prod
```
