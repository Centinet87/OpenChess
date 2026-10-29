/**
 * Contratos entre la API y el front: esquemas de cada request, forma de cada
 * respuesta, protocolo del WebSocket de partidas y códigos de error.
 *
 * Va en un solo archivo a propósito: sin importaciones relativas, el front
 * (Next con Turbopack) lo compila tal cual, sin configuración extra.
 */
import { z } from 'zod';

// ----------------------------------------------------------------------
// Errores
// ----------------------------------------------------------------------

// Códigos de error que puede recibir el cliente. Cada uno trae además un
// `message` en español para mostrar tal cual.

export type ClubErrorCode =
  | 'INVALID_SLUG'
  | 'INVALID_NAME'
  | 'SLUG_TAKEN'
  | 'FORBIDDEN'
  | 'MEMBER_NOT_FOUND'
  | 'LAST_OWNER'
  | 'ALREADY_MEMBER'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_USED'
  | 'ROLE_NOT_FOUND'
  | 'INVALID_ROLE'
  | 'ROLE_IN_USE'
  | 'MEMBER_LIMIT';

export type GameErrorCode =
  | 'INVALID_TIME_CONTROL'
  | 'GAME_NOT_FOUND'
  | 'OPPONENT_NOT_MEMBER'
  | 'CONFLICT'
  | 'SAME_PLAYER'
  | 'NOT_A_PLAYER'
  | 'NOT_STARTED'
  | 'ALREADY_STARTED'
  | 'CANNOT_ACCEPT_OWN'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'GAME_OVER'
  | 'CANNOT_ABORT'
  | 'NO_DRAW_OFFER'
  | 'CHALLENGE_EXPIRED'
  | 'TOO_MANY_CHALLENGES';

export type LinkErrorCode =
  | 'INVALID_USERNAME'
  | 'ACCOUNT_NOT_FOUND'
  | 'ALREADY_LINKED'
  | 'NOT_PENDING'
  | 'CODE_NOT_FOUND'
  | 'NOT_LINKED'
  | 'PLATFORM_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'NOT_MEMBER'
  | 'INVALID_FIDE_ID';

export type BillingErrorCode =
  'FORBIDDEN' | 'ALREADY_SUBSCRIBED' | 'NOT_SUBSCRIBED' | 'BILLING_UNAVAILABLE';

/** Al eliminar la cuenta (DELETE /auth/account). */
export type AccountErrorCode =
  'GAME_IN_PROGRESS' | 'LAST_OWNER' | 'SUBSCRIPTION_ACTIVE';

/** Solo por el WebSocket de partidas, además de los de GameErrorCode. */
export type SocketErrorCode =
  'UNAUTHORIZED' | 'RATE_LIMITED' | 'BAD_REQUEST' | 'INTERNAL';

export type ErrorCode =
  | ClubErrorCode
  | GameErrorCode
  | LinkErrorCode
  | BillingErrorCode
  | AccountErrorCode;

/**
 * Error con código: reglas de negocio rotas (400, 403, 404, 409, 410, 422, 429,
 * 502, 503). Los demás errores HTTP (401 sin sesión, 404 de ruta, 429 del
 * límite de intentos) llegan como los arma Nest: `{ statusCode, message }`.
 */
export interface ApiError<C extends string = ErrorCode> {
  statusCode?: number;
  code: C;
  message: string;
}

/** 400 por datos que no pasan la validación: un mensaje por campo. */
export interface ValidationError {
  statusCode: 400;
  error: string;
  message: { field: string; message: string }[];
}

/** Un club que impide eliminar la cuenta (con LAST_OWNER o SUBSCRIPTION_ACTIVE). */
export interface ClubRef {
  slug: string;
  name: string;
}

export interface AccountError extends ApiError<AccountErrorCode> {
  clubs?: ClubRef[];
}

// ----------------------------------------------------------------------
// Cuenta y sesión
// ----------------------------------------------------------------------

// 254 es el largo máximo de una dirección de email (RFC 5321).
const email = z
  .string()
  .max(254)
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Email inválido' }));

// Máximo de 128 para que nadie mande megas a argon2.
export const password = z.string().min(10, 'Mínimo 10 caracteres').max(128);

const displayName = z.string().trim().min(1).max(60);

/** POST /auth/register */
export const registerSchema = z.object({ email, password, displayName });

/** POST /auth/login */
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

const token = z.string().min(10).max(200);

