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
Frontend:        Next.js 15 (App Router) + TypeScript strict
API:             tRPC v11 + Zod (Rule 12)
ORM:             Prisma (PostgreSQL 16-alpine + PgBouncer)
Auth:            Auth.js v5 (email/password + social + magic link, PostgreSQL sessions)
Cache + Jobs:    Valkey 7-alpine + BullMQ (MIT — replaces Redis)
Storage:         MinIO (dev/self-hosted) → S3/R2 (SaaS prod)
UI:              shadcn/ui + Tailwind + Recharts (via shadcn Chart) + Kibo UI (file dropzone)
Icons:           lucide-react (locked — no other libraries per Rule 26)
Media:           LiveKit self-hosted (Apache 2.0) + LiveKit Egress (recording)
TURN:            Coturn self-hosted (NAT traversal)
Signaling:       Socket.IO (presence, in-call chat, ringing, notifications)
Payment:         Xendit (PHP — card, GCash, Maya, GrabPay, bank transfer)
Bot protection:  Cloudflare Turnstile (managed widget, prod-only real keys)
Mobile:          None native — web-only Mobile First responsive (Rule 13 N/A)
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
Enforcement: Phase 4 Part 5 generates WCAG AA checklist for every UI component. a11y skill
  recommended (install /plugin install a11y-skill or npx skills add airowe/claude-a11y-skill).
Locked: yes — 2026-05-11.

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
