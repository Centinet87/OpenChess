# ratings

Ranking Glicko-2 por club. No depende de Prisma, de Nest ni de `libs/games`: la API le pasa cada partida terminada (evento `GameFinished`).

- `src/domain/glicko2.ts`: el algoritmo, según el paper de Glickman. El test reproduce su ejemplo.
- `src/domain/rating-system.ts`: `RatingSystem` (patrón Strategy) y `Glicko2System`. Cada partida es su propio período de rating.
- `src/domain/player-rating.ts`: rating de un jugador en un club, con victorias, tablas y derrotas.
- `src/application`: casos de uso y el puerto que implementa la API en `apps/api/src/ratings`.

Tests: `nx test ratings`.
