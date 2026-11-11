# syntax=docker/dockerfile:1
# Build from the parent udhyampay directory:
#   docker build -f backend/Dockerfile .
# Or via database/docker-compose.yml:
#   docker compose -f database/docker-compose.yml --profile app up --build

FROM node:22-bookworm-slim AS base
WORKDIR /app/backend
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY database/prisma /app/database/prisma
RUN npx prisma generate --schema=/app/database/prisma/schema.prisma
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --from=build --chown=node:node /app/database/prisma /app/database/prisma
COPY --from=build --chown=node:node /app/backend/src/docs ./src/docs
COPY --chown=node:node backend/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]