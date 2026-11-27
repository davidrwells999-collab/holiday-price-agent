# syntax=docker/dockerfile:1

FROM node:22.23.5-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:22.23.5-bookworm-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/davidrwells999-collab/holiday-price-agent"
ENV NODE_ENV=production \
    TZ=Europe/London \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
# apt state lives in cache mounts, so it never enters the image layer.
RUN --mount=type=cache,id=apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends tzdata ca-certificates \
    && node node_modules/playwright/cli.js install --with-deps chromium \
    && chmod -R a+rX /ms-playwright
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home app \
    && mkdir -p /app/artifacts \
    && chown app:app /app/artifacts
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER app
CMD ["node", "dist/main.js"]
