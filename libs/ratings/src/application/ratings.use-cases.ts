import {
  PlayerRating,
  type PlayerRatingSnapshot,
} from '../domain/player-rating.js';
import {
  opponentScore,
  whiteScore,
  type GameResult,
  type RatingSystem,
} from '../domain/rating-system.js';
import type {
  RatedGame,
  RatingChange,
  RatingSeeds,
  RatingsRepository,
  Standing,
} from './ports.js';

/** Lo que llega del evento GameFinished de libs/games. */
export interface FinishedGame {
  readonly gameId: string;
  readonly clubId: string;
  readonly whiteId: string;
  readonly blackId: string;
  /** null si se abortó antes de que jugaran los dos: no cuenta para el ranking. */
  readonly result: GameResult | null;
}

export interface PlayerProfile {
  readonly rating: PlayerRatingSnapshot;
  readonly history: RatingChange[];
}

const STANDINGS_LIMIT = 200;
const HISTORY_LIMIT = 50;

export class RatingsUseCases {
  constructor(
    private readonly ratings: RatingsRepository,
    private readonly system: RatingSystem,
    private readonly seeds?: RatingSeeds,
  ) {}

  /** Actualiza el ranking con una partida terminada. Devuelve lo guardado, o null si no contó. */
  async recordGame(game: FinishedGame): Promise<RatedGame | null> {
    if (!game.result) return null;

    const [white, black] = await this.load(game.clubId, [
      game.whiteId,
      game.blackId,
    ]);
    const next = this.system.rate(white.rating, black.rating, game.result);
    const score = whiteScore(game.result);

    const rated: RatedGame = {
      gameId: game.gameId,
      clubId: game.clubId,
      white: {
        before: white.snapshot,
        after: white.afterGame(next.white, score).snapshot,
        score,
      },
      black: {
        before: black.snapshot,
        after: black.afterGame(next.black, opponentScore(score)).snapshot,
        score: opponentScore(score),
      },
    };
    return (await this.ratings.save(rated)) ? rated : null;
  }

  standings(clubId: string): Promise<Standing[]> {
    return this.ratings.standings(clubId, STANDINGS_LIMIT);
  }

  /** null si el usuario no es miembro del club. */
  async profile(clubId: string, userId: string): Promise<PlayerProfile | null> {
    if (!(await this.ratings.isMember(clubId, userId))) return null;
    const [player] = await this.load(clubId, [userId]);
    return {
      rating: player.snapshot,
      history: await this.ratings.history(clubId, userId, HISTORY_LIMIT),
    };
  }

  private async load(
    clubId: string,
    userIds: readonly string[],
  ): Promise<PlayerRating[]> {
    const found = await this.ratings.find(clubId, userIds);
    const missing = userIds.filter((id) => !found.some((r) => r.userId === id));
    const seeds =
      missing.length && this.seeds
        ? await this.seeds.find(clubId, missing)
        : new Map<string, number>();
    return userIds.map((userId) => {
      const snapshot = found.find((r) => r.userId === userId);
      return snapshot
        ? PlayerRating.restore(snapshot)
        : PlayerRating.initial(clubId, userId, seeds.get(userId));
    });
  }
}