/** POST /auth/verify-email (el token viene en el link del email) */
export const tokenSchema = z.object({ token });
/** POST /auth/forgot-password */
export const forgotPasswordSchema = z.object({ email });
/** POST /auth/reset-password */
export const resetPasswordSchema = z.object({ token, password });
/** DELETE /auth/account */
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});
/** PATCH /auth/me */
export const updateProfileSchema = z.object({ displayName });
/** POST /auth/change-password */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** GET y PATCH /auth/me */
export interface Profile {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

/** GET /auth/account/export: todos los datos de la persona (acceso y portabilidad). */
export interface AccountExport {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  linkedAccounts: {
    platform: string;
    username: string;
    displayName: string;
    verifiedAt: string | null;
    ratings: unknown;
  }[];
  clubs: {
    club: { slug: string; name: string };
    role: string;
    joinedAt: string;
    rating: {
      rating: number;
      deviation: number;
      games: number;
      wins: number;
      draws: number;
      losses: number;
    } | null;
    ratingHistory: {
      gameId: string;
      opponent: string;
      score: number;
      ratingBefore: number;
      ratingAfter: number;
      at: string;
    }[];
    fide: {
      fideId: string;
      name: string;
      federation: string | null;
      title: string | null;
      ratings: unknown;
    } | null;
    games: {
      id: string;
      color: 'white' | 'black';
      opponent: string;
      status: string;
      result: string | null;
      termination: string | null;
      timeControl: { kind: string; initialMs: number; incrementMs: number };
      pgn: string;
      playedAt: string;
    }[];
    importedGames: {
      platform: string;
      url: string;
      white: string;
      black: string;
      result: string | null;
      speed: string;
      pgn: string;
      playedAt: string;
    }[];
  }[];
}

// ----------------------------------------------------------------------
// Clubes, miembros, roles e invitaciones
// ----------------------------------------------------------------------

// El formato fino del slug, del nombre y de los roles lo valida la API (libs/clubs).

/** POST /clubs */
export const createClubSchema = z.object({
  slug: z.string().max(64),
  name: z.string().max(200),
});

/** POST /club/invitations y PATCH /club/members/:userId */
export const roleIdSchema = z.object({ roleId: z.uuid() });

/** POST /club/invitations/accept */
export const acceptInvitationSchema = z.object({
  token: z.string().min(10).max(200),
});

const roleFields = {
  name: z.string().max(100),
  color: z.string().max(20).nullable().optional(),
  permissions: z.array(z.string().max(40)).max(20),
};
/** POST /club/roles */
export const createRoleSchema = z.object(roleFields);
/** PATCH /club/roles/:roleId */
export const updateRoleSchema = z.object(roleFields).partial();
/** PUT /club/roles/order: de arriba abajo, sin el rol dueño. */
export const reorderRolesSchema = z.object({
  roleIds: z.array(z.uuid()).max(100),
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type RoleIdInput = z.infer<typeof roleIdSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ReorderRolesInput = z.infer<typeof reorderRolesSchema>;

/** La lista completa sale de GET /club/roles/permissions. */
export type Permission =
  | 'MANAGE_ROLES'
  | 'INVITE_MEMBERS'
  | 'REMOVE_MEMBERS'
  | 'MANAGE_FIDE'
  | 'PLAY_GAMES'
  | 'IMPORT_GAMES';

export interface RoleSummary {
  readonly id: string;
  readonly name: string;
  /** Color para mostrar el rol, p. ej. "#2c3e50". */
  readonly color: string | null;
  /** 0 es el más alto de la jerarquía. */
  readonly position: number;
  /** Rol dueño: tiene todos los permisos y no se borra. */
  readonly isOwner: boolean;
}

/** GET /club/roles, GET /club/me (mi rol y mis permisos). */
export interface RoleView extends RoleSummary {
  readonly clubId: string;
  readonly permissions: readonly Permission[];
}

/** POST /clubs */
export interface CreatedClub {
  readonly id: string;
  readonly slug: string;
}

/** GET /clubs/mine */
export interface MyClubView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: RoleSummary;
}

/** GET /club/members */
export interface MemberView {
  readonly userId: string;
  readonly displayName: string;
  readonly role: RoleSummary;
}

/** POST /club/invitations. El front arma el link de invitación con el token; vale 7 días. */
export interface InvitationView {
  readonly token: string;
  readonly expiresAt: string;
}

/** POST /club/invitations/accept */
export interface AcceptedInvitation {
  readonly role: RoleSummary;
}

// ----------------------------------------------------------------------
// Partidas
// ----------------------------------------------------------------------

export type Color = 'white' | 'black';
export type GameStatus = 'pending' | 'in_progress' | 'finished';
export type Result = '1-0' | '0-1' | '1/2-1/2';
export type Termination =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'repetition'
  | 'fifty_moves'
  | 'insufficient_material'
  | 'agreement'
  | 'aborted'
  | 'declined';
/** Fischer suma el incremento entero; Bronstein devuelve hasta el incremento. */
export type TimeControlKind = 'fischer' | 'bronstein';

/**
 * POST /club/games: desafiar a un miembro. `timeControl` es "minutos+incremento",
 * p. ej. "5+3" (de 1 a 180 minutos y de 0 a 60 s de incremento).
 */
export const challengeSchema = z.object({
  opponentId: z.uuid(),
  // El rango fino lo valida la API (parseTimeControl).
  timeControl: z.string().max(10),
  color: z.enum(['white', 'black', 'random']).default('random'),
});

/** GET /club/games?status=pending,in_progress (por defecto) */
export const listGamesSchema = z.object({
  status: z
    .string()
    .default('pending,in_progress')
    .transform((s) => s.split(','))
    .pipe(
      z
        .array(z.enum(['pending', 'in_progress', 'finished']))
        .min(1)
        .max(3),
    ),
});

export type ChallengeInput = z.infer<typeof challengeSchema>;

/** Una partida tal como la ve el cliente. Los tiempos ya vienen descontados. */
export interface GameView {
  readonly id: string;
  readonly status: GameStatus;
  readonly whiteId: string;
  readonly blackId: string;
  /** Quién creó el desafío; el otro es quien lo acepta o rechaza. */
  readonly challengerId: string;
  readonly timeControl: {
    readonly kind: TimeControlKind;
    readonly initialMs: number;
    readonly incrementMs: number;
  };
  readonly fen: string;
  readonly pgn: string;
  readonly clock: {
    readonly whiteMs: number;
    readonly blackMs: number;
    /** Color cuyo reloj corre, o null si está detenido. */
    readonly running: Color | null;
  };
  /**
   * Hasta cuándo (epoch ms del servidor) tienen las blancas para la primera
   * jugada; si no juegan, la partida se aborta sola. null si no aplica.
   */
  readonly firstMoveBy: number | null;
  readonly drawOfferBy: Color | null;
  /** null en una partida en curso, abortada o rechazada. */
  readonly result: Result | null;
  readonly termination: Termination | null;
  /** Hora del servidor (epoch ms): para corregir el desfase con el reloj local. */
  readonly serverNow: number;
}

/** Lo que pasó en un cambio de la partida, para animar o avisar. */
export type GameEventView =
  | { readonly type: 'GameStarted'; readonly gameId: string }
  | {
      readonly type: 'MoveMade';
      readonly gameId: string;
      readonly san: string;
      readonly fen: string;
      readonly whiteMs: number;
      readonly blackMs: number;
    }
  | {
      readonly type: 'DrawOffered';
      readonly gameId: string;
      readonly by: Color;
    }
  | { readonly type: 'DrawDeclined'; readonly gameId: string }
  | {
      readonly type: 'GameFinished';
      readonly gameId: string;
      readonly clubId: string;
      readonly whiteId: string;
      readonly blackId: string;
      readonly result: Result | null;
      readonly termination: Termination;
    };

/**
 * Partidas en vivo por Socket.IO. El cliente se conecta al namespace con la
 * cookie de sesión (en producción, directo a la API: los rewrites de Vercel no
 * pasan WebSocket), se une a una partida y manda comandos. Cada mensaje
 * responde por el ack; los cambios llegan a todos los de la sala.
 */
export const GAMES_NAMESPACE = '/games';

export const GAME_EVENTS = {
  /** Cliente → servidor: unirse a una partida (jugador o espectador del club). */
  join: 'game:join',
  /** Cliente → servidor: jugar, rendirse, abortar o tablas. */
  command: 'game:command',
  /** Servidor → cliente: la partida cambió. */
  update: 'game:update',
} as const;

const square = z.string().regex(/^[a-h][1-8]$/);

/** game:join. `club` es el slug (subdominio) del club de la partida. */
export const joinSchema = z.object({
  club: z.string().min(1).max(64),
  gameId: z.uuid(),
});

/** game:command */
export const commandSchema = z.discriminatedUnion('action', [
  z.object({
    gameId: z.uuid(),
    action: z.literal('move'),
    from: square,
    to: square,
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
  }),
  z.object({
    gameId: z.uuid(),
    action: z.enum([
      'resign',
      'abort',
      'offerDraw',
      'acceptDraw',
      'declineDraw',
    ]),
  }),
]);

export type JoinMessage = z.infer<typeof joinSchema>;
export type CommandMessage = z.infer<typeof commandSchema>;

/** Respuesta (ack) de game:join y game:command. */
export type GameAck =
  | { ok: true; game: GameView }
  | ({ ok: false } & ApiError<GameErrorCode | SocketErrorCode>);

/** game:update */
export interface GameUpdate {
  readonly game: GameView;
  readonly events: readonly GameEventView[];
}

// ----------------------------------------------------------------------
// Ranking
// ----------------------------------------------------------------------

/** 1 ganó, 0.5 tablas, 0 perdió. */
export type Score = 0 | 0.5 | 1;

export interface RatingView {
  userId: string;
  /** Glicko-2, redondeado. */
  rating: number;
  deviation: number;
  /** Pocas partidas todavía: el rating puede moverse mucho. */
  provisional: boolean;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

/** GET /club/ratings: tabla de posiciones del club. */
export interface StandingView extends RatingView {
  position: number;
  displayName: string;
}

/** GET /club/ratings/:userId: rating e historial de un jugador. */
export interface ProfileView extends RatingView {
  history: {
    gameId: string;
    opponentId: string;
    score: Score;
    ratingBefore: number;
    ratingAfter: number;
    playedAt: string;
  }[];
}

// ----------------------------------------------------------------------
// Lichess, Chess.com y FIDE
// ----------------------------------------------------------------------

export type Platform = 'lichess' | 'chesscom';

export const platformSchema = z.enum(['lichess', 'chesscom']);

/** POST /accounts/chesscom. El formato fino lo valida la API. */
export const usernameSchema = z.object({ username: z.string().max(40) });

/** POST /club/imports */
export const importSchema = z.object({ platform: platformSchema });

/** GET /club/imports?userId= */
export const listImportsSchema = z.object({ userId: z.uuid().optional() });

/** PUT /club/fide/:userId */
export const fideIdSchema = z.object({ fideId: z.string().max(12) });

export type UsernameInput = z.infer<typeof usernameSchema>;
export type ImportInput = z.infer<typeof importSchema>;
export type FideIdInput = z.infer<typeof fideIdSchema>;

/** Rating de cada ritmo en la plataforma. Falta el ritmo que no ha jugado. */
export interface OnlineRatings {
  readonly bullet?: number;
  readonly blitz?: number;
  readonly rapid?: number;
  readonly classical?: number;
  /** Por correspondencia (daily en Chess.com). */
  readonly daily?: number;
}

export interface FideRatings {
  readonly standard?: number;
  readonly rapid?: number;
  readonly blitz?: number;
}

/** GET /club/accounts/:userId: las cuentas de un miembro. */
export interface LinkedAccountView {
  platform: Platform;
  username: string;
  displayName: string;
  url: string;
  verified: boolean;
  ratings: OnlineRatings;
  ratingsUpdatedAt: string | null;
}

/** GET /accounts: las propias llevan el código mientras falta verificarlas. */
export interface OwnLinkedAccountView extends LinkedAccountView {
  /** Chess.com: va en la ubicación o el nombre del perfil; después, POST /accounts/chesscom/verify. */
  verificationCode: string | null;
}

/** GET /club/imports */
export interface ImportedGameView {
  id: string;
  platform: Platform;
  url: string;
  whiteName: string;
  blackName: string;
  /** Miembros del club con esa cuenta verificada; null si el jugador no es del club. */
  whiteUserId: string | null;
  blackUserId: string | null;
  result: string | null;
  speed: string;
  /** Ajedrez estándar: solo esas cuentan para el ranking. */
  standard: boolean;
  playedAt: string;
}

/** GET /club/imports/:id */
export interface ImportedGameDetail extends ImportedGameView {
  pgn: string;
}

/** POST /club/imports */
export interface ImportSummary {
  /** Partidas terminadas que entregó la plataforma. */
  readonly found: number;
  /** Las que el club todavía no tenía. */
  readonly imported: number;
  /** De esas, las que cuentan para el ranking (entre miembros). */
  readonly rated: number;
}

/** GET/PUT /club/fide/:userId */
export interface FideView {
  userId: string;
  fideId: string;
  name: string;
  federation: string | null;
  title: string | null;
  ratings: FideRatings;
  url: string;
  ratingsUpdatedAt: string;
}

// ----------------------------------------------------------------------
// Planes
// ----------------------------------------------------------------------

export type PlanId = 'free' | 'pro';

/** Solo `active` da el plan Pro. */
export type SubscriptionStatus = 'pending' | 'active' | 'paused' | 'cancelled';

/** GET /club/plan */
export interface PlanView {
  plan: PlanId;
  /** null: sin tope. */
  maxMembers: number | null;
  members: number;
  /** Estado de la suscripción en Mercado Pago; null si nunca se contrató. */
  status: SubscriptionStatus | null;
  nextPaymentAt: string | null;
}

/** POST /club/plan/checkout: el dueño paga en Mercado Pago y vuelve al club. */
export interface CheckoutView {
  checkoutUrl: string;
}
