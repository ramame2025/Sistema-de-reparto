# syntax=docker/dockerfile:1
#
# API (NestJS + Prisma) container for Railway.
# Build context MUST be the repo root — this is a pnpm workspace and the build
# needs the root lockfile plus packages/shared.
#
#   docker build -f apps/api/Dockerfile -t distribuidor-api .

FROM node:22-slim AS base
# Prisma's query engine needs openssl at runtime on Debian slim.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---------- build ----------
FROM base AS build
# Manifests first so `pnpm install` is cached until a dependency changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @distribuidor/shared run build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api run build

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4000
# The whole built workspace, node_modules included. Bigger image, zero surprises
# with pnpm's symlinked store and the generated Prisma client. Trim later if the
# image size ever actually bites.
COPY --from=build /app ./
WORKDIR /app/apps/api
EXPOSE 4000
# Migrations run from railway.json's preDeployCommand, not here.
CMD ["node", "dist/main"]
