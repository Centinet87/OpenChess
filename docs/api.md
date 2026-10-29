# API para el front

Referencia de las rutas de la API. Los tipos de cada request y respuesta están en `@openchess/contracts` (`libs/contracts`); aquí va el nombre del tipo en cada ruta.

## Cómo se llama

- **Base:** todas las rutas cuelgan de `/api`. El front las llama en su propio dominio y Next las reenvía a la API (`apps/web/next.config.js`), así que las cookies quedan en el mismo sitio y no hace falta CORS.
- **Club:** las rutas `/club/*` son del club del subdominio desde el que se llaman (`miclub.openchess.app/api/club/...`), y solo para sus miembros. Las demás (`/auth`, `/clubs`, `/accounts`) sirven en cualquier dominio.
- **Sesión:** en cookies `httpOnly`. `oc_at` es el access token (15 min) y `oc_rt` el refresh token (30 días, solo viaja a `/api/auth`). Ante un 401, llama una vez a `POST /auth/refresh` y repite la request. Si el refresh también da 401, la sesión terminó.
- **Formato:** JSON. Las fechas van como texto ISO 8601. Los tiempos del reloj, en milisegundos.

### Errores

| Caso                                                                                                                                       | Cuerpo                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Regla de negocio rota                                                                                                                      | `ApiError`: `{ statusCode, code, message }`. El `message` está en español y se puede mostrar tal cual |
| Datos inválidos (400)                                                                                                                      | `ValidationError`: `message` es una lista de `{ field, message }`                                     |
| Los demás: sin sesión o contraseña incorrecta (401), link de email vencido (400), club o ruta inexistente (404), demasiados intentos (429) | `{ statusCode, message }` con el mensaje en texto, sin `code`                                         |

Los códigos de cada área están en `ClubErrorCode`, `GameErrorCode`, `LinkErrorCode`, `BillingErrorCode` y `AccountErrorCode`.

### Límites

| Qué                                                    | Límite                      |
| ------------------------------------------------------ | --------------------------- |
| Cualquier ruta                                         | 100 por minuto por IP       |
| Login, registro, links por email, cambio de contraseña | 5 por minuto por IP y email |
| Lo que consulta Lichess, Chess.com o FIDE              | 5 por minuto                |
| Descargar los datos o eliminar la cuenta               | 10 por minuto               |
| Asignar FIDE ID (quien gestiona FIDE)                  | 30 por minuto               |
| Mensajes por el WebSocket                              | 30 cada 10 s por conexión   |

## Cuenta y sesión

| Método | Ruta                       | Body                  | Respuesta            | Notas                                                                                                                                               |
| ------ | -------------------------- | --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`           | `RegisterInput`       | `{ ok: true }` (201) | Deja la sesión iniciada y manda el email de verificación                                                                                            |
| POST   | `/auth/login`              | `LoginInput`          | `{ ok: true }`       |                                                                                                                                                     |
| POST   | `/auth/refresh`            | —                     | `{ ok: true }`       | Renueva las dos cookies                                                                                                                             |
| POST   | `/auth/logout`             | —                     | 204                  |                                                                                                                                                     |
| GET    | `/auth/me`                 | —                     | `Profile`            |                                                                                                                                                     |
| PATCH  | `/auth/me`                 | `UpdateProfileInput`  | `Profile`            | Cambia el nombre visible                                                                                                                            |
| POST   | `/auth/change-password`    | `ChangePasswordInput` | 204                  | Pide la actual. Cierra las demás sesiones, deja cookies nuevas y avisa por email                                                                    |
| POST   | `/auth/verification-email` | —                     | 204                  | Reenvía el link de verificación                                                                                                                     |
| POST   | `/auth/verify-email`       | `TokenInput`          | 204                  | El token viene en el link: `/verificar?token=…`                                                                                                     |
| POST   | `/auth/forgot-password`    | `ForgotPasswordInput` | 204                  | Responde igual exista o no la cuenta                                                                                                                |
| POST   | `/auth/reset-password`     | `ResetPasswordInput`  | 204                  | El token viene en el link: `/restablecer?token=…`. Cierra todas las sesiones                                                                        |
| GET    | `/auth/account/export`     | —                     | `AccountExport`      | Se descarga como `openchess-datos.json`                                                                                                             |
| DELETE | `/auth/account`            | `DeleteAccountInput`  | 204                  | Pide la contraseña. 409 con `AccountError` si tiene una partida en curso, es el único dueño de un club con más miembros o tiene un plan Pro vigente |

Los links de los emails apuntan a páginas del front: `PUBLIC_URL/verificar?token=…` y `PUBLIC_URL/restablecer?token=…`. Esas páginas mandan el token a la API.

## Clubes

| Método | Ruta                       | Body                    | Respuesta              | Notas                                                                                                                                       |
| ------ | -------------------------- | ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/clubs`                   | `CreateClubInput`       | `CreatedClub` (201)    | Quien lo crea queda como dueño                                                                                                              |
| GET    | `/clubs/mine`              | —                       | `MyClubView[]`         | Mis clubes y mi rol en cada uno                                                                                                             |
| GET    | `/club/me`                 | —                       | `RoleView`             | Mi rol y mis permisos: para saber qué mostrar                                                                                               |
| GET    | `/club/members`            | —                       | `MemberView[]`         |                                                                                                                                             |
| PATCH  | `/club/members/:userId`    | `RoleIdInput`           | 204                    | `MANAGE_ROLES`. Su rol actual y el nuevo tienen que estar por debajo del mío                                                                |
| DELETE | `/club/members/:userId`    | —                       | 204                    | `REMOVE_MEMBERS`, a alguien por debajo de mi rol. Con mi propio id, salgo del club                                                          |
| POST   | `/club/invitations`        | `RoleIdInput`           | `InvitationView` (201) | `INVITE_MEMBERS`, con un rol por debajo del mío. El front arma el link con el token (vale 7 días). 402 `MEMBER_LIMIT` si el plan está lleno |
| POST   | `/club/invitations/accept` | `AcceptInvitationInput` | `AcceptedInvitation`   | Desde el subdominio del club, con sesión y sin ser miembro                                                                                  |

