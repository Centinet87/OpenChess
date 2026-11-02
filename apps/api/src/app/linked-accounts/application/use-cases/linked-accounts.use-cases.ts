import {
  countsForRanking,
  type ImportedGameSnapshot,
} from '../../domain/entities/external-game';
import {
  LinkedAccount,
  type LinkedAccountSnapshot,
} from '../../domain/entities/linked-account';
import {
  normalizeUsername,
  PLATFORM_NAMES,
  type Platform,
} from '../../domain/entities/platform';
import { LinkError } from '../../domain/errors';
import type {
  LinkedAccountsDeps,
  PlatformProfile,
} from '../repositories/linked-accounts.ports';

/** Los ratings online se piden de nuevo, como mucho, cada 10 minutos. */
const RATINGS_MAX_AGE_MS = 10 * 60 * 1000;
/** Cuánto hacia atrás se traen partidas, y cuántas como máximo por vez. */
const IMPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const IMPORT_MAX = 100;
const LIST_LIMIT = 50;

export interface ImportSummary {
  /** Partidas terminadas que entregó la plataforma. */
  readonly found: number;
  /** Las que el club todavía no tenía. */
  readonly imported: number;
  /** De esas, las que cuentan para el ranking (entre miembros). */
  readonly rated: number;
}

export class LinkedAccountsUseCases {
  constructor(private readonly deps: LinkedAccountsDeps) {}

  list(userId: string): Promise<LinkedAccountSnapshot[]> {
    return this.deps.accounts.findByUser(userId);
  }

  /** Cuentas verificadas de un miembro, para mostrarlas en el club. */
  async verifiedOf(userId: string): Promise<LinkedAccountSnapshot[]> {
    const all = await this.deps.accounts.findByUser(userId);
    return all.filter((a) => a.verifiedAt !== null);
  }

  /**
   * Vincula una cuenta que ya probó ser suya (iniciando sesión en Lichess):
   * queda verificada de entrada.
   */
  async linkVerified(
    userId: string,
    platform: Platform,
    username: string,
  ): Promise<LinkedAccountSnapshot> {
    const name = normalizeUsername(username);
    const profile = await this.profileOrFail(platform, name);
    const existing = await this.deps.accounts.find(userId, platform);
    const account = LinkedAccount.verified({
      id: existing?.id ?? this.deps.newId(),
      userId,
      platform,
      username: name,
      displayName: profile.displayName,
      ratings: profile.ratings,
      now: this.deps.now(),
    });
    await this.save(account);
    return account.snapshot;
  }

  /**
   * Reclama una cuenta sin poder iniciar sesión en la plataforma (Chess.com):
   * devuelve un código que hay que poner en el perfil para verificarla.
   */
  async startVerification(
    userId: string,
    platform: Platform,
    username: string,
  ): Promise<LinkedAccountSnapshot> {
    const name = normalizeUsername(username);
    const existing = await this.deps.accounts.find(userId, platform);
    if (existing?.verifiedAt && existing.username === name) return existing;

    const profile = await this.profileOrFail(platform, name);
    const account = LinkedAccount.pending({
      id: existing?.id ?? this.deps.newId(),
      userId,
      platform,
      username: name,
      displayName: profile.displayName,
      code: this.deps.newCode(),
    });
    await this.save(account);
    return account.snapshot;
  }

  /** Busca el código en el perfil de la plataforma. */
  async verify(
    userId: string,
    platform: Platform,
  ): Promise<LinkedAccountSnapshot> {
    const stored = await this.deps.accounts.find(userId, platform);
    if (!stored || stored.verifiedAt || !stored.verificationCode) {
      throw new LinkError(
        'NOT_PENDING',
        'No hay una cuenta esperando verificación',
      );
    }
    const profile = await this.profileOrFail(platform, stored.username);
    if (!profile.editableText.includes(stored.verificationCode)) {
      throw new LinkError(
        'CODE_NOT_FOUND',
        `No encontramos el código en tu perfil de ${PLATFORM_NAMES[platform]}`,
      );
    }
    const account = LinkedAccount.restore(stored).verify(
      profile.ratings,
      this.deps.now(),
    );
    await this.save(account);
    return account.snapshot;
  }

