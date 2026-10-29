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
docker compose up -d
npx nx run-many -t serve dev -p api web
```

- Front: http://localhost:3000
- API: http://localhost:3333/api (el front la expone en `/api` mediante un rewrite)

## Comandos útiles

| Comando                        | Qué hace                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npx nx run database:generate` | Genera el cliente Prisma                                                                                        |
| `npx nx run database:migrate`  | Crea y aplica una migración en la BD local                                                                      |
| `npm run check`                | Formato, lint, typecheck, test y build de lo que cambió respecto a `origin/desa`. Corre solo antes de cada push |
| `npx nx graph`                 | Muestra cómo dependen los proyectos entre sí                                                                    |

## Licencia

[MIT](LICENSE)
