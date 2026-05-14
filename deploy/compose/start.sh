#!/bin/bash
# =============================================================
# Yelli — Convenience compose starter
#
# Usage:
#   bash deploy/compose/start.sh <env> <docker-compose-args...>
#
# Examples:
#   bash deploy/compose/start.sh dev up -d
#   bash deploy/compose/start.sh dev down
#   bash deploy/compose/start.sh dev down --volumes
#   bash deploy/compose/start.sh dev logs -f livekit
#   bash deploy/compose/start.sh staging up -d
#   bash deploy/compose/start.sh prod up -d
#
# What it does (per env):
#   1. Loads ENV vars from .env.<env> at project root.
#   2. Starts docker-compose.db.yml first (creates the shared network).
#   3. Starts cache, storage, pgadmin in parallel.
#   4. Starts media (LiveKit + Egress + Coturn) — depends on cache + storage.
#   5. Dev only: starts infra (MailHog).
#   6. Starts app service.
#      - dev: rebuilds image from source (--build flag on `up`).
#      - staging/prod: pulls pre-built image from Docker Hub (NO build).
# =============================================================

set -euo pipefail

ENV="${1:-dev}"
shift || true
CMD="$*"

case "$ENV" in
  dev|staging|prod) ;;
  *)
    echo "Usage: bash deploy/compose/start.sh [dev|staging|prod] <docker-compose-args>" >&2
    exit 1
    ;;
esac

if [ -z "$CMD" ]; then
  echo "Usage: bash deploy/compose/start.sh $ENV <docker-compose-args>" >&2
  echo "Example: bash deploy/compose/start.sh $ENV up -d" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.$ENV"
BASE="$PROJECT_ROOT/deploy/compose/$ENV"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ Missing $ENV_FILE — run Phase 3 to regenerate or fill from .env.example" >&2
  exit 1
fi

# Required compose files per env. MailHog only in dev.
COMPOSE_FILES=(
  "$BASE/docker-compose.db.yml"
  "$BASE/docker-compose.cache.yml"
  "$BASE/docker-compose.storage.yml"
  "$BASE/docker-compose.pgadmin.yml"
  "$BASE/docker-compose.media.yml"
)
if [ "$ENV" = "dev" ]; then
  COMPOSE_FILES+=("$BASE/docker-compose.infra.yml")
fi
COMPOSE_FILES+=("$BASE/docker-compose.app.yml")

# Build the -f arg list.
F_ARGS=()
for f in "${COMPOSE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "✗ Missing compose file: $f" >&2
    exit 1
  fi
  F_ARGS+=(-f "$f")
done

# Dev `up` adds --build so the app image rebuilds from source every time
# (decision: docker.dev_build = true in inputs.yml).
EXTRA_ARGS=()
if [ "$ENV" = "dev" ] && [[ "$CMD" == up* ]]; then
  EXTRA_ARGS=(--build)
fi

cd "$PROJECT_ROOT"
set -x
docker compose --env-file "$ENV_FILE" "${F_ARGS[@]}" $CMD "${EXTRA_ARGS[@]}"
