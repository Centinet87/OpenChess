# OpenChess

Plataforma open source para clubes y academias de ajedrez. Cada club tiene su espacio, sus alumnos, sus partidas en vivo y su ranking interno.

El plan completo está en [PLAN.md](PLAN.md).

## Estructura

```text
apps/api        API en NestJS (monolito modular)
apps/web        Front en Next.js
libs/database   Esquema Prisma y cliente de base de datos
```

## Requisitos

- Node.js 24
- Docker (para Postgres local)

## Levantar el proyecto

```bash
npm install
cp .env.example .env
```

En `.env`, pon un `JWT_SECRET` de al menos 32 caracteres. Para generar uno:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Después levanta Postgres, aplica las migraciones, genera el cliente Prisma y arranca la API y el front:

```bash
docker compose up -d
npx nx run database:migrate-deploy
npx nx run database:generate
npx nx run-many -t serve dev -p api web
```

- Front: http://localhost:3000
- API: http://localhost:3333/api (el front la expone en `/api` mediante un rewrite)

## Comandos útiles

| Comando                        | Qué hace                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx nx run database:generate` | Genera el cliente Prisma                                                                                                                    |
| `npx nx run database:migrate`  | Crea y aplica una migración en la BD local                                                                                                  |
| `npx nx run database:test-db`  | Tests de aislamiento entre clubes (RLS) contra el Postgres local. Necesita Docker arriba                                                    |
| `npx nx run api:test-db`       | Tests de la API contra el Postgres local (auth, clubes, partidas, ranking, cuentas). Necesita Docker arriba                                 |
| `npm run check`                | Formato, lint, typecheck, test, test-db y build de lo que cambió respecto a `origin/desa`. Corre antes de cada push. Necesita Docker arriba |
| `npx nx graph`                 | Muestra cómo dependen los proyectos entre sí                                                                                                |

## Despliegue

El front va a Vercel y la API a Fly.io en Docker, cada uno por su lado. Ver [docs/despliegue.md](docs/despliegue.md).

## Licencia

[MIT](LICENSE)
