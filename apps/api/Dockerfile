# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

RUN --mount=type=cache,id=fintrack-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder pnpm prisma generate

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

RUN pnpm build

FROM base AS production

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3001

CMD ["node", "dist/src/main"]
