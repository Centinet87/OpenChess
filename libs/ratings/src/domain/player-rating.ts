import { INITIAL_RATING, type Rating, type Score } from './rating.js';

export interface PlayerRatingSnapshot {
  readonly clubId: string;
  readonly userId: string;
  readonly rating: Rating;
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

/** Rating de un jugador dentro de un club. Inmutable: cada partida da uno nuevo. */
export class PlayerRating {
  private constructor(readonly snapshot: PlayerRatingSnapshot) {}

  /** Quien todavía no juega en el club parte con el rating inicial. */
  static initial(clubId: string, userId: string): PlayerRating {
    return new PlayerRating({
      clubId,
      userId,
      rating: INITIAL_RATING,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    });
  }

  static restore(snapshot: PlayerRatingSnapshot): PlayerRating {
    return new PlayerRating(snapshot);
  }

  get rating(): Rating {
    return this.snapshot.rating;
  }

  afterGame(rating: Rating, score: Score): PlayerRating {
    const s = this.snapshot;
    return new PlayerRating({
      ...s,
      rating,
      games: s.games + 1,
      wins: s.wins + (score === 1 ? 1 : 0),
      draws: s.draws + (score === 0.5 ? 1 : 0),
      losses: s.losses + (score === 0 ? 1 : 0),
    });
  }
}
