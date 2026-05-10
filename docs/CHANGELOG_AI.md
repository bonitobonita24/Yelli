# Changelog — AI-attributed (Spec-Driven Platform V31)
# Format (Rule 15):
# ## YYYY-MM-DD — [Phase or Feature Name]
# - Agent:               CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN | BOOTSTRAP
# - Why:                 reason for the change
# - Files added:         list or "none"
# - Files modified:      list or "none"
# - Files deleted:       list or "none"
# - Schema/migrations:   list or "none"
# - Errors encountered:  list or "none"
# - Errors resolved:     how each was fixed, or "none"
# ---

## 2026-05-11 — Phase 0 Bootstrap
- Agent:               BOOTSTRAP
- Why:                 Initialise Spec-Driven Platform V31 governance + scaffold infrastructure for Yelli (instant video intercom SaaS).
- Files added:         .clinerules, .nvmrc, package.json (minimal), .cline/STATE.md, .cline/memory/lessons.md, .cline/memory/agent-log.md, .cline/tasks/phase4-part{1..8}.md, .claude/settings.json, .vscode/mcp.json, .specstory/config.json, .specstory/specs/v31-master-prompt.md, .github/skills/spec-driven-core/SKILL.md, .github/skills/.gitkeep, scripts/log-lesson.sh, .vscode/tasks.json, docs/CHANGELOG_AI.md, docs/DECISIONS_LOG.md, docs/IMPLEMENTATION_MAP.md, project.memory.md, CREDENTIALS.md (gitignored).
- Files modified:      .gitignore (replaced with full V31 bootstrap version including CREDENTIALS.md).
- Files deleted:       none.
- Schema/migrations:   none (Phase 0).
- Errors encountered:  none.
- Errors resolved:     none.

## 2026-05-11 — Phase 2.5 / 2.6 / 2.7 / 3 — Spec generation
- Agent:               CLAUDE_CODE
- Why:                 Lock the technical spec for Yelli before Phase 4 scaffold. PRODUCT.md was already complete from Planning Assistant; Phase 2 interview was skipped. Phase 2.5 spec summary confirmed by human → Phase 2.6 design system skipped (no UI UX Pro Max skill, no Section K — docs/DESIGN.md serves as visual reference per Scenario 33) → Phase 2.7 spec stress-test PASSED (0 gaps in 4-category check) → Phase 3 generated all spec + env files.
- Files added:         inputs.yml (v3 — full app spec, 13 entities, 13 modules, 6 roles, 4 BullMQ queues), inputs.schema.json, .env.dev, .env.staging, .env.prod, .env.example, scripts/sync-credentials-to-env.sh (executable).
- Files modified:      docs/DECISIONS_LOG.md (locked: Tenancy multi+single path, Tech Stack, Docker Hub publish bonitobonita24/yelli, Komodo+Traefik V27 deploy, Xendit payment, Cloudflare Turnstile, Phase 2.7 vibe_test enabled, WCAG AA, dev port base 43502, LiveKit/Coturn video infra, Socket.IO signaling); docs/IMPLEMENTATION_MAP.md (pending — update after this entry); .cline/STATE.md (Phase 3 complete); .cline/memory/agent-log.md (per-step entries).
- Files deleted:       none.
- Schema/migrations:   none (Phase 4 Part 3 generates Prisma schema + migrations).
- Errors encountered:  none.
- Errors resolved:     none.
- Decisions locked:    Multi-tenant with single-tenant self-hosted path, shared schema + org_id, L3+L5+L6 always active, Docker Hub repo bonitobonita24/yelli, dev port base 43502, Xendit payment, Turnstile bot protection, WCAG AA accessibility, LiveKit self-hosted SFU + Coturn + Socket.IO signaling.

## 2026-05-11 — Phase 4 Part 1 — Root config files
- Agent:               CLAUDE_CODE
- Why:                 Generate root config baseline (Part 1 of 8) so subsequent Parts can scaffold workspaces, packages, and apps on a consistent TypeScript-strict / pnpm-workspace / Turborepo foundation. Branch scaffold/part-1 → squash-merge to main per Rule 23/24.
- Files added:         pnpm-workspace.yaml (apps/* + packages/* + tools), turbo.json (build/lint/typecheck/test/dev/clean pipelines + globalDependencies/globalEnv), tsconfig.base.json (strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, Bundler resolution, ES2022/DOM libs), .editorconfig, .prettierrc (singleQuote, semi, trailingComma all, printWidth 100, MD/YAML overrides), .eslintrc.js (TS-strict + import/order + no-explicit-any error + Rule 13 packages/db guard via no-restricted-syntax), pnpm-lock.yaml (generated on first install).
- Files modified:      package.json (added turbo + prettier + eslint + typescript devDependencies, scripts: build/dev/lint/typecheck/test/clean/format/tools:*), .gitignore (finalized — added coverage, playwright-report, test-results, .nyc_output, Thumbs.db, *.swp, .idea, next-env.d.ts, .pnpm-debug.log*).
- Files deleted:       none.
- Schema/migrations:   none (Part 1 is config-only).
- Errors encountered:  none.
- Errors resolved:     n/a — prettier reformatted turbo.json + .eslintrc.js inline before commit; eslint config required no fixes.
- Verification:        pnpm install succeeded (249 packages); JSON/CJS parse for all configs ✓; prettier --check passed on formattable files ✓; eslint .eslintrc.js passed ✓; find verification confirms all 8 expected files present.
