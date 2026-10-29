import type { GameEvent, GameSnapshot, GameStatus } from '../domain/game.js';

export interface StoredGame {
  readonly snapshot: GameSnapshot;
  /** Para control de concurrencia optimista. */
  readonly version: number;
}

/** Lo implementa la infraestructura. Solo ve las partidas del club del contexto. */
export interface GamesRepository {
  insert(snapshot: GameSnapshot): Promise<void>;
  find(gameId: string): Promise<StoredGame | null>;
  /** Guarda si nadie la cambió desde `expectedVersion`. Devuelve false si hubo conflicto. */
  update(snapshot: GameSnapshot, expectedVersion: number): Promise<boolean>;
  list(
    clubId: string,
    statuses: readonly GameStatus[],
    limit: number,
  ): Promise<GameSnapshot[]>;
}

export interface MembershipChecker {
  isMember(clubId: string, userId: string): Promise<boolean>;
}

/**
 * Observer: quien quiera enterarse de lo que pasa en una partida (el gateway
 * para avisar a los clientes, el reloj del servidor, el ranking) se suscribe aquí.
 */
export interface GameEventPublisher {
  publish(game: GameSnapshot, events: readonly GameEvent[]): void;
}

export interface GamesDeps {
  readonly games: GamesRepository;
  readonly members: MembershipChecker;
  readonly publisher: GameEventPublisher;
  readonly newId: () => string;
  readonly now: () => number;
  /** Número en [0, 1) para sortear colores. */
  readonly random: () => number;
}
