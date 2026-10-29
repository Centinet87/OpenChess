# Plan: OpenChess, un SaaS multi-tenant para clubes de ajedrez

**Estado:** aprobado. Fases 0 y 1 hechas; la Fase 2 está hecha en el backend.
**Licencia:** MIT
**Complejidad:** alta en total. La Fase 2 (tiempo real) es la más pesada.

## Qué vamos a construir

- Cada **club o academia** es un tenant con su propio espacio: `miclub.openchess.app`.
- Hay tres roles dentro de cada club: **dueño**, **profesor** y **alumno**.
- Los miembros juegan partidas en vivo entre ellos, con reloj. Cada partida queda guardada en PGN y suma a un ranking interno del club.
- El código es abierto con licencia MIT, y el negocio es la versión hosteada que se paga por club.

## Decisiones técnicas

| Tema                | Decisión                                                                                                                                                            | Por qué                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo            | Nx workspace                                                                                                                                                        | API y front en el mismo repo con tipos compartidos. `enforce-module-boundaries` impide que un módulo importe el interior de otro |
| API                 | NestJS como monolito modular                                                                                                                                        | Microservicios ahora serían puro costo. Cada módulo de Nest es un contexto que se podría separar más adelante                    |
| Front               | Next.js (App Router) + TypeScript, solo front                                                                                                                       | La lógica de negocio vive en la API                                                                                              |
| Arquitectura        | Hexagonal + Rich Domain Model **en los módulos con reglas** (partidas, ranking, membresías). CRUD simple en el resto                                                | Un modelo rico vale la pena donde hay reglas reales. En CRUD solo suma capas sin beneficio                                       |
| BD                  | PostgreSQL + Prisma ORM                                                                                                                                             | Postgres tiene RLS. Prisma define el esquema y las migraciones                                                                   |
| Persistencia        | Repositorios como puertos y adaptadores Prisma con mappers Prisma ↔ dominio                                                                                         | Prisma devuelve objetos planos. Sus tipos no salen de la capa de infraestructura                                                 |
| Aislamiento         | Una BD compartida, columna `club_id` en cada tabla y RLS de Postgres                                                                                                | Es lo más barato de operar. RLS actúa como segunda barrera si al código se le olvida filtrar por club                            |
| Contexto del tenant | El subdominio se resuelve en un middleware de Nest y se guarda con `nestjs-cls` (AsyncLocalStorage). Una extensión de Prisma fija `app.club_id` en cada transacción | Así ningún repositorio tiene que recibir el club a mano                                                                          |
| Contraseñas         | **argon2id** (o bcrypt)                                                                                                                                             | Son hashes lentos a propósito. **Nunca SHA-256 para contraseñas**: es rápido y una GPU lo rompe en horas si se filtra la BD      |
| Sesión              | JWT de acceso corto (~15 min) + refresh token que rota en cada uso. Los dos en cookies `httpOnly`                                                                   | El refresh guardado en BD permite revocar sesiones                                                                               |
| Tokens aleatorios   | Verificación de email, recuperar contraseña, refresh tokens y API keys se guardan como **SHA-256**, nunca en claro                                                  | Tienen mucha entropía, así que un hash rápido basta. Va así desde el día uno                                                     |
| Autorización        | El JWT solo lleva el `user_id`. El club sale del subdominio y el rol se consulta en `memberships`                                                                   | Si el rol va en el token, un miembro expulsado sigue entrando hasta que el token vence                                           |
| Ajedrez             | `chess.js` para validar jugadas y `chessground` para el tablero                                                                                                     | Son librerías probadas. No hay que programar las reglas a mano                                                                   |
| Tiempo real         | Gateway de WebSocket de Nest (`@nestjs/websockets` + Socket.IO) dentro del monolito                                                                                 | Una sola app que desplegar. Si crece, se separa y se agrega Redis pub/sub                                                        |
| Ranking             | Glicko-2 con la librería `glicko2`                                                                                                                                  | Es el estándar online y funciona bien con pocas partidas                                                                         |
| Hosting             | Vercel para el front, Fly.io o Railway para la API, Neon o Supabase para Postgres                                                                                   | Todo tiene plan gratis para el MVP. La API necesita un servidor persistente por los WebSockets                                   |
| Cobros              | Stripe, o Mercado Pago/Flow si los clientes son de Chile. Va después del MVP                                                                                        | Primero hay que validar que los clubes lo usen                                                                                   |

