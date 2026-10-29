# games

Dominio de partidas: reglas con chess.js, reloj y controles de tiempo. No depende de Prisma ni de Nest.

- `src/domain`: `Game` (patrón State), reloj y controles de tiempo (patrón Strategy).
- `src/application`: casos de uso y los puertos que implementa la API en `apps/api/src/games`.

Tests: `nx test games`.
