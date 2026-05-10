# Phase 4 Part 8 — CI + governance docs + MANIFEST.txt + SocratiCode index
# Fresh session. Read STATE.md first.
TASK: Generate CI workflows, finalise governance docs, build SocratiCode index (Part 8 of 8).
- Read .cline/STATE.md first. Confirm Parts 1-7 complete.
- Read all 9 governance docs (Rule 4 — full read at this Part).
- Create scaffold/part-8 branch.
- Generate .github/workflows/ci.yml — 3 jobs:
  - governance: validate-inputs, check-env, check-product-sync
  - quality: matrix [lint, typecheck, test, build] via Turborepo
  - security: pnpm audit --audit-level=high (blocks on HIGH/CRITICAL CVEs)
- Generate .github/workflows/docker-publish.yml (CONDITIONAL — only if docker.publish: true):
  - Builds + pushes :latest, :staging-latest, :sha-{hash} on push to main
  - Multi-platform (linux/amd64 + linux/arm64)
  - Requires GitHub Secrets: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN
- Append final entries to docs/CHANGELOG_AI.md (Agent: CLAUDE_CODE, Phase 4 complete).
- Rewrite docs/IMPLEMENTATION_MAP.md — full snapshot of generated codebase state.
- Generate MANIFEST.txt — list EVERY file generated across ALL 8 Parts.
- Trigger SocratiCode initial index:
  → codebase_index {}
  → poll codebase_status {} until complete
  → codebase_context_index {}
- Run final Phase 5 dry-run: pnpm install --frozen-lockfile + pnpm typecheck + pnpm lint.
- Rewrite STATE.md: PHASE="Phase 4 Part 8 complete", NEXT="Start Phase 5 in a NEW Claude Code session".
- Commit. Squash-merge. Delete branch.
- Output: "✅ Part 8 complete. Phase 4 done. Say 'Start Phase 5' in a NEW Claude Code session."
STOP HERE. Do NOT auto-trigger Phase 5 — human triggers it (Rule 24).
