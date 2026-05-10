# Phase 4 Part 3 — packages/db
TASK: Generate full ORM schema with all entities (Part 3 of 8).
- Read STATE.md first. Read inputs.yml + PRODUCT.md (Core Entities section).
- Read DECISIONS_LOG.md (tenancy mode, security layers).
- Create scaffold/part-3 branch.
- Generate: Prisma schema, migrations (up+down), seed script, AuditLog, tenant-guard middleware, RLS helpers (if multi-tenant).
- Seed script MUST include the first admin account (MANDATORY — app cannot be accessed without it):
    username: webmaster
    password: SYSTEM-GENERATED — use the value from CREDENTIALS.md "First Admin Account" section.
              DO NOT hardcode any password here. DO NOT invent a password. Read it from CREDENTIALS.md.
              Command to generate (run in terminal — never guess): openssl rand -base64 32 | tr -d '\n' | head -c 22
              bcrypt hash the plaintext value before writing to seed script — never store plaintext in code.
    role: super_admin (or highest role declared in PRODUCT.md Roles section)
    email: webmaster@${APP_SLUG}.local (or ask human for real email)
  This account exists in ALL environments (dev, staging, prod).
  The plaintext password is stored ONLY in CREDENTIALS.md under "First Admin Account".
  CREDENTIALS.md is gitignored — never committed, never pasted into any chat or log.
- All other seed data passwords (test users, demo accounts, etc.) — AI-generated strong passwords:
    Format: minimum 22 chars, mix of uppercase, lowercase, digits, symbols
    Use: openssl rand -base64 32 | tr -d '\n' | head -c 22
    Document ALL seeded account passwords in CREDENTIALS.md under their respective sections.
- Run: pnpm db:generate + pnpm typecheck. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 3 complete. Open phase4-part4.md in a NEW Claude Code session."
STOP HERE.
