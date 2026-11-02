import type { Platform } from './platform';

export type GameResult = '1-0' | '0-1' | '1/2-1/2';

/** Partida tal como la entrega la plataforma, ya traducida. */
export interface ExternalGame {
  readonly platform: Platform;
  /** Id de la partida en la plataforma. */
  readonly externalId: string;
  readonly url: string;
  /** Usuario en minúsculas, o null si no es una persona (p. ej. la computadora). */
  readonly white: string | null;
  readonly black: string | null;
  readonly whiteName: string;
  readonly blackName: string;
  /** null si no terminó o se abortó. */
  readonly result: GameResult | null;
  /** bullet, blitz, rapid, classical, daily... */
  readonly speed: string;
  /** Ajedrez estándar: Chess960 y otras variantes no cuentan para el ranking. */
  readonly standard: boolean;
  readonly pgn: string;
  readonly playedAt: Date;
}

/** Partida externa guardada en un club. */
export interface ImportedGameSnapshot extends ExternalGame {
  readonly id: string;
  readonly clubId: string;
  /** Miembro del club con esa cuenta verificada, o null. */
  readonly whiteUserId: string | null;
  readonly blackUserId: string | null;
  readonly importedBy: string;
}

/**
 * Cuenta para el ranking del club: terminada, ajedrez estándar y entre dos
 * miembros distintos que verificaron sus cuentas.
 */
export function countsForRanking(game: ImportedGameSnapshot): boolean {
  return (
    game.result !== null &&
    game.standard &&
    game.whiteUserId !== null &&
    game.blackUserId !== null &&
    game.whiteUserId !== game.blackUserId
  );
}
