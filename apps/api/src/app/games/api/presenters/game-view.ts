import type { GameView } from '@openchess/contracts';
import { Game, type GameSnapshot } from '../../domain/entities/game';

/** Lo que recibe el cliente: posición, tiempos ya descontados y la hora del servidor. */

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
