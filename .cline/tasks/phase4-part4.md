# Phase 4 Part 4 — packages/ui + packages/jobs + packages/storage
# Fresh session. Read STATE.md first, then inputs.yml only.
TASK: Generate shared UI primitives, job queues, and storage wrappers (Part 4 of 8).
- Read .cline/STATE.md first. Confirm LAST_DONE shows Part 3 complete.
- Read inputs.yml (apps + jobs + storage sections). Read .cline/memory/lessons.md (ALL 🔴 gotchas).
- Read DECISIONS_LOG.md (UI ecosystem, job provider, storage provider).
- Create scaffold/part-4 branch.
- Generate packages/ui/:
  - shadcn/ui setup (run npx shadcn@latest init in packages/ui workspace per Rule 26 monorepo guide)
  - Tailwind + Radix UI primitives
  - If mobile declared: React Native Reusables + NativeWind setup separately for mobile consumption
- Generate packages/jobs/ (CONDITIONAL — only if jobs.enabled in inputs.yml):
  - Valkey + BullMQ typed queue definitions
  - Worker scaffold per queue named in inputs.yml
  - DLQ + retry/backoff configuration
- Generate packages/storage/ (CONDITIONAL — only if storage.enabled in inputs.yml):
  - Typed MinIO/S3/R2 wrapper based on storage provider
  - Tenant-prefixed key helpers (Rule 7B + security.md File Upload Safety)
- Run: pnpm typecheck for this Part. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 4 complete. Open phase4-part5.md in a NEW Claude Code session."
STOP HERE.
