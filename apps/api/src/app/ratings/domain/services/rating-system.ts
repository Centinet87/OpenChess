import type { Rating, Score } from '../entities/rating';
import { DEFAULT_GLICKO2, glicko2, type Glicko2Options } from './glicko2';

/** Resultado de una partida, como lo guarda games. */
export type GameResult = '1-0' | '0-1' | '1/2-1/2';

const WHITE_SCORE: Record<GameResult, Score> = {
  '1-0': 1,
  '0-1': 0,
  '1/2-1/2': 0.5,
};

export function whiteScore(result: GameResult): Score {
  return WHITE_SCORE[result];
}

export function opponentScore(score: Score): Score {
  return (1 - score) as Score;
}

/**
 * Sistema de rating (patrón Strategy): cómo cambian los dos jugadores después
 * de una partida. Hoy solo hay Glicko-2.
 */
export interface RatingSystem {
  rate(
    white: Rating,
    black: Rating,
    result: GameResult,
  ): { white: Rating; black: Rating };
}

/**
 * Cada partida es su propio período de rating, como en los servidores online:
 * el ranking se mueve en cuanto termina la partida. Los dos se calculan con el
 * rating que tenía el otro antes de jugar.
 */
export class Glicko2System implements RatingSystem {
  constructor(private readonly options: Glicko2Options = DEFAULT_GLICKO2) {}

  rate(
    white: Rating,
    black: Rating,
    result: GameResult,
  ): { white: Rating; black: Rating } {
    const score = whiteScore(result);
    return {
      white: glicko2(white, [{ opponent: black, score }], this.options),
      black: glicko2(
        black,
        [{ opponent: white, score: opponentScore(score) }],
        this.options,
      ),
    };
  }
}
