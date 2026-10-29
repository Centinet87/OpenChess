# linked-accounts

Cuentas de Lichess y Chess.com de cada usuario, importación de sus partidas a los clubes y Elo FIDE de los miembros. No depende de Prisma, de Nest ni de otras libs de negocio.

- `src/domain/linked-account.ts`: una cuenta queda pendiente hasta que se prueba que es de la persona. Mientras no se verifique, no cuenta para nada.
- `src/domain/external-game.ts`: partida de una plataforma y `countsForRanking`: terminada, ajedrez estándar y entre dos miembros con cuentas verificadas.
- `src/application/ports.ts`: `ChessPlatform` (patrón Strategy) y los repositorios que implementa la API en `apps/api/src/linked-accounts`.

Cómo se verifica cada plataforma:

| Plataforma | Cómo                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| Lichess    | Iniciando sesión allá (OAuth con PKCE). Solo se lee el usuario y el token se revoca      |
| Chess.com  | No tiene OAuth abierto: la persona pone un código en la ubicación o el nombre del perfil |

Una cuenta verificada es de una sola persona (índice único parcial en la base de datos).

El Elo FIDE va aparte (`src/domain/fide.ts`, `src/application/fide.use-cases.ts`): FIDE no tiene login, así que el FIDE ID lo asigna un admin del club y vale solo dentro de ese club. `referenceRating` elige el Elo con que el miembro parte en el ranking del club.

Tests: `nx test linked-accounts`.
