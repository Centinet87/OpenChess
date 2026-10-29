/** Rating Glicko-2 en la escala de siempre (la del Elo): 1500 es el promedio. */
export interface Rating {
  readonly rating: number;
  /** Desviación (RD): cuánto no sabemos. Baja a medida que se juega. */
  readonly deviation: number;
  /** Volatilidad: qué tan erráticos son los resultados del jugador. */
  readonly volatility: number;
}

/** Con quien no ha jugado: rating promedio y máxima incertidumbre. */
export const INITIAL_RATING: Rating = {
  rating: 1500,
  deviation: 350,
  volatility: 0.06,
};

/**
 * Quien llega con un rating externo (Elo FIDE) parte con ese número, pero con
 * más incertidumbre que alguien establecido: es otra escala y otro grupo de
 * rivales, así que debe poder ajustarse rápido en las primeras partidas.
 */
export const SEEDED_DEVIATION = 150;

export function seededRating(rating: number): Rating {
  return {
    rating,
    deviation: SEEDED_DEVIATION,
    volatility: INITIAL_RATING.volatility,
  };
}

/** Sobre esta desviación el rating todavía es poco confiable (el mismo umbral que usa Lichess). */
const PROVISIONAL_DEVIATION = 110;

export function isProvisional(rating: Rating): boolean {
  return rating.deviation > PROVISIONAL_DEVIATION;
}

/** Puntos que saca un jugador en una partida: 1 gana, 0.5 tablas, 0 pierde. */
export type Score = 0 | 0.5 | 1;
