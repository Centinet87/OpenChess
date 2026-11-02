import type { OnlineRatings, Platform } from './platform';

export interface LinkedAccountSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly platform: Platform;
  /** En minúsculas: así lo identifica la plataforma. */
  readonly username: string;
  /** Como lo escribe la persona en la plataforma. */
  readonly displayName: string;
  /** Código que hay que poner en el perfil para probar que la cuenta es propia. */
  readonly verificationCode: string | null;
  readonly verifiedAt: Date | null;
  readonly ratings: OnlineRatings;
  readonly ratingsUpdatedAt: Date | null;
}

/**
 * Cuenta de Lichess o Chess.com de un usuario. Hasta que se verifica que es
 * suya no cuenta para nada: ni se muestra en el club ni reconoce partidas.
 */
export class LinkedAccount {
  private constructor(readonly snapshot: LinkedAccountSnapshot) {}

  /** Recién reclamada: falta probar que es suya con el código. */
  static pending(input: {
    id: string;
    userId: string;
    platform: Platform;
    username: string;
    displayName: string;
    code: string;
  }): LinkedAccount {
    return new LinkedAccount({
      id: input.id,
      userId: input.userId,
      platform: input.platform,
      username: input.username,
      displayName: input.displayName,
      verificationCode: input.code,
      verifiedAt: null,
      ratings: {},
      ratingsUpdatedAt: null,
    });
  }

  /** Verificada de entrada, p. ej. después de iniciar sesión en Lichess. */
  static verified(input: {
    id: string;
    userId: string;
    platform: Platform;
    username: string;
    displayName: string;
    ratings: OnlineRatings;
    now: Date;
  }): LinkedAccount {
    return new LinkedAccount({
      id: input.id,
      userId: input.userId,
      platform: input.platform,
      username: input.username,
      displayName: input.displayName,
      verificationCode: null,
      verifiedAt: input.now,
      ratings: input.ratings,
      ratingsUpdatedAt: input.now,
    });
  }

  static restore(snapshot: LinkedAccountSnapshot): LinkedAccount {
    return new LinkedAccount(snapshot);
  }

  get isVerified(): boolean {
    return this.snapshot.verifiedAt !== null;
  }

  verify(ratings: OnlineRatings, now: Date): LinkedAccount {
    return new LinkedAccount({
      ...this.snapshot,
      verificationCode: null,
      verifiedAt: now,
      ratings,
      ratingsUpdatedAt: now,
    });
  }

  withRatings(ratings: OnlineRatings, now: Date): LinkedAccount {
    return new LinkedAccount({
      ...this.snapshot,
      ratings,
      ratingsUpdatedAt: now,
    });
  }

  /** Los ratings de hace menos de `maxAgeMs` no se vuelven a pedir. */
  ratingsAreFresh(now: Date, maxAgeMs: number): boolean {
    const at = this.snapshot.ratingsUpdatedAt;
    return !!at && now.getTime() - at.getTime() < maxAgeMs;
  }
}
