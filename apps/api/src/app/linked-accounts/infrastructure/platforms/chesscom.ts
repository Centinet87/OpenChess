import type {
  ChessPlatform,
  PlatformProfile,
} from '../../application/repositories/linked-accounts.ports';
import type {
  ExternalGame,
  GameResult,
} from '../../domain/entities/external-game';
import type { OnlineRatings } from '../../domain/entities/platform';
import { requestJson } from './http';

/** Lo que usamos de https://www.chess.com/news/view/published-data-api */
export interface ChessComPlayer {
  username: string;
  url: string;
  name?: string;
  location?: string;
  status?: string;
}

export type ChessComStats = Record<
  string,
  { last?: { rating: number } } | undefined
>;

export interface ChessComGame {
  url: string;
  uuid?: string;
  pgn?: string;
  time_class: string;
  rules: string;
  end_time: number;
  white: { username: string; result: string };
  black: { username: string; result: string };
}

const STATS: Record<string, keyof OnlineRatings> = {
  chess_bullet: 'bullet',
  chess_blitz: 'blitz',
  chess_rapid: 'rapid',
  chess_daily: 'daily',
};

/** Códigos de resultado de Chess.com que son tablas. */
const DRAWS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

export function parseChessComProfile(
  player: ChessComPlayer,
  stats: ChessComStats | null,
): PlatformProfile | null {
  if (player.status?.startsWith('closed')) return null;
  const ratings: Record<string, number> = {};
  for (const [stat, key] of Object.entries(STATS)) {
    const rating = stats?.[stat]?.last?.rating;
    if (rating) ratings[key] = rating;
  }
  return {
    // `username` viene en minúsculas; la URL del perfil lo trae como lo escribe la persona.
    displayName: player.url.split('/').pop() || player.username,
    ratings,
    // Campos del perfil que cualquiera puede editar en chess.com/settings.
    editableText: [player.location, player.name].filter(Boolean).join(' '),
  };
}

export function parseChessComGame(game: ChessComGame): ExternalGame {
  const { white, black } = game;
  const result: GameResult | null =
    white.result === 'win'
      ? '1-0'
      : black.result === 'win'
        ? '0-1'
        : DRAWS.has(white.result) && DRAWS.has(black.result)
          ? '1/2-1/2'
          : null;
  return {
    platform: 'chesscom',
    externalId: game.uuid ?? game.url,
    url: game.url,
    white: white.username.toLowerCase(),
    black: black.username.toLowerCase(),
    whiteName: white.username,
    blackName: black.username,
    result,
    speed: game.time_class,
    standard: game.rules === 'chess',
    pgn: game.pgn ?? '',
    playedAt: new Date(game.end_time * 1000),
  };
}

/** "…/games/2026/10" → 2026-10, para saber qué meses pedir. */
function archiveMonth(url: string): number {
  const [year, month] = url.split('/').slice(-2).map(Number);
  return year * 12 + (month - 1);
}

export interface ChessComConfig {
  readonly baseUrl: string;
  readonly userAgent: string;
}

/** API pública de Chess.com: solo lectura y sin inicio de sesión. */
export class ChessComClient implements ChessPlatform {
  readonly platform = 'chesscom';

  constructor(private readonly config: ChessComConfig) {}

  private get(path: string) {
    return {
      url: `${this.config.baseUrl}/pub/player/${path}`,
      init: { userAgent: this.config.userAgent },
    };
  }

  async profile(username: string): Promise<PlatformProfile | null> {
    const name = encodeURIComponent(username);
    const p = this.get(name);
    const player = await requestJson<ChessComPlayer>(p.url, p.init);
    if (!player) return null;
    const s = this.get(`${name}/stats`);
    return parseChessComProfile(
      player,
      await requestJson<ChessComStats>(s.url, s.init),
    );
  }

  async recentGames(
    username: string,
    since: Date,
    max: number,
  ): Promise<ExternalGame[]> {
    const name = encodeURIComponent(username);
    const a = this.get(`${name}/games/archives`);
    const archives =
      (await requestJson<{ archives: string[] }>(a.url, a.init))?.archives ??
      [];
    const fromMonth = since.getUTCFullYear() * 12 + since.getUTCMonth();

    const games: ExternalGame[] = [];
    // Cada archivo es un mes: solo se piden los que caen en la ventana.
    for (const url of archives.filter((u) => archiveMonth(u) >= fromMonth)) {
      const month = await requestJson<{ games: ChessComGame[] }>(url, {
        userAgent: this.config.userAgent,
      });
      games.push(...(month?.games ?? []).map(parseChessComGame));
    }
    return games
      .filter((g) => g.playedAt >= since)
      .sort((x, y) => x.playedAt.getTime() - y.playedAt.getTime())
      .slice(-max);
  }
}
