# database

Esquema Prisma, migraciones y cliente de base de datos de la API.

- `prisma/schema.prisma`: modelos. Toda tabla con datos de un club lleva `club_id` y una política RLS.
- `prisma/migrations`: migraciones SQL, incluidas las políticas RLS y el rol `app_user`.
- `src/lib/database.ts`: `createPrismaClient`.
- `src/lib/tenant.ts`: `withTenantContext`, que fija el club y el usuario de cada consulta para que actúe RLS.

## Comandos

| Comando                          | Qué hace                                                   |
| -------------------------------- | ---------------------------------------------------------- |
| `nx run database:generate`       | Genera el cliente en `src/generated` (no se versiona)      |
| `nx run database:migrate`        | Crea y aplica migraciones en desarrollo                    |
| `nx run database:migrate-deploy` | Aplica las migraciones pendientes, sin crear nuevas        |
| `nx test database`               | Tests unitarios                                            |
| `nx run database:test-db`        | Tests de aislamiento entre clubes contra el Postgres local |
