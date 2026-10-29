import { LinkError } from './errors.js';

/** Elo FIDE de cada ritmo. Falta el ritmo en que no tiene rating. */
export interface FideRatings {
  readonly standard?: number;
  readonly rapid?: number;
  readonly blitz?: number;
}

/** Lo público de la ficha de un jugador en ratings.fide.com. */
export interface FideProfile {
  readonly fideId: string;
  readonly name: string;
  readonly federation: string | null;
  readonly title: string | null;
  readonly ratings: FideRatings;
}

export interface FideLinkSnapshot extends FideProfile {
  readonly clubId: string;
  readonly userId: string;
  /** Admin del club que lo agregó. */
  readonly linkedBy: string;
  readonly ratingsUpdatedAt: Date;
}

/** Los FIDE ID son solo dígitos (hoy hasta 9). */
export function normalizeFideId(fideId: string): string {
  const id = fideId.trim();
  if (!/^[1-9][0-9]{0,9}$/.test(id)) {
    throw new LinkError('INVALID_FIDE_ID', 'FIDE ID inválido');
  }
  return id;
}

/**
 * El Elo que mejor anticipa el rating en el club: el clásico (el Elo FIDE de
 * siempre) y, si no tiene, el de rápidas o el de blitz.
 */
export function referenceRating(ratings: FideRatings): number | null {
  return ratings.standard ?? ratings.rapid ?? ratings.blitz ?? null;
}
