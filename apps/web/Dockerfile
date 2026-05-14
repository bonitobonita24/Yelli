# =============================================================
# Yelli web — multi-stage build for production image.
# Build context = monorepo root (not apps/web).
# Build command (from project root):
#   docker build -f apps/web/Dockerfile -t bonitobonita24/yelli:dev-latest .
# =============================================================

# ----- Stage 1: deps — install all workspace dependencies -----
FROM node:22-alpine AS deps
WORKDIR /repo
RUN apk add --no-cache libc6-compat openssl && \
    npm install -g pnpm@10.0.0

# Copy package manifests first to leverage Docker cache when only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/db/package.json ./packages/db/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/storage/package.json ./packages/storage/
COPY packages/ui/package.json ./packages/ui/
COPY tools/package.json ./tools/

RUN pnpm install --frozen-lockfile

# ----- Stage 2: builder — generate Prisma client and build the web app -----
FROM node:22-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat openssl && \
    npm install -g pnpm@10.0.0

# Bring deps and full source.
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Prisma client must be generated before Next.js build (compiled into bundle).
RUN pnpm --filter @yelli/db prisma generate

# Build the web app and its transitive workspace deps via Turborepo.
RUN pnpm --filter @yelli/web... build

# ----- Stage 3: runner — minimal production image (Next.js standalone) -----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user (CIS hardening — never run Node as root in production).
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy the Next.js standalone server (includes only required node_modules).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# next.config.ts output: standalone produces a server.js entrypoint.
CMD ["node", "apps/web/server.js"]