  unlink(userId: string, platform: Platform): Promise<void> {
    return this.deps.accounts.delete(userId, platform);
  }

  /** Actualiza los ratings online si tienen más de unos minutos. */
  async refresh(
    userId: string,
    platform: Platform,
  ): Promise<LinkedAccountSnapshot> {
    const account = LinkedAccount.restore(
      await this.verifiedOrFail(userId, platform),
    );
    const now = this.deps.now();
    if (account.ratingsAreFresh(now, RATINGS_MAX_AGE_MS)) {
      return account.snapshot;
    }
    const profile = await this.profileOrFail(
      platform,
      account.snapshot.username,
    );
    const updated = account.withRatings(profile.ratings, now);
    await this.save(updated);
    return updated.snapshot;
  }

  /**
   * Trae al club las partidas recientes del miembro en la plataforma. Las que
   * son entre dos miembros con cuentas verificadas se publican para el ranking.
   */
  async importGames(
    clubId: string,
    userId: string,
    platform: Platform,
  ): Promise<ImportSummary> {
    const account = await this.verifiedOrFail(userId, platform);
    const now = this.deps.now();
    const found = await this.deps.platforms[platform].recentGames(
      account.username,
      new Date(now.getTime() - IMPORT_WINDOW_MS),
      IMPORT_MAX,
    );

    const usernames = new Set<string>();
    for (const g of found) {
      if (g.white) usernames.add(g.white);
      if (g.black) usernames.add(g.black);
    }
    const members = await this.deps.accounts.verifiedMembers(clubId, platform, [
      ...usernames,
    ]);
    const member = (name: string | null) =>
      name ? (members.get(name) ?? null) : null;

    const games: ImportedGameSnapshot[] = [...found]
      .sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime())
      .map((g) => ({
        ...g,
        id: this.deps.newId(),
        clubId,
        whiteUserId: member(g.white),
        blackUserId: member(g.black),
        importedBy: userId,
      }));
    const inserted = await this.deps.games.insertNew(games);

    // En orden de juego: el ranking las cuenta una tras otra.
    const rated = inserted.filter(countsForRanking);
    for (const game of rated) this.deps.publisher.publish(game);
    return {
      found: found.length,
      imported: inserted.length,
      rated: rated.length,
    };
  }

  listImported(
    clubId: string,
    userId: string | null,
  ): Promise<ImportedGameSnapshot[]> {
    return this.deps.games.list(clubId, userId, LIST_LIMIT);
  }

  findImported(
    clubId: string,
    id: string,
  ): Promise<ImportedGameSnapshot | null> {
    return this.deps.games.find(clubId, id);
  }

  private async profileOrFail(
    platform: Platform,
    username: string,
  ): Promise<PlatformProfile> {
    const profile = await this.deps.platforms[platform].profile(username);
    if (!profile) {
      throw new LinkError(
        'ACCOUNT_NOT_FOUND',
        `No existe esa cuenta en ${PLATFORM_NAMES[platform]}`,
      );
    }
    return profile;
  }

  private async verifiedOrFail(
    userId: string,
    platform: Platform,
  ): Promise<LinkedAccountSnapshot> {
    const account = await this.deps.accounts.find(userId, platform);
    if (!account?.verifiedAt) {
      throw new LinkError(
        'NOT_LINKED',
        `Primero vincula y verifica tu cuenta de ${PLATFORM_NAMES[platform]}`,
      );
    }
    return account;
  }

  private async save(account: LinkedAccount): Promise<void> {
    if (!(await this.deps.accounts.save(account.snapshot))) {
      throw new LinkError(
        'ALREADY_LINKED',
        `Esa cuenta de ${PLATFORM_NAMES[account.snapshot.platform]} ya está vinculada a otra persona`,
      );
    }
  }
}
