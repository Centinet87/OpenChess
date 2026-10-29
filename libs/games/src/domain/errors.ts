export type GameErrorCode =
  | 'INVALID_TIME_CONTROL'
  | 'SAME_PLAYER'
  | 'NOT_A_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'GAME_OVER'
  | 'CANNOT_ABORT'
  | 'NO_DRAW_OFFER';

/** Regla de la partida rota. La API la traduce a un error para el cliente. */
export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
