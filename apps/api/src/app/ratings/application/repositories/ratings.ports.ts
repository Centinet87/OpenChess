import type { PlayerRatingSnapshot } from '../../domain/entities/player-rating';
import type { Score } from '../../domain/entities/rating';

/** Cómo quedó un jugador después de una partida. */
export interface RatedPlayer {
  readonly before: PlayerRatingSnapshot;
  readonly after: PlayerRatingSnapshot;
  readonly score: Score;
}

/** Lo que se guarda al contar una partida para el ranking. */
export interface RatedGame {
  readonly gameId: string;
  readonly clubId: string;
  readonly white: RatedPlayer;
  readonly black: RatedPlayer;
}

/** Fila de la tabla de posiciones. */
export interface Standing extends PlayerRatingSnapshot {
  readonly displayName: string;
}

/** Una partida en el historial de un jugador. */
export interface RatingChange {
  readonly gameId: string;
  readonly opponentId: string;
  readonly score: Score;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly playedAt: Date;
}

/** Lo implementa la infraestructura. Solo ve los ratings del club del contexto. */
export interface RatingsRepository {
  /** Los que ya tienen rating en el club; quien no aparece todavía no ha jugado. */
  find(
    clubId: string,
    userIds: readonly string[],
  ): Promise<PlayerRatingSnapshot[]>;
  /**
   * Guarda los dos ratings y el historial de una vez. Devuelve false si la
   * partida ya estaba contada (el evento puede llegar dos veces).
   */
  save(game: RatedGame): Promise<boolean>;
  /** Miembros actuales con rating, de mayor a menor. */
  standings(clubId: string, limit: number): Promise<Standing[]>;
  isMember(clubId: string, userId: string): Promise<boolean>;
  /** Últimas partidas del jugador, de la más nueva a la más vieja. */
  history(
    clubId: string,
    userId: string,
    limit: number,
  ): Promise<RatingChange[]>;
}

/**
 * Rating de partida para quien todavía no juega en el club (p. ej. su Elo FIDE).
 * Quien no aparece en el mapa parte en 1500.
 */
export interface RatingSeeds {
  find(
    clubId: string,
    userIds: readonly string[],
  ): Promise<Map<string, number>>;
}
