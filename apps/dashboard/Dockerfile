# syntax=docker/dockerfile:1
#
# Dashboard (Next.js) container for Railway.
# Build context MUST be the repo root — pnpm workspace.
#
#   docker build -f apps/dashboard/Dockerfile -t distribuidor-dashboard .
#
# NEXT_PUBLIC_API_URL is baked in at BUILD time by Next. Each Railway
# environment must set it as a service variable; Railway forwards it to the
# build as a --build-arg, picked up by the ARG below. Changing it requires a
# redeploy (rebuild), not just a restart.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---------- build ----------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @distribuidor/shared run build \
 && pnpm --filter dashboard run build

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
WORKDIR /app/apps/dashboard
EXPOSE 3000
CMD ["pnpm", "run", "start"]
