import type {
  ExternalGame,
  ImportedGameSnapshot,
} from '../domain/external-game.js';
import type { FideLinkSnapshot, FideProfile } from '../domain/fide.js';
import type { LinkedAccountSnapshot } from '../domain/linked-account.js';
import type { OnlineRatings, Platform } from '../domain/platform.js';

export interface PlatformProfile {
  /** Como lo escribe la persona. */
  readonly displayName: string;
  readonly ratings: OnlineRatings;
  /** Texto del perfil que la persona puede editar, donde se busca el código. */
  readonly editableText: string;
}

/**
 * Una plataforma de ajedrez online (patrón Strategy): Lichess y Chess.com
 * traen los datos por APIs distintas, pero los entregan iguales.
 * Lanza LinkError PLATFORM_UNAVAILABLE si la plataforma no responde.
 */
export interface ChessPlatform {
  readonly platform: Platform;
  /** null si la cuenta no existe o está cerrada. */
  profile(username: string): Promise<PlatformProfile | null>;
  /** Partidas terminadas desde `since`, de la más vieja a la más nueva. */
  recentGames(
    username: string,
    since: Date,
    max: number,
  ): Promise<ExternalGame[]>;
}

/** Lo implementa la infraestructura. */
export interface LinkedAccountsRepository {
  findByUser(userId: string): Promise<LinkedAccountSnapshot[]>;
  find(
    userId: string,
    platform: Platform,
  ): Promise<LinkedAccountSnapshot | null>;
  /**
   * Crea o reemplaza la cuenta de esa plataforma del usuario. Devuelve false si
   * la cuenta ya está verificada por otra persona.
   */
  save(account: LinkedAccountSnapshot): Promise<boolean>;
  delete(userId: string, platform: Platform): Promise<void>;
  /** De estos usuarios de la plataforma, cuáles son miembros del club con la cuenta verificada. */
  verifiedMembers(
    clubId: string,
    platform: Platform,
    usernames: readonly string[],
  ): Promise<Map<string, string>>;
}

export interface ImportedGamesRepository {
  /** Guarda las que el club no tenía y devuelve esas. Solo ve las del club del contexto. */
  insertNew(
    games: readonly ImportedGameSnapshot[],
  ): Promise<ImportedGameSnapshot[]>;
  list(
    clubId: string,
    userId: string | null,
    limit: number,
  ): Promise<ImportedGameSnapshot[]>;
  find(clubId: string, id: string): Promise<ImportedGameSnapshot | null>;
}

/** Observer: avisa de cada partida importada que cuenta para el ranking. */
export interface ImportedGamePublisher {
  publish(game: ImportedGameSnapshot): void;
}

export interface LinkedAccountsDeps {
  readonly accounts: LinkedAccountsRepository;
  readonly games: ImportedGamesRepository;
  readonly platforms: Readonly<Record<Platform, ChessPlatform>>;
  readonly publisher: ImportedGamePublisher;
  readonly newId: () => string;
  /** Código corto y difícil de adivinar para el perfil de Chess.com. */
  readonly newCode: () => string;
  readonly now: () => Date;
}

/** La ficha pública de FIDE. Lanza LinkError PLATFORM_UNAVAILABLE si no responde. */
export interface FideDirectory {
  /** null si no existe ese FIDE ID. */
  profile(fideId: string): Promise<FideProfile | null>;
}

/** FIDE ID de los miembros. Solo ve los del club del contexto. */
export interface FideLinksRepository {
  find(clubId: string, userId: string): Promise<FideLinkSnapshot | null>;
  list(clubId: string): Promise<FideLinkSnapshot[]>;
  /** Devuelve false si ese FIDE ID ya está asignado a otro miembro del club. */
  save(link: FideLinkSnapshot): Promise<boolean>;
  delete(clubId: string, userId: string): Promise<void>;
  isMember(clubId: string, userId: string): Promise<boolean>;
}

export interface FideDeps {
  readonly links: FideLinksRepository;
  readonly directory: FideDirectory;
  readonly now: () => Date;
}
