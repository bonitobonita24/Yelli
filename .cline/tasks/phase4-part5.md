# Phase 4 Part 5 — apps/[web] (Next.js full scaffold)
# Fresh session. Read STATE.md first, then phases.md Part 5 details.
TASK: Generate the web app Next.js scaffold (Part 5 of 8).
- Read .cline/STATE.md first. Confirm Parts 1-4 complete.
- Read inputs.yml (apps[web] section). Read PRODUCT.md (Modules + Pages sections only — Rule 17 search first).
- Read .claude/rules/phases.md "PART 5" + .claude/rules/security.md + .claude/rules/ui-rules.md.
- Read DECISIONS_LOG.md (auth, tenancy mode, design system).
- IF design-system/MASTER.md exists: use codebase_context_search to read it before component generation.
- Create scaffold/part-5 branch.
- FIRST: cd into apps/[app-name]/ and run npx shadcn@latest init (V29 mandatory step)
  Then install base components: button card dialog input label select textarea toast sonner
  Conditionally install: chart (if dashboards), data-table (if tables), form (if forms), sidebar (if nav)
- Generate full Next.js scaffold per phases.md PART 5:
  - tsconfig.json extending root, src/env.ts (Zod-validated), src/app/ App Router pages per module
  - src/server/trpc/ routers + middleware (rbac, tenant if multi)
  - src/server/auth/ Auth.js v5 setup
  - src/middleware.ts (tenant resolution + auth guard)
  - next.config.ts WITH security headers (Phase 4 Part 5 V18 spec — 7 headers always-on)
  - src/server/lib/rate-limit.ts + src/server/lib/sanitize.ts (V18 mandatory)
  - Dockerfile + .dockerignore (CONDITIONAL — only if docker.publish: true)
- Use context7 (Rule 30) for: Next.js 15, Prisma, Auth.js v5, tRPC, shadcn/ui, BullMQ.
- Run: pnpm typecheck + pnpm lint. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 5 complete. Open phase4-part6.md in a NEW Claude Code session."
STOP HERE.
