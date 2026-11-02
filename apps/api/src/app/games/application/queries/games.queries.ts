import type { GameStatus } from '../../domain/entities/game';

export class GetGameQuery {
  constructor(readonly gameId: string) {}
}

export class ListGamesQuery {
  constructor(
    readonly clubId: string,
    readonly statuses: readonly GameStatus[],
  ) {}
}
