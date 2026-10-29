export type GameErrorCode =
  | 'INVALID_TIME_CONTROL'
  | 'GAME_NOT_FOUND'
  | 'OPPONENT_NOT_MEMBER'
  | 'CONFLICT'
  | 'SAME_PLAYER'
  | 'NOT_A_PLAYER'
  | 'NOT_STARTED'
  | 'ALREADY_STARTED'
  | 'CANNOT_ACCEPT_OWN'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'GAME_OVER'
  | 'CANNOT_ABORT'
  | 'NO_DRAW_OFFER'
  | 'CHALLENGE_EXPIRED'
  | 'TOO_MANY_CHALLENGES';

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
