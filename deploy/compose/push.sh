#!/bin/bash
# =============================================================
# Yelli — Manual image promotion pipeline
#
# Usage:
#   bash deploy/compose/push.sh dev        # build from source + push :dev-*
#   bash deploy/compose/push.sh staging    # re-tag dev → :staging-* + push
#   bash deploy/compose/push.sh prod       # re-tag staging → :latest / :prod-sha-* + push
#
# Tag flow (Docker Hub bonitobonita24/yelli):
#   :dev-latest         mutable — newest dev build
#   :dev-sha-{hash}     immutable — pinned to git SHA
#   :staging-latest     mutable — Komodo auto-update polls this
#   :staging-sha-{hash} immutable — pinned to git SHA at staging promotion
#   :latest             mutable — production current
#   :prod-sha-{hash}    immutable — pinned to git SHA at prod promotion
#
# Prereqs:
#   - docker login                          (one-time)
#   - clean git working tree                (warns if not)
#   - docker.publish: true in inputs.yml    (enforced)
#
# GitHub Actions also pushes :latest + :staging-latest + :sha-{hash} on every
# merge to main — both push paths share the same Docker Hub repo. Use push.sh
# when you want to promote a dev build that has NOT yet been merged to main.
# =============================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# ----- Config from inputs.yml (parsed via grep — avoids node/yaml dep here) -----
if ! grep -q '^  publish: true' inputs.yml; then
  echo "✗ docker.publish is not true in inputs.yml — aborting." >&2
  exit 1
fi

IMAGE_BASE="bonitobonita24/yelli"
DOCKERFILE="apps/web/Dockerfile"

# ----- Sanity checks -----
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ docker is not installed on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker daemon is not running." >&2
  exit 1
fi
if ! docker info 2>/dev/null | grep -q "Username"; then
  echo "✗ Not logged in to Docker Hub. Run: docker login" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠ Git working tree is not clean. Continue anyway? [y/N]"
  read -r ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

SHORT_SHA="$(git rev-parse --short HEAD)"
TARGET="${1:-}"

case "$TARGET" in
  dev)
    echo "🔨 Building dev image from source ($DOCKERFILE)..."
    docker build \
      --file "$DOCKERFILE" \
      --tag "${IMAGE_BASE}:dev-latest" \
      --tag "${IMAGE_BASE}:dev-sha-${SHORT_SHA}" \
      --platform linux/amd64 \
      .

    echo "📤 Pushing dev tags to Docker Hub..."
    docker push "${IMAGE_BASE}:dev-latest"
    docker push "${IMAGE_BASE}:dev-sha-${SHORT_SHA}"

    echo
    echo "✅ Dev image pushed:"
    echo "   ${IMAGE_BASE}:dev-latest"
    echo "   ${IMAGE_BASE}:dev-sha-${SHORT_SHA}"
    echo
    echo "▶  Next: bash deploy/compose/push.sh staging"
    ;;

  staging)
    echo "🔁 Promoting dev-latest → staging-latest..."
    docker pull "${IMAGE_BASE}:dev-latest"
    docker tag  "${IMAGE_BASE}:dev-latest" "${IMAGE_BASE}:staging-latest"
    docker tag  "${IMAGE_BASE}:dev-latest" "${IMAGE_BASE}:staging-sha-${SHORT_SHA}"
    docker push "${IMAGE_BASE}:staging-latest"
    docker push "${IMAGE_BASE}:staging-sha-${SHORT_SHA}"

    echo
    echo "✅ Staging image pushed:"
    echo "   ${IMAGE_BASE}:staging-latest        (Komodo auto-update polls this)"
    echo "   ${IMAGE_BASE}:staging-sha-${SHORT_SHA}"
    echo
    echo "📋 Staging server should auto-pull within Komodo's poll interval."
    echo "    Manual pull:  docker compose -f deploy/compose/stage/docker-compose.app.yml pull"
    echo
    echo "▶  Next (after staging is verified): bash deploy/compose/push.sh prod"
    ;;

  prod)
    echo "🚀 Promoting staging-latest → :latest..."
    docker pull "${IMAGE_BASE}:staging-latest"
    docker tag  "${IMAGE_BASE}:staging-latest" "${IMAGE_BASE}:latest"
    docker tag  "${IMAGE_BASE}:staging-latest" "${IMAGE_BASE}:prod-sha-${SHORT_SHA}"
    docker push "${IMAGE_BASE}:latest"
    docker push "${IMAGE_BASE}:prod-sha-${SHORT_SHA}"

    echo
    echo "✅ Production image pushed:"
    echo "   ${IMAGE_BASE}:latest                (manual deploy from Komodo UI)"
    echo "   ${IMAGE_BASE}:prod-sha-${SHORT_SHA}"
    echo
    echo "📋 In Komodo UI: Stacks → yelli-prod → Deploy."
    echo "🔄 Rollback: set APP_IMAGE_TAG=prod-sha-{previous-hash} in .env.prod, then Deploy."
    ;;

  ""|*)
    echo "Usage: bash deploy/compose/push.sh [dev|staging|prod]" >&2
    exit 1
    ;;
esac
