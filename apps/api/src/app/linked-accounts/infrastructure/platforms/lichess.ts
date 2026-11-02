import type { LichessOAuth } from '../../application/repositories/lichess-oauth';
import type {
  ChessPlatform,
  PlatformProfile,
} from '../../application/repositories/linked-accounts.ports';
import type {
  ExternalGame,
  GameResult,
} from '../../domain/entities/external-game';
import type { OnlineRatings } from '../../domain/entities/platform';
import { request, requestJson } from './http';

/** Lo que usamos de https://lichess.org/api#tag/Users */
export interface LichessUser {
  id: string;
  username: string;
  disabled?: boolean;
  tosViolation?: boolean;
  profile?: { bio?: string };
  perfs?: Record<string, { rating: number; games: number } | undefined>;
}

/** Lo que usamos de https://lichess.org/api#tag/Games (una línea del ndjson). */
export interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  status: string;
  createdAt: number;
  lastMoveAt?: number;
  players: {
    white: { user?: { id: string; name: string } };
    black: { user?: { id: string; name: string } };
  };
  winner?: 'white' | 'black';
  pgn?: string;
}

const PERFS: Record<string, keyof OnlineRatings> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
};

/** Estados en que la partida no terminó o se abortó: no hay resultado. */
const NO_RESULT = new Set([
  'created',
  'started',
  'aborted',
  'noStart',
  'unknownFinish',
]);

export function parseLichessUser(user: LichessUser): PlatformProfile | null {
  if (user.disabled || user.tosViolation) return null;
  const ratings: Record<string, number> = {};
  for (const [perf, key] of Object.entries(PERFS)) {
    const p = user.perfs?.[perf];
    if (p && p.games > 0) ratings[key] = p.rating;
  }
  return {
    displayName: user.username,
    ratings,
    editableText: user.profile?.bio ?? '',
  };
}

export function parseLichessGame(game: LichessGame): ExternalGame {
  const result: GameResult | null = NO_RESULT.has(game.status)
    ? null
    : game.winner === 'white'
      ? '1-0'
      : game.winner === 'black'
        ? '0-1'
        : '1/2-1/2';
  const { white, black } = game.players;
  return {
    platform: 'lichess',
    externalId: game.id,
    url: `https://lichess.org/${game.id}`,
    white: white.user?.id ?? null,
    black: black.user?.id ?? null,
    whiteName: white.user?.name ?? 'Computadora',
    blackName: black.user?.name ?? 'Computadora',
    result,
    speed: game.speed,
    standard: game.variant === 'standard',
    pgn: game.pgn ?? '',
    playedAt: new Date(game.lastMoveAt ?? game.createdAt),
  };
}

/** PKCE: Lichess no pide registrar la app ni un secreto de cliente. */

export interface LichessConfig {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly userAgent: string;
}

/** Inicio de sesión en Lichess solo para probar de quién es la cuenta. */

export class LichessClient implements ChessPlatform, LichessOAuth {
  readonly platform = 'lichess';

  constructor(private readonly config: LichessConfig) {}

  async profile(username: string): Promise<PlatformProfile | null> {
    const user = await requestJson<LichessUser>(
      `${this.config.baseUrl}/api/user/${encodeURIComponent(username)}`,
      { userAgent: this.config.userAgent },
    );
    return user ? parseLichessUser(user) : null;
  }

  async recentGames(
    username: string,
    since: Date,
    max: number,
  ): Promise<ExternalGame[]> {
    const params = new URLSearchParams({
      since: String(since.getTime()),
      max: String(max),
      pgnInJson: 'true',
      sort: 'dateAsc',
    });
    const res = await request(
      `${this.config.baseUrl}/api/games/user/${encodeURIComponent(username)}?${params}`,
      {
        userAgent: this.config.userAgent,
        headers: { Accept: 'application/x-ndjson' },
      },
    );
    if (!res) return [];
    return (await res.text())
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => parseLichessGame(JSON.parse(line) as LichessGame));
  }

  authorizeUrl(state: string, challenge: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    return `${this.config.baseUrl}/oauth?${params}`;
  }

  async usernameFromCode(
    code: string,
    verifier: string,
  ): Promise<string | null> {
    const token = await requestJson<{ access_token: string }>(
      `${this.config.baseUrl}/api/token`,
      {
        userAgent: this.config.userAgent,
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
        }),
      },
    );
    if (!token) return null;

    const auth = { Authorization: `Bearer ${token.access_token}` };
    try {
      const account = await requestJson<LichessUser>(
        `${this.config.baseUrl}/api/account`,
        { userAgent: this.config.userAgent, headers: auth },
      );
      return account?.id ?? null;
    } finally {
      // Solo se necesitaba para saber quién es: no se guarda.
      await request(`${this.config.baseUrl}/api/token`, {
        userAgent: this.config.userAgent,
        method: 'DELETE',
        headers: auth,
      }).catch(() => undefined);
    }
  }
}
