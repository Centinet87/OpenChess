# clubs

Dominio de clubes: membresías, roles e invitaciones. No depende de Prisma ni de Nest.

- `src/domain`: reglas puras (slug, `Roster`, invitaciones) y errores de dominio.
- `src/domain/role.ts` y `role-book.ts`: roles de cada club con permisos, orden y color. Como en Discord, solo se tocan los roles por debajo del propio y nadie da un permiso que no tiene. El rol dueño tiene todos los permisos y el club nunca se queda sin uno.
- `src/application`: casos de uso y los puertos que implementa la API en `apps/api/src/clubs`.

Tests: `nx test clubs`.