### Roles

| Método | Ruta                      | Body                | Respuesta        | Notas                                                                           |
| ------ | ------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------- |
| GET    | `/club/roles`             | —                   | `RoleView[]`     | Ordenados de arriba abajo                                                       |
| GET    | `/club/roles/permissions` | —                   | `Permission[]`   | Los que se pueden marcar                                                        |
| POST   | `/club/roles`             | `CreateRoleInput`   | `RoleView` (201) | `MANAGE_ROLES`. Queda al final de la jerarquía y no da permisos que yo no tengo |
| PATCH  | `/club/roles/:roleId`     | `UpdateRoleInput`   | `RoleView`       | `MANAGE_ROLES`, roles por debajo del mío                                        |
| PUT    | `/club/roles/order`       | `ReorderRolesInput` | `RoleView[]`     | Solo un dueño. Todos los roles menos el dueño, de arriba abajo                  |
| DELETE | `/club/roles/:roleId`     | —                   | 204              | `MANAGE_ROLES`. 409 `ROLE_IN_USE` si alguien lo tiene                           |

## Partidas

Los desafíos y la consulta van por HTTP; las jugadas, por WebSocket.

| Método | Ruta                      | Body / query                  | Respuesta        | Notas                                                                                             |
| ------ | ------------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/club/games`             | `ChallengeInput`              | `GameView` (201) | `PLAY_GAMES`, a un miembro que también puede jugar. Máximo 5 desafíos abiertos; vencen a las 24 h |
| GET    | `/club/games`             | `?status=pending,in_progress` | `GameView[]`     | Hasta 50, las más recientes primero. `status` acepta `pending`, `in_progress` y `finished`        |
| GET    | `/club/games/:id`         | —                             | `GameView`       |                                                                                                   |
| POST   | `/club/games/:id/accept`  | —                             | `GameView`       | `PLAY_GAMES`. Lo acepta el desafiado; desde ahí corre el plazo de la primera jugada               |
| POST   | `/club/games/:id/decline` | —                             | `GameView`       | El desafiado lo rechaza o quien desafió lo cancela                                                |

### En vivo (Socket.IO)

- **Conexión:** namespace `GAMES_NAMESPACE` (`/games`) en el origen de la API: ``io(`${API}/games`, { withCredentials: true })``. En desarrollo, `API` es `http://localhost:3333`; en producción, `https://api.openchess.app`, porque los rewrites de Vercel no pasan WebSocket. La sesión viaja en la cookie `oc_at`. Solo se aceptan conexiones desde `APP_DOMAIN` y sus subdominios.
- **Unirse:** `emitWithAck(GAME_EVENTS.join, { club, gameId })` (`JoinMessage`, con `club` = slug del club). Responde `GameAck` con la partida. Pueden unirse los jugadores y los demás miembros, como espectadores.
- **Jugar:** `emitWithAck(GAME_EVENTS.command, msg)` con `CommandMessage`: `{ gameId, action: 'move', from, to, promotion? }`, o `action` igual a `resign`, `abort`, `offerDraw`, `acceptDraw` o `declineDraw`. Responde `GameAck`. Un `ok: false` trae el código y el mensaje (jugada ilegal, no es tu turno, etc.).
- **Cambios:** el servidor emite `GAME_EVENTS.update` (`GameUpdate`: la partida y los eventos de ese cambio) a todos los de la sala, incluido quien jugó.
- **Reloj:** el servidor lleva el tiempo. Para mostrarlo, descuenta desde `serverNow` el tiempo transcurrido en el color de `clock.running`, corrigiendo el desfase con el reloj local. Si las blancas no juegan antes de `firstMoveBy`, la partida se aborta sola.
- **Sesión vencida:** el servidor corta el socket cuando vence el access token. Llama a `POST /auth/refresh`, reconecta y vuelve a unirte a la partida. Al reconectar por cualquier motivo, únete de nuevo: la membresía a la sala no se recuerda.