## Estructura del workspace

```text
apps/
  api/                 NestJS: arranque, módulos y gateway de WebSocket
  web/                 Next.js
libs/
  shared/kernel/       Value objects y errores de dominio comunes (ClubId, UserId, Result)
  shared/contracts/    DTOs y eventos que comparten api y web
  (identity vive por ahora en apps/api/src/identity: solo la usa la API)
  clubs/               Clubes, membresías, invitaciones (dominio rico: reglas de roles)
  games/               Partidas, reloj, jugadas (dominio rico)
  ratings/             Glicko-2 y tabla de posiciones (dominio rico)
  database/            Esquema Prisma, migraciones, extensión de RLS
```

Cada lib con dominio rico se divide en `domain/` (entidades y puertos, sin dependencias de Nest ni Prisma), `application/` (casos de uso) e `infrastructure/` (adaptadores Prisma, controladores, gateways).

## Patrones que calzan solos

Se usan donde el problema los pide, no como meta:

- **State**: el ciclo de vida de una partida (esperando, en juego, terminada, abandonada).
- **Strategy**: controles de tiempo (Fischer, Bronstein), sistema de ranking y, más adelante, emparejamiento de torneos (suizo, round-robin).
- **Observer / eventos de dominio**: al terminar una partida se actualiza el ranking y se notifica, sin que `games` conozca a `ratings`.
- **Factory**: crear una partida con su control de tiempo validado.
- **Repository y Adapter**: los da la arquitectura hexagonal.

## Fases

### Fase 0: Esqueleto (baja)

- Workspace Nx con `apps/api` (Nest), `apps/web` (Next) y `libs/database` (Prisma). Postgres en Docker para desarrollo.
- Reglas de `enforce-module-boundaries` desde el primer commit.
- Archivos `LICENSE` (MIT), `README`, `CONTRIBUTING` y `.env.example`.
- CI en GitHub Actions en cada PR: formato, lint, typecheck, tests, tests contra Postgres (`test-db`) y build de lo afectado. Para pushear cambios del workflow, la cuenta Centinet87 necesita el permiso `workflow` (`gh auth refresh -s workflow`).

### Fase 1: Tenants y cuentas (media, la parte crítica) — hecha, salvo verificación de email y recuperación de contraseña

- Tablas `clubs`, `users`, `memberships` (con el rol), `invitations` y `refresh_tokens`.
- Contexto del tenant con `nestjs-cls` y la extensión de Prisma que fija `app.club_id`.
- Políticas RLS en todas las tablas con `club_id`.
- Registro, login, refresh y logout con argon2id y JWT. Verificación de email y recuperación de contraseña con tokens hasheados en SHA-256.
- Crear un club, invitar alumnos por link y gestionar roles. Guards de Nest que consultan el rol en `memberships`.
- **Test obligatorio:** un usuario del club A no puede leer ni escribir nada del club B, ni siquiera con una consulta sin filtro. Aplica a las tablas con `club_id` (`memberships`, `invitations`, `games`). `users`, `clubs` y `refresh_tokens` son globales: no tienen RLS y solo se leen desde `identity` y los guards, nunca devueltas tal cual a otro club.

### Fase 2: Jugar (alta) — hecha en el backend; falta el tablero en el front

