# clubs

Dominio de clubes: membresías, roles e invitaciones. No depende de Prisma ni de Nest.

- `src/domain`: reglas puras (slug, `Roster`, invitaciones) y errores de dominio.
- `src/application`: casos de uso y los puertos que implementa la API en `apps/api/src/clubs`.

Tests: `nx test clubs`.
