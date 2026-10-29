import { LinkError } from './errors.js';

export type Platform = 'lichess' | 'chesscom';

export const PLATFORM_NAMES: Record<Platform, string> = {
  lichess: 'Lichess',
  chesscom: 'Chess.com',
};

/** Rating de cada ritmo en la plataforma. Falta el ritmo que no ha jugado. */
export interface OnlineRatings {
  readonly bullet?: number;
  readonly blitz?: number;
  readonly rapid?: number;
  readonly classical?: number;
  /** Por correspondencia (daily en Chess.com). */
  readonly daily?: number;
}

/**
 * Las dos plataformas usan letras, números, guion y guion bajo, y no
 * distinguen mayúsculas. Se guarda en minúsculas.
 */
export function normalizeUsername(username: string): string {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(name)) {
    throw new LinkError('INVALID_USERNAME', 'Nombre de usuario inválido');
  }
  return name;
}
