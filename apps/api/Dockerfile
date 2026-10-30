# Imagen de la API. Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t openchess-api .
# Migraciones: docker run --rm -e DATABASE_URL=... -w /app/libs/database openchess-api npx prisma migrate deploy

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
# --ignore-scripts: el script prepare configura los hooks de git y aquí no hay git.
RUN npm ci --ignore-scripts
RUN NODE_ENV=production npx nx run api:build --configuration=production --skip-nx-cache

# Todos los package.json del workspace, sin el resto del código: así una lib nueva
# entra sola, y si ninguno cambia, la instalación de abajo sale de la caché.
FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY . .
RUN find . -type f ! -name package.json ! -name package-lock.json -delete \
  && find . -depth -type d -empty -delete

# Solo las dependencias de producción de la API y sus libs (sin Next ni las herramientas).
# Imagen completa: Prisma elige el motor de migraciones según el OpenSSL que encuentra.
FROM node:24-bookworm AS deps
WORKDIR /app
COPY --from=manifests /app ./
RUN npm ci --omit=dev --workspace @openchess/api --ignore-scripts
# El motor de migraciones de Prisma se descarga en su postinstall.
RUN cd node_modules/@prisma/engines && node scripts/postinstall.js

FROM node:24-bookworm-slim
# Prisma necesita OpenSSL para el motor de migraciones.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Para las migraciones.
COPY libs/database/package.json libs/database/prisma.config.ts libs/database/
COPY libs/database/prisma libs/database/prisma
USER node
EXPOSE 3333
CMD ["node", "apps/api/dist/main.js"]
