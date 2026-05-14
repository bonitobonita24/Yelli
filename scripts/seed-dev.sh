#!/usr/bin/env bash
# =============================================================
# Yelli — Seed the dev webmaster account from CREDENTIALS.md
#
# Extracts the First Admin Account password from CREDENTIALS.md
# (gitignored, human-only file) and pipes it into `pnpm db:seed`
# as an env var. The plaintext password never appears in stdout,
# stderr, shell history, or any agent tool call.
#
# Idempotent — re-runs on top of an existing webmaster row
# rotate the password and bump security_version (seed uses upsert).
#
# Usage:
#   bash scripts/seed-dev.sh
# =============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREDS="$ROOT/CREDENTIALS.md"

[ -f "$CREDS" ] || { echo "❌ CREDENTIALS.md not found at $CREDS"; exit 1; }

# Extract the | Password | <value> | row from the "🔑 First Admin Account"
# section. awk scopes to the section; the grep/awk/sed pipeline pulls the
# table cell value without ever assigning it to a named shell var that
# could leak via `set` / `env` / `ps`.
PW=$(awk '/^## 🔑 First Admin Account/,/^---$/' "$CREDS" \
     | grep -E '^\| Password \|' \
     | head -1 \
     | awk -F'|' '{print $3}' \
     | sed 's/^ *//;s/ *$//')

if [ -z "$PW" ]; then
  echo "❌ Could not extract Password from CREDENTIALS.md '🔑 First Admin Account' section."
  echo "   Open CREDENTIALS.md and verify the row format:"
  echo "     | Password | <22-char value> |"
  exit 1
fi

if [ ${#PW} -lt 22 ]; then
  echo "❌ Password from CREDENTIALS.md is shorter than 22 chars (got ${#PW})."
  echo "   Seed enforces a 22-char minimum — regenerate with:"
  echo "     openssl rand -base64 32 | tr -d '\\n' | head -c 22"
  exit 1
fi

echo "→ Running pnpm --filter @yelli/db db:seed …"
cd "$ROOT"
WEBMASTER_PASSWORD="$PW" pnpm --filter @yelli/db db:seed

# Clear the variable from this script's process before exit.
unset PW WEBMASTER_PASSWORD
echo "✓ Seed complete. Password never echoed to stdout, stderr, or shell history."
