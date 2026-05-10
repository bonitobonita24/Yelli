# Phase 4 Part 7 — tools/ + deploy/compose/ + SocratiCode artifacts
# Fresh session. Read STATE.md first.
TASK: Generate validation tools, compose files, deploy scripts, MCP context artifacts (Part 7 of 8).
- Read .cline/STATE.md first. Confirm Parts 1-6 complete.
- Read inputs.yml (full). Read DECISIONS_LOG.md (deployment manager, ports).
- Read .claude/rules/phases.md "PART 7" + .claude/rules/templates.md.
- Create scaffold/part-7 branch.
- Generate tools/:
  - validate-inputs.mjs, check-env.mjs, check-product-sync.mjs (private tag check), hydration-lint.mjs
- Generate deploy/compose/{dev|stage|prod}/:
  - docker-compose.db.yml (PostgreSQL + PgBouncer — must start first, creates network)
  - docker-compose.cache.yml (Valkey — external network)
  - docker-compose.storage.yml (MinIO — external network)
  - docker-compose.infra.yml (MailHog — DEV ONLY)
  - docker-compose.pgadmin.yml + pgadmin-servers.json (all envs — V16)
  - docker-compose.app.yml:
    - DEV: build: + image: keys (rebuilds from source)
    - STAGE/PROD: image: ONLY, NO build: key, Traefik labels for HTTPS routing (V27)
  - start.sh — convenience startup script
  - push.sh (CONDITIONAL — only if docker.publish: true) — manual image promotion pipeline
- Generate COMMANDS.md at project root (CONDITIONAL — only if docker.publish: true) — master command reference.
- Generate deploy/k8s-scaffold/ — inactive placeholder + README.
- Generate .socraticodecontextartifacts.json — MERGE with any existing entries (do NOT overwrite Phase 2.6 design-system entry).
  Add 4 entries: database-schema, implementation-map, decisions-log, product-definition.
- Run: pnpm typecheck + pnpm lint for tools/. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 7 complete. Open phase4-part8.md in a NEW Claude Code session."
STOP HERE.
