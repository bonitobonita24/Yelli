# Phase 4 Execution Plan — Yelli
Generated: 2026-05-11 by CLAUDE_CODE (Opus 4.6 — Architect)

## Complexity Profile

| Metric | Count | Impact |
|--------|-------|--------|
| Entities | 13 | MEDIUM (LARGE = 41+) |
| Modules | 13 | MEDIUM (LARGE = 16+) |
| Pages (URLs) | 28 | MEDIUM (LARGE = 61+) |
| BullMQ Queues | 4 | recording-processing, report-generation, usage-calculation, billing-cycle |
| Mobile First pages | 21 | All — web-only responsive (no native Expo) |
| Cross-module entities | 4 | Organization, User, Department, Meeting (referenced by 3+ modules) |
| Custom infra | 2 | LiveKit SFU + Coturn TURN (non-standard for the framework) |
| **Overall** | | **MEDIUM-LARGE** |

## Module Breakdown

| Module | Entities | Pages | Complex logic | Depends on |
|--------|----------|-------|---------------|------------|
| Auth / Org / User | Organization, User | login, register, /admin/users, /admin/settings | role/security_version session invalidation | (foundation) |
| Speed Dial Board | Department | /app | presence engine (Socket.IO), auto-answer | Auth, User, Department |
| Video Calling | CallLog | /app/call/:id, /app/meeting/:id | LiveKit token JWT, room scoping, reconnection | Meeting, Auth |
| In-Call Chat | ChatMessage | /app/chat/:meetingId | Socket.IO realtime delivery + persistence | Meeting |
| File Sharing | SharedFile | (in-call overlay) | MinIO upload + plan-gated persistence | Meeting, Storage |
| Whiteboard | WhiteboardSnapshot | (in-call overlay) | Realtime multi-cursor canvas | Meeting |
| Recording | Recording | /app/recordings | LiveKit Egress webhook + storage upload | Meeting, Storage, Jobs |
| Meeting Management | Meeting, Participant | /app/meetings, /app/meetings/new | guest token, lobby, moderator promotion | Auth |
| Department Mgmt | Department | /admin/departments | device binding, CSV import | Auth (admin) |
| Tenant Admin Dashboard | (aggregates) | /admin | charts via shadcn/Recharts | All entities |
| Billing (SaaS) | Subscription, Invoice | /admin/billing | Xendit webhook (x-callback-token), plan gating, grace periods, billing-cycle BullMQ job | Auth, Plan logic |
| Super Admin Panel | PlatformSettings | /superadmin/* | dedicated Prisma client (no L6 guard), platform-wide queries | All entities (special access) |
| Reports & Export | (aggregates) | /admin/reports | CSV/PDF export, report-generation BullMQ job | All entities |

## Session Schedule

### Part 1 — Root config (1 session)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 1 | pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .editorconfig, .prettierrc, .eslintrc.js, finalize .gitignore | 7 | ~25K | ✅ SAFE |

### Part 2 — Shared packages (1 session)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 2 | packages/shared (types + Zod schemas for all 13 entities), packages/api-client (tRPC client) | 8 | ~35K | ✅ SAFE |

### Part 3 — Database + tRPC routers (SPLIT into 4 sub-sessions due to 13 entities + complex security)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 3a | SCHEMA: Organization + User + Department + Subscription + Invoice + PlatformSettings (6 entities). AuditLog model. tenant-guard $allOperations extension. Seed script with webmaster account. | 6 | ~60K | ⚠ AT RISK |
| 3b | SCHEMA: Meeting + CallLog + Participant + ChatMessage + Recording + SharedFile + WhiteboardSnapshot (7 entities). Migrations + seed extension for demo data. | 7 | ~55K | ✅ SAFE |
| 3c | ROUTERS: auth, org, user, department, billing (Xendit webhook handler), super-admin (separate Prisma client per security.md) | 7 | ~70K | ⚠ AT RISK — most security-critical session |
| 3d | ROUTERS: meeting (guest token + lobby + moderator), intercom call, in-call chat, recording (Egress webhook), shared-file, whiteboard | 7 | ~65K | ⚠ AT RISK |

### Part 4 — UI primitives + Jobs + Storage (SPLIT into 2)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 4a | packages/ui (shadcn/ui init in workspace, 9 base components: button card dialog input label select textarea toast sonner + chart + data-table + form + sidebar). Apply docs/DESIGN.md color/typography tokens to globals.css. | 15 | ~70K | ⚠ AT RISK |
| 4b | packages/jobs (4 BullMQ workers + retry/DLQ config) + packages/storage (MinIO wrapper, tenant-prefixed keys, mime-type whitelist, SVG/HTML block) | 8 | ~40K | ✅ SAFE |

### Part 5 — Web UI scaffold (SPLIT into 5 by domain — Mobile First baseline)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 5a | shadcn init in apps/web. App shell: src/env.ts (Zod), middleware.ts (tenant + auth + Turnstile), layout.tsx (Inter font, theme provider, dark mode), next.config.ts (7 security headers + Turnstile CSP), Auth.js v5 setup with PostgreSQL adapter, rate-limit.ts, sanitize.ts, /login + /register + /forgot-password + /join/:token pages with Turnstile widgets. | 12 | ~75K | ⚠ AT RISK |
| 5b | Speed Dial Board (/app): grid of department buttons with Socket.IO presence client, adaptive button sizing, group_label grouping, auto-answer badge. Video Calling UI: /app/call/:id 1:1 intercom view with LiveKit client SDK, ringtone, accept/reject. | 10 | ~70K | ⚠ AT RISK |
| 5c | Meeting Management (/app/meetings + /new + /app/meeting/:id): meeting create form, meeting list (DataTable on desktop, card list on mobile), meeting room (LiveKit multi-participant up to 50, screen share, mute/unmute, host controls, moderator promotion). | 9 | ~70K | ⚠ AT RISK |
| 5d | In-call overlays: chat sidebar (full-screen on mobile), file sharing (Kibo UI dropzone), whiteboard canvas, recording indicator + start/stop. Call history (/app/history) + Recordings library (/app/recordings) + Chat history (/app/chat/:id). | 11 | ~75K | ⚠ AT RISK |
| 5e | Admin pages: /admin (dashboard with Recharts), /admin/departments (CRUD + CSV import + device binding), /admin/users (invite + role + deactivate), /admin/settings, /admin/billing (Xendit checkout flow + plan upgrade), /admin/reports (CSV/PDF export trigger), /superadmin/* (tenant management + revenue + platform settings — uses platformPrisma client per security.md). | 12 | ~78K | ⚠ AT RISK |

### Part 6 — Mobile (SKIPPED)
Yelli is web-only Mobile First responsive. No Expo scaffold. Auto-skip per phase4-part6.md.

### Part 7 — Infra + tools (SPLIT into 2)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 7a | tools/ (validate-inputs, check-env, check-product-sync with private tag check, hydration-lint). deploy/compose/dev/ + stage/ + prod/ (db, cache, storage, infra, pgadmin compose files + start.sh). LiveKit + Coturn compose entries (non-standard — Yelli specific). | 14 | ~65K | ⚠ AT RISK |
| 7b | docker-compose.app.yml per env (dev with build:, stage/prod image-only with Traefik labels). push.sh manual pipeline. COMMANDS.md master reference. .socraticodecontextartifacts.json (MERGE — preserve any prior entries). k8s-scaffold placeholder. | 8 | ~45K | ✅ SAFE |

### Part 8 — CI + finalize (1 session)
| Session | Tasks | Est. Files | Est. Context | Risk |
|---------|-------|-----------|-------------|------|
| 8 | .github/workflows/ci.yml (3 jobs: governance, quality matrix, security audit). .github/workflows/docker-publish.yml (multi-platform build + push :latest + :staging-latest + :sha-{hash}). MANIFEST.txt enumeration. Final IMPLEMENTATION_MAP rewrite. SocratiCode initial index trigger. README.md. | 6 | ~50K | ✅ SAFE |

## Summary

| Metric | Value |
|--------|-------|
| Total sessions | **14** (Part 1: 1, Part 2: 1, Part 3: 4, Part 4: 2, Part 5: 5, Part 6: SKIP, Part 7: 2, Part 8: 1) |
| Sessions marked SAFE (≤60K) | 4 |
| Sessions marked AT RISK (60-80K) | 10 |
| Sessions marked MUST SPLIT (>80K) | 0 |
| Estimated total build time | ~10-12 hours (14 sessions × ~45 min avg) |

## Risk Mitigation for AT RISK Sessions

Each AT RISK session must apply these mid-session strategies if context approaches 80K:
1. Use `codebase_search` (Rule 17) before opening any file — never speculative reads
2. Read PRODUCT.md section-by-section, NEVER the full file
3. If thrashing detected: STOP → commit partial work → STATE.md PARTIAL flag → human opens new session

## Architect-Execute Dispatch (memory-governance.md §4)

This plan is the **Architect output**. For each session:
- Opus 4.6 (Architect) reads STATE.md + this plan + relevant docs → writes task scope ≤30K tokens
- Sonnet 4.6 (Executor) receives scoped task via Agent(model: "sonnet") → builds → tests → commits
- Opus reviews output (spec compliance + code quality per Rule 25 two-stage review)
- After all sub-sessions of a Part complete → squash-merge → STATE.md update → STOP

## Read Rules per Session

Each session MUST follow these read constraints:
- Read ONLY the PRODUCT.md sections listed in the session's task assignment
- Read ONLY the Prisma models for entities in the current module
- Read ONLY existing files that the current task directly imports from
- Do NOT scan directories — read specific files by path
- Do NOT read files from modules not assigned to this session
- Apply Tiered Decomposition §1 + Token Budget Gate §1 Step 2.5 (30K per Sonnet subagent)

## Skill Activation Schedule

### Primary Group (install ONCE — recommended for all sessions)
Run in Claude Code: `/scan-project`
Verify these are installed (or add manually):
1. superpowers — TDD, debugging, parallel agents, brainstorming
2. code-review-graph — codebase blast radius (after Phase 6)
3. planning-with-files — persistent plans
4. frontend-design + design-auditor + owasp-security
5. git-pushing
6. claude-skills-65 — multi-framework (optional)

### Per-Phase Supplementary Skills
- Before Part 3 (schema + routers): postgres skill — for live DB inspection
- Before Part 5 (UI): oiloil-ui-ux-guide, playwright-skill — UX patterns + e2e
- Before Phase 5 (validation): test-fixing — systematic test repair
- Phase 7 onward: review-implementing — review feedback handling

### Session Discipline
Start every session with: `catch me up` (loads memory + git context)
End every session with: `save session` (distills decisions + patterns to memory)

## Skill Activation Schedule (delta vs framework default)
Yelli adds LiveKit + Coturn — no specific skills exist for these, so Sonnet will need to invoke
**Context7** (Rule 30) heavily during Parts 3d, 5b, 5c, 5d:
  "Implement LiveKit room token generation with tenant scoping. use context7"
  "Set up LiveKit Egress webhook handler for recording-ready events. use context7"
  "Configure Coturn with short-term credentials and TURN URI generation. use context7"

## Phase 4 Trigger Sequence

1. Human opens NEW Claude Code session
2. Says "Start Part 1" → reads phase4-part1.md → completes 1 session → STOPS
3. Human opens NEW session → says "Start Part 2" → reads phase4-part2.md → completes → STOPS
4. Part 3 expands to 3a/3b/3c/3d — human opens 4 separate sessions
5. Part 4 expands to 4a/4b — 2 sessions
6. Part 5 expands to 5a-5e — 5 sessions
7. Part 6: human says "skip Part 6 — no mobile" → STATE.md marks Part 6 skipped
8. Part 7 expands to 7a/7b — 2 sessions
9. Part 8: 1 session
10. After Part 8: human says "Start Phase 5" → validation suite

Total: ~14 fresh Claude Code sessions to complete Phase 4.
