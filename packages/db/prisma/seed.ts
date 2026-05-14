/* eslint-disable no-console -- seed script intentionally logs progress */

// =============================================================
// Yelli — Database Seed Script
//
// Creates the webmaster super-admin account that exists in every
// environment (dev, staging, prod). Idempotent — safe to re-run.
//
// SECURITY:
//   The webmaster plaintext password lives ONLY in CREDENTIALS.md
//   (gitignored). The operator copies it into WEBMASTER_PASSWORD
//   before running `pnpm db:seed`. This script bcrypts it at cost
//   factor 12 and discards the plaintext. The AI agent that wrote
//   this file NEVER reads CREDENTIALS.md (per .claude/rules/security.md).
//
// USAGE:
//   export WEBMASTER_PASSWORD="<paste from CREDENTIALS.md First Admin Account>"
//   # Optional overrides:
//   #   export WEBMASTER_EMAIL="ops@yourdomain.com"
//   #   export APP_SLUG="yelli"
//   pnpm db:seed
//
//   After seeding: unset WEBMASTER_PASSWORD to keep it out of shell history.
// =============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 22;
const APP_SLUG = process.env['APP_SLUG'] ?? 'yelli';
const SYSTEM_ORG_SLUG = 'system';

async function main(): Promise<void> {
  // Use the raw PrismaClient (not the tenant-guarded extension) — seed
  // runs outside any request context and must bootstrap the system
  // organization that is itself the tenant root.
  const prisma = new PrismaClient();

  try {
    const webmasterPassword = process.env['WEBMASTER_PASSWORD'];

    if (!webmasterPassword || webmasterPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        [
          '',
          'Seed aborted: WEBMASTER_PASSWORD is missing or shorter than 22 characters.',
          '',
          'How to fix:',
          '  1. Open CREDENTIALS.md (gitignored) and copy the password from',
          '     the "🔑 First Admin Account" section.',
          '  2. Export it in your shell BEFORE running this script:',
          '       export WEBMASTER_PASSWORD="<paste-here>"',
          '       pnpm db:seed',
          '  3. After the seed succeeds, unset the variable to keep it out of',
          '     shell history:',
          '       unset WEBMASTER_PASSWORD',
          '',
          'NEVER commit the password, paste it into a chat/log, or hardcode',
          'it in this script. CREDENTIALS.md is the single source of truth.',
          '',
        ].join('\n'),
      );
    }

    const webmasterEmail =
      process.env['WEBMASTER_EMAIL'] ?? `webmaster@${APP_SLUG}.local`;

    // ── 1. System Organization (platform-root tenant) ──────────────
    // Every user — including the webmaster — must belong to an
    // organization (tenant root). The "system" org is reserved for
    // platform staff; tenant data lives in customer organizations.
    const systemOrg = await prisma.organization.upsert({
      where: { slug: SYSTEM_ORG_SLUG },
      update: {},
      create: {
        name: 'System',
        slug: SYSTEM_ORG_SLUG,
        plan_tier: 'enterprise',
        subscription_status: 'active',
        billing_email: webmasterEmail,
      },
    });

    // ── 2. Webmaster Account ───────────────────────────────────────
    // bcrypt the plaintext immediately and discard. The plaintext
    // never touches the database or any log line.
    const passwordHash = await bcrypt.hash(webmasterPassword, BCRYPT_COST);

    const webmaster = await prisma.user.upsert({
      where: {
        organization_id_email: {
          organization_id: systemOrg.id,
          email: webmasterEmail,
        },
      },
      update: {
        password_hash: passwordHash,
        is_super_admin: true,
        status: 'active',
        // Bumping security_version invalidates any active sessions
        // for this user — important when rotating the password.
        security_version: { increment: 1 },
      },
      create: {
        organization_id: systemOrg.id,
        email: webmasterEmail,
        password_hash: passwordHash,
        display_name: 'Webmaster',
        role: 'tenant_admin',
        is_super_admin: true,
        status: 'active',
        security_version: 0,
      },
      select: { id: true, email: true, security_version: true },
    });

    // ── 3. Platform Settings singleton ─────────────────────────────
    await prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        recording_storage_quota_gb: 100,
      },
    });

    console.log('✓ Seed complete');
    console.log(`  System organization:  ${systemOrg.slug} (${systemOrg.id})`);
    console.log(`  Webmaster:            ${webmaster.email}`);
    console.log(`  Security version:     ${webmaster.security_version}`);
    console.log('');
    console.log('Next: unset WEBMASTER_PASSWORD to clear shell history.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
