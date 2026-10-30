import { GameError } from './errors.js';
import { FIRST_MOVE_MS, Game, type MoveInput, type Outcome } from './game.js';
import { timeControl } from './time-control.js';

const W = 'white-user';
const B = 'black-user';

function newGame(minutes = 5, increment = 0, acceptedAt = 0): Game {
  return Game.challenge({
    id: 'g1',
    clubId: 'c1',
    whiteId: W,
    blackId: B,
    challengerId: W,
    timeControl: timeControl(minutes, increment),
  }).accept(B, acceptedAt).game;
}

const m = (uci: string): MoveInput => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  ...(uci[4] ? { promotion: uci[4] as 'q' } : {}),
});

/** Juega una lista de jugadas alternando blancas y negras, un segundo cada una. */
function play(game: Game, moves: string[], start = 0): Outcome {
  let outcome: Outcome = { game, events: [] };
  moves.forEach((uci, i) => {
    const player = outcome.game.plies % 2 === 0 ? W : B;
    outcome = outcome.game.move(player, m(uci), start + (i + 1) * 1000);
  });
  return outcome;
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('Game', () => {
  it('no se juega contra uno mismo', () => {
    expect(() =>
      Game.challenge({
        id: 'g',
        clubId: 'c',
        whiteId: W,
        blackId: W,
        challengerId: W,
        timeControl: timeControl(5, 0),
      }),
    ).toThrow('uno mismo');
  });

  it('un desafío se juega solo cuando el rival lo acepta', () => {
    const challenge = Game.challenge({
      id: 'g',
      clubId: 'c',
      whiteId: W,
      blackId: B,
      challengerId: W,
      timeControl: timeControl(5, 0),
    });
    expect(challenge.snapshot.status).toBe('pending');
    expect(errorCode(() => challenge.move(W, m('e2e4'), 0))).toBe(
      'NOT_STARTED',
    );
    expect(errorCode(() => challenge.accept(W, 0))).toBe('CANNOT_ACCEPT_OWN');

    const started = challenge.accept(B, 0);
    expect(started.events).toEqual([{ type: 'GameStarted', gameId: 'g' }]);
    expect(errorCode(() => started.game.accept(B, 0))).toBe('ALREADY_STARTED');

    expect(challenge.decline(W, 0).game.snapshot).toMatchObject({
      status: 'finished',
      termination: 'declined',
      result: null,
    });
  });

  it('valida turno, jugador y legalidad', () => {
    const game = newGame();
    expect(errorCode(() => game.move(B, m('e7e5'), 0))).toBe('NOT_YOUR_TURN');
    expect(errorCode(() => game.move('intruso', m('e2e4'), 0))).toBe(
      'NOT_A_PLAYER',
    );
    expect(errorCode(() => game.move(W, m('e2e5'), 0))).toBe('ILLEGAL_MOVE');
  });

  it('es inmutable', () => {
    const game = newGame();
    game.move(W, m('e2e4'), 0);
    expect(game.plies).toBe(0);
  });

  it('mate del pastor: ganan las blancas por jaque mate', () => {
    const { game, events } = play(newGame(), [
      'e2e4',
      'e7e5',
      'd1h5',
      'b8c6',
      'f1c4',
      'g8f6',
      'h5f7',
    ]);
    expect(game.snapshot).toMatchObject({
      status: 'finished',
      result: '1-0',
      termination: 'checkmate',
    });
    expect(events.map((e) => e.type)).toEqual(['MoveMade', 'GameFinished']);
    expect(errorCode(() => game.move(B, m('e8f7'), 9000))).toBe('GAME_OVER');
  });

  it('la primera jugada no se cronometra y después corre el reloj del rival', () => {
    const { game } = play(newGame(1, 2, 50_000), ['e2e4'], 50_000);
    expect(game.snapshot.clock).toMatchObject({
      whiteMs: 60_000,
      running: 'black',
    });

    const after = game.move(B, m('e7e5'), 61_000).game;
    // Negras gastaron 10 s y recibieron 2 s de incremento.
    expect(after.snapshot.clock.blackMs).toBe(52_000);
  });

  it('pierde por tiempo quien deja caer la bandera, aunque intente jugar', () => {
    const { game } = play(newGame(1, 0), ['e2e4']);
    const late = game.move(B, m('e7e5'), 1000 + 60_000);
    expect(late.game.snapshot).toMatchObject({
      result: '1-0',
      termination: 'timeout',
    });
    expect(late.game.plies).toBe(1);
  });

  it('el servidor cierra la partida cuando vence el reloj', () => {
    const { game } = play(newGame(1, 0), ['e2e4']);
    expect(game.checkTimeout(30_000).events).toEqual([]);
    expect(game.checkTimeout(61_000).game.snapshot.termination).toBe('timeout');
  });

  it('sin material para dar mate, la bandera del rival da tablas', () => {
    // Blancas: solo rey. Negras: rey y dama. Juegan blancas y caen las negras.
    const game = Game.restore({
      ...newGame(1, 0).snapshot,
      pgn: '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/K6q w - - 0 1"]\n\n1. Kb2 *',
      clock: { whiteMs: 30_000, blackMs: 1_000, running: 'black', since: 0 },
    });
    expect(game.checkTimeout(2_000).game.snapshot).toMatchObject({
      result: '1/2-1/2',
      termination: 'insufficient_material',
    });
  });

  it('si las blancas no juegan en 30 s, la partida se aborta sola', () => {
    const game = newGame(5, 0, 10_000);
    expect(game.nextDeadline(10_000)).toBe(10_000 + FIRST_MOVE_MS);
    expect(game.checkTimeout(10_000 + FIRST_MOVE_MS - 1).events).toEqual([]);

    const aborted = game.checkTimeout(10_000 + FIRST_MOVE_MS);
    expect(aborted.game.snapshot).toMatchObject({
      status: 'finished',
      termination: 'aborted',
      result: null,
    });
    expect(aborted.game.nextDeadline(50_000)).toBeNull();

    // Una jugada que llega tarde tampoco cuenta.
    const late = game.move(W, m('e2e4'), 10_000 + FIRST_MOVE_MS);
    expect(late.game.snapshot.termination).toBe('aborted');
    expect(late.game.plies).toBe(0);

    // Desde la primera jugada manda el reloj.
    const started = game.move(W, m('e2e4'), 20_000).game;
    expect(started.nextDeadline(20_000)).toBe(20_000 + 5 * 60_000);
  });

  it('abortar solo antes de que jueguen los dos', () => {
    const one = play(newGame(), ['e2e4']).game;
    expect(one.abort(B, 2000).game.snapshot).toMatchObject({
      termination: 'aborted',
      result: null,
    });

    const two = play(newGame(), ['e2e4', 'e7e5']).game;
    expect(errorCode(() => two.abort(W, 3000))).toBe('CANNOT_ABORT');
  });

  it('rendirse da la victoria al rival', () => {
    const { game } = newGame().resign(W, 0);
    expect(game.snapshot).toMatchObject({
      result: '0-1',
      termination: 'resignation',
    });
  });

  it('tablas: oferta, aceptación y rechazo', () => {
    const game = play(newGame(), ['e2e4']).game;
    const offered = game.offerDraw(B, 2000).game;
    expect(offered.snapshot.drawOfferBy).toBe('black');
    expect(errorCode(() => offered.acceptDraw(B, 2500))).toBe('NO_DRAW_OFFER');

    expect(offered.acceptDraw(W, 3000).game.snapshot).toMatchObject({
      result: '1/2-1/2',
      termination: 'agreement',
    });
    expect(offered.declineDraw(W).game.snapshot.drawOfferBy).toBeNull();
    // Jugar sin aceptar rechaza la oferta del rival; la propia sigue en pie.
    const whiteOffer = game.offerDraw(W, 2000).game;
    expect(
      whiteOffer.move(B, m('e7e5'), 3000).game.snapshot.drawOfferBy,
    ).toBeNull();
    expect(offered.move(B, m('e7e5'), 3000).game.snapshot.drawOfferBy).toBe(
      'black',
    );
    // Si los dos ofrecen, hay tablas.
    expect(offered.offerDraw(W, 3000).game.snapshot.termination).toBe(
      'agreement',
    );
  });

  it('triple repetición son tablas', () => {
    const { game } = play(newGame(), [
      'g1f3',
      'g8f6',
      'f3g1',
      'f6g8',
      'g1f3',
      'g8f6',
      'f3g1',
      'f6g8',
    ]);
    expect(game.snapshot).toMatchObject({
      result: '1/2-1/2',
      termination: 'repetition',
    });
  });

  it('promoción: hay que elegir la pieza', () => {
    const game = Game.restore({
      ...newGame().snapshot,
      pgn: '[SetUp "1"]\n[FEN "k7/4P3/8/8/8/8/8/K7 w - - 0 1"]\n\n*',
    });
    expect(errorCode(() => game.move(W, m('e7e8'), 0))).toBe('ILLEGAL_MOVE');
    const { events } = game.move(W, m('e7e8q'), 0);
    expect(events[0]).toMatchObject({ type: 'MoveMade', san: 'e8=Q+' });
  });

  it('se reconstruye igual desde su snapshot', () => {
    const { game } = play(newGame(), ['e2e4', 'e7e5', 'g1f3']);
    const restored = Game.restore(JSON.parse(JSON.stringify(game.snapshot)));
    expect(restored.fen).toBe(game.fen);
    expect(restored.move(B, m('b8c6'), 9000).game.plies).toBe(4);
  });
});