- Entidad `Game` con estados (patrón State) y controles de tiempo (patrón Strategy).
- Desafiar a un miembro del club, con control de tiempo (blitz/rápida).
- El gateway valida cada jugada con chess.js. **El servidor manda**: el cliente nunca decide si una jugada es legal ni cuánto reloj queda.
- Manejo de reconexión, abandono por tiempo, tablas y rendición.
- Al terminar, se guarda el PGN y se emite el evento `GameFinished`.

### Fase 3: Ranking e historial (baja)

- `ratings` escucha `GameFinished` y recalcula Glicko-2 por club.
- Tabla de posiciones y perfil de cada jugador con sus partidas.
- Visor de partidas para revisarlas jugada a jugada.

### Fase 4: Lanzamiento (media)

- Página pública, términos de uso y política de privacidad.
- Plan gratis con límite de miembros y plan pagado. Aquí entra el cobro.

### Fuera del MVP

Torneos suizos o round-robin, análisis con Stockfish (WASM), puzzles, tareas de profesor a alumno, app móvil y dominios personalizados.

## Riesgos

| Riesgo                                                           | Nivel          | Mitigación                                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datos de un club que se filtran a otro                           | Alto           | RLS además del filtro en el código, y el test de aislamiento que bloquea el CI si falla                                                                                            |
| Alumnos menores de edad (las academias tienen niños)             | Alto           | Pedir el mínimo de datos y el consentimiento del apoderado. En Chile aplica la Ley 21.719 de datos personales. Antes de cobrar, revisar los términos con alguien que sepa del tema |
| Sobrearquitectura: hexagonal y patrones en todo frenan el avance | Medio          | Dominio rico solo en `clubs`, `games` y `ratings`. Un patrón entra cuando hay al menos dos variantes reales                                                                        |
| Mappers Prisma ↔ dominio que se desincronizan del esquema        | Medio          | Un test por repositorio que guarda y recupera una entidad completa                                                                                                                 |
| Con MIT, alguien puede montar un SaaS cerrado con este código    | Medio          | Está bien si el valor está en el servicio hosteado. Cambiar a AGPL es más fácil mientras no haya contribuidores externos                                                           |
| El gateway de WebSocket no escala a muchas partidas              | Medio          | Para el MVP basta una instancia. Si crece, se separa del monolito y se agrega Redis pub/sub                                                                                        |
| Trampas con un motor de ajedrez                                  | Bajo en el MVP | Las partidas son internas del club y el profesor conoce a los alumnos. Se revisa más adelante                                                                                      |

## Pendientes del QA (2026-10-29)

| Sev.  | Pendiente                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Medio | Carrera en `changeRole`/`removeMember`: dos OWNER que se bajan a la vez dejan el club sin dueño. Necesita transacción con `SELECT … FOR UPDATE` |
| Medio | Dos pestañas que refrescan a la vez cierran la sesión. Agregar unos segundos de gracia al token recién rotado                                   |
| Medio | `withTenantContext` hace 3 sentencias por consulta. Fijar el contexto una vez por transacción cuando haya transacciones por request             |
| Bajo  | Mapear P2002 a `ALREADY_MEMBER` al aceptar una invitación                                                                                       |
| Bajo  | Job que borre refresh tokens vencidos                                                                                                           |
| Bajo  | Tests del rate limit, de `X-Forwarded-Host` y de las carreras                                                                                   |

## Pendientes de la Fase 2

| Sev.  | Pendiente                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medio | Los timers del reloj viven en memoria: con varias instancias de la API hay que pasarlos a una cola (BullMQ + Redis). Si el proceso se reinicia, la partida igual se cierra en la próxima jugada o al unirse alguien |
| Medio | Si las blancas nunca hacen la primera jugada, la partida queda abierta. Abortarla sola a los 30 s                                                                                                                   |
| Medio | El WebSocket no tiene rate limit por mensaje                                                                                                                                                                        |
| Bajo  | Los miembros del club pueden unirse como espectadores; falta decidir si se ocultan las ofertas de tablas                                                                                                            |
| Bajo  | El front: tablero con chessground, reloj local corregido con `serverNow` y reconexión                                                                                                                               |
