import { Game, type GameSnapshot } from '@openchess/games';

/** Lo que recibe el cliente: posición, tiempos ya descontados y la hora del servidor. */
export interface GameView {
  readonly id: string;
  readonly status: GameSnapshot['status'];
  readonly whiteId: string;
  readonly blackId: string;
  readonly challengerId: string;
  readonly timeControl: GameSnapshot['timeControl'];
  readonly fen: string;
  readonly pgn: string;
  readonly clock: {
    readonly whiteMs: number;
    readonly blackMs: number;
    readonly running: GameSnapshot['clock']['running'];
  };
  /** Hasta cuándo (epoch ms del servidor) tienen las blancas para la primera jugada. */
  readonly firstMoveBy: number | null;
  readonly drawOfferBy: GameSnapshot['drawOfferBy'];
  readonly result: GameSnapshot['result'];
  readonly termination: GameSnapshot['termination'];
  /** El cliente la usa para corregir el desfase con su reloj local. */
  readonly serverNow: number;
}

export function toView(s: GameSnapshot, now: number): GameView {
  const game = Game.restore(s);
  return {
    id: s.id,
    status: s.status,
    whiteId: s.whiteId,
    blackId: s.blackId,
    challengerId: s.challengerId,
    timeControl: s.timeControl,
    fen: game.fen,
    pgn: s.pgn,
    clock: {
      whiteMs: game.clock.remaining('white', now),
      blackMs: game.clock.remaining('black', now),
      running: s.clock.running,
    },
    firstMoveBy:
      s.status === 'in_progress' && !s.clock.running && game.plies === 0
        ? game.nextDeadline(now)
        : null,
    drawOfferBy: s.drawOfferBy,
    result: s.result,
    termination: s.termination,
    serverNow: now,
  };
}