## Ranking

| Método | Ruta                    | Respuesta        | Notas                            |
| ------ | ----------------------- | ---------------- | -------------------------------- |
| GET    | `/club/ratings`         | `StandingView[]` | Tabla de posiciones (Glicko-2)   |
| GET    | `/club/ratings/:userId` | `ProfileView`    | Rating e historial de un miembro |

## Lichess, Chess.com y FIDE

| Método | Ruta                          | Body / query    | Respuesta                | Notas                                                                                                                    |
| ------ | ----------------------------- | --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/accounts`                   | —               | `OwnLinkedAccountView[]` | Mis cuentas vinculadas                                                                                                   |
| GET    | `/accounts/lichess/connect`   | —               | Redirección              | Se abre navegando (no con `fetch`). Al terminar, vuelve a `PUBLIC_URL/cuenta?vinculada=lichess` o `?error=<código>`      |
| POST   | `/accounts/chesscom`          | `UsernameInput` | `OwnLinkedAccountView`   | Devuelve el código que hay que poner en la ubicación o el nombre del perfil de Chess.com                                 |
| POST   | `/accounts/chesscom/verify`   | —               | `OwnLinkedAccountView`   | Revisa que el código esté en el perfil                                                                                   |
| POST   | `/accounts/:platform/refresh` | —               | `OwnLinkedAccountView`   | Actualiza los ratings                                                                                                    |
| DELETE | `/accounts/:platform`         | —               | 204                      |                                                                                                                          |
| GET    | `/club/accounts/:userId`      | —               | `LinkedAccountView[]`    | Cuentas verificadas de un miembro                                                                                        |
| POST   | `/club/imports`               | `ImportInput`   | `ImportSummary`          | `IMPORT_GAMES`. Trae mis partidas de los últimos 30 días; las de ajedrez estándar entre miembros cuentan para el ranking |
| GET    | `/club/imports`               | `?userId=`      | `ImportedGameView[]`     |                                                                                                                          |
| GET    | `/club/imports/:id`           | —               | `ImportedGameDetail`     | Con el PGN                                                                                                               |
| GET    | `/club/fide`                  | —               | `FideView[]`             |                                                                                                                          |
| GET    | `/club/fide/:userId`          | —               | `FideView`               | 404 si no tiene                                                                                                          |
| PUT    | `/club/fide/:userId`          | `FideIdInput`   | `FideView`               | `MANAGE_FIDE`. Lee la ficha pública de ratings.fide.com                                                                  |
| POST   | `/club/fide/:userId/refresh`  | —               | `FideView`               | Actualiza el Elo                                                                                                         |
| DELETE | `/club/fide/:userId`          | —               | 204                      | `MANAGE_FIDE`                                                                                                            |

## Plan del club

| Método | Ruta                  | Respuesta      | Notas                                                                                                                                                              |
| ------ | --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/club/plan`          | `PlanView`     | Cualquier miembro                                                                                                                                                  |
| POST   | `/club/plan/checkout` | `CheckoutView` | Solo el dueño. Lleva a pagar a Mercado Pago, que vuelve a `/plan` en el subdominio del club. El club pasa a Pro cuando Mercado Pago confirma el pago, no al volver |
| POST   | `/club/plan/cancel`   | 204            | Solo el dueño                                                                                                                                                      |

`POST /billing/mercadopago/webhook` es solo para Mercado Pago.
