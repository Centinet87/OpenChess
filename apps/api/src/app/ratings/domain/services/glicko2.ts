import { INITIAL_RATING, type Rating, type Score } from '../entities/rating';

/**
 * Glicko-2 según el paper de Glickman ("Example of the Glicko-2 system", 2013).
 * Los pasos van numerados igual que allí.
 */

/** Conversión entre la escala de Glicko y la de Glicko-2. */
const SCALE = 173.7178;
/** Precisión del cálculo de la volatilidad (paso 5). */
const EPSILON = 0.000001;

export interface Glicko2Options {
  /** Cuánto puede cambiar la volatilidad. Glickman sugiere entre 0.3 y 1.2. */
  readonly tau: number;
}

export const DEFAULT_GLICKO2: Glicko2Options = { tau: 0.5 };

export interface GameOutcome {
  readonly opponent: Rating;
  readonly score: Score;
}

/** Rating del jugador después de un período con estas partidas. */
export function glicko2(
  player: Rating,
  games: readonly GameOutcome[],
  options: Glicko2Options = DEFAULT_GLICKO2,
): Rating {
  // Paso 2: a la escala de Glicko-2
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  // Sin partidas solo crece la incertidumbre (paso 6 del caso sin partidas).
  if (games.length === 0) {
    const grown = Math.sqrt(phi ** 2 + sigma ** 2) * SCALE;
    return {
      ...player,
      deviation: Math.min(grown, INITIAL_RATING.deviation),
    };
  }

  // Pasos 3 y 4: varianza estimada (v) y mejora estimada (delta)
  let invV = 0;
  let sum = 0;
  for (const { opponent, score } of games) {
    const muJ = (opponent.rating - 1500) / SCALE;
    const gJ = g(opponent.deviation / SCALE);
    const e = expected(mu, muJ, gJ);
    invV += gJ ** 2 * e * (1 - e);
    sum += gJ * (score - e);
  }
  const v = 1 / invV;
  const delta = v * sum;

  // Paso 5: volatilidad nueva
  const newSigma = volatility(delta, phi, v, sigma, options.tau);

  // Pasos 6 y 7: desviación y rating nuevos
  const phiStar = Math.sqrt(phi ** 2 + newSigma ** 2);
  const newPhi = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / v);
  const newMu = mu + newPhi ** 2 * sum;

  // Paso 8: de vuelta a la escala de siempre
  return {
    rating: newMu * SCALE + 1500,
    deviation: Math.min(newPhi * SCALE, INITIAL_RATING.deviation),
    volatility: newSigma,
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2);
}

function expected(mu: number, muJ: number, gJ: number): number {
  return 1 / (1 + Math.exp(-gJ * (mu - muJ)));
}

/** Paso 5: método de Illinois para resolver f(x) = 0. */
function volatility(
  delta: number,
  phi: number,
  v: number,
  sigma: number,
  tau: number,
): number {
  const a = Math.log(sigma ** 2);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (
      (ex * (delta ** 2 - phi ** 2 - v - ex)) / (2 * (phi ** 2 + v + ex) ** 2) -
      (x - a) / tau ** 2
    );
  };

  let A = a;
  let B: number;
  if (delta ** 2 > phi ** 2 + v) {
    B = Math.log(delta ** 2 - phi ** 2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}
