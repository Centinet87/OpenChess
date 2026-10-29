# Cómo contribuir

1. Crea una rama desde `desa`: `feat/<algo>`, `fix/<algo>` o `docs/<algo>`.
2. `npm install` activa un hook `pre-push` que corre `npm run check` (formato, lint, typecheck, test, test-db y build de lo que cambió). Como test-db usa la BD local, Docker tiene que estar arriba al hacer push. Si falla, el push no sale. El CI de GitHub solo corre a mano.

3. Usa mensajes de commit con el formato `<tipo>: <descripción>`. Los tipos son `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf` y `ci`.

## Reglas de arquitectura

- Cada proyecto tiene tags `scope:*` y `type:*`. ESLint (`@nx/enforce-module-boundaries`) bloquea las dependencias no permitidas. Por ejemplo, `apps/web` no puede importar `libs/database`.
- Un módulo de negocio no importa a otro. Se comunican por eventos de dominio.
- Los tipos de Prisma no salen de la capa de infraestructura.
- Cualquier tabla con datos de un club lleva `club_id` y una política RLS.

## Seguridad

Si encuentras una vulnerabilidad, no abras un issue público. Escríbele a quienes mantienen el repo por un canal privado.
