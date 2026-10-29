# contracts

Lo que comparten la API y el front: los esquemas de validación (zod) de cada request, la forma de cada respuesta, el protocolo del WebSocket de partidas y los códigos de error. No depende de Nest, de Prisma ni de las libs de negocio.

Todo está en `src/index.ts`, por secciones: errores, cuenta y sesión, clubes, partidas (por HTTP y en vivo: `GAMES_NAMESPACE`, `GAME_EVENTS`, `GameAck`, `GameUpdate`), ranking, Lichess/Chess.com/FIDE y planes. Va en un solo archivo a propósito: Turbopack no resuelve las importaciones relativas con `.js` que usan las demás libs, y así el front no necesita configuración extra.

La API anota sus respuestas con estos tipos, así que si una se aparta del contrato, no compila. El detalle de cada ruta está en [docs/api.md](../../docs/api.md).

## Desde el front

```ts
import type { GameView, GameUpdate } from '@openchess/contracts';
import {
  GAME_EVENTS,
  GAMES_NAMESPACE,
  registerSchema,
} from '@openchess/contracts';
```

Agrega `"@openchess/contracts": "^0.0.1"` a las dependencias de `apps/web` y corre `npm install` y `nx sync`. Funciona con `import type` y también con los valores (esquemas y constantes), sin tocar `next.config.js`.

Tests: `nx test contracts`.
