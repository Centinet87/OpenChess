import { Chess } from 'chess.js';
import { Clock, opposite, type ClockState, type Color } from './clock.js';
import { GameError } from './errors.js';
import {
  timeControl,
  type TimeControl,
  type TimeControlKind,
} from './time-control.js';

export type GameStatus = 'pending' | 'in_progress' | 'finished';
export type Result = '1-0' | '0-1' | '1/2-1/2';
export type Termination =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'repetition'
  | 'fifty_moves'
  | 'insufficient_material'
  | 'agreement'
  | 'aborted'
  | 'declined';

/** Jugada en notación de coordenadas: e2 → e4, con promoción opcional. */
export interface MoveInput {
  readonly from: string;
  readonly to: string;
  readonly promotion?: 'q' | 'r' | 'b' | 'n';
}

/** Lo que se guarda en la BD. Con esto se reconstruye la partida completa. */
export interface GameSnapshot {
  readonly id: string;
  readonly clubId: string;
  readonly whiteId: string;
  readonly blackId: string;
  /** Quién creó el desafío. El otro jugador es quien lo acepta. */
  readonly challengerId: string;
  readonly timeControl: {
    readonly kind: TimeControlKind;
    readonly initialMs: number;
    readonly incrementMs: number;
  };
  readonly pgn: string;
  readonly clock: ClockState;
  readonly drawOfferBy: Color | null;
  readonly status: GameStatus;
  /** null en una partida abortada o en curso. */
  readonly result: Result | null;
  readonly termination: Termination | null;
}

export type GameEvent =
  | { readonly type: 'GameStarted'; readonly gameId: string }
  | {
      readonly type: 'MoveMade';
      readonly gameId: string;
      readonly san: string;
      readonly fen: string;
      readonly whiteMs: number;
      readonly blackMs: number;
    }
  | {
      readonly type: 'DrawOffered';
      readonly gameId: string;
      readonly by: Color;
    }
  | { readonly type: 'DrawDeclined'; readonly gameId: string }
  | {
      readonly type: 'GameFinished';
      readonly gameId: string;
      readonly clubId: string;
      readonly whiteId: string;
      readonly blackId: string;
      readonly result: Result | null;
      readonly termination: Termination;
    };

export interface Outcome {
  readonly game: Game;
  readonly events: readonly GameEvent[];
}

const winnerResult = (winner: Color): Result =>
  winner === 'white' ? '1-0' : '0-1';

/**
 * Comportamiento de la partida según su estado (patrón State).
 * Cada estado decide qué comandos acepta.
 */
interface GameState {
  accept(game: Game, color: Color): Outcome;
  decline(game: Game, color: Color, now: number): Outcome;
  move(game: Game, color: Color, move: MoveInput, now: number): Outcome;
  resign(game: Game, color: Color, now: number): Outcome;
  abort(game: Game, color: Color, now: number): Outcome;
  offerDraw(game: Game, color: Color, now: number): Outcome;
  acceptDraw(game: Game, color: Color, now: number): Outcome;
  declineDraw(game: Game, color: Color): Outcome;
  checkTimeout(game: Game, now: number): Outcome;
}

const notStarted = (): never => {
  throw new GameError('NOT_STARTED', 'El rival todavía no acepta el desafío');
};

/** Desafío enviado, esperando que el rival lo acepte. */
const pending: GameState = {
  accept(game, color) {
    if (game.colorOf(game.snapshot.challengerId) === color) {
      throw new GameError(
        'CANNOT_ACCEPT_OWN',
        'No puedes aceptar tu propio desafío',
      );
    }
    return {
      game: game.with({ status: 'in_progress' }),
      events: [{ type: 'GameStarted', gameId: game.id }],
    };
  },
  // Lo rechaza el rival o lo cancela quien desafió.
  decline(game, _color, now) {
    return game.finish(null, 'declined', now);
  },
  move: notStarted,
  resign: notStarted,
  abort: notStarted,
  offerDraw: notStarted,
  acceptDraw: notStarted,
  declineDraw: notStarted,
  checkTimeout: (game) => ({ game, events: [] }),
};

const alreadyStarted = (): never => {
  throw new GameError('ALREADY_STARTED', 'La partida ya empezó');
};

const inProgress: GameState = {
  accept: alreadyStarted,
  decline: alreadyStarted,
  move(game, color, move, now) {
    const board = game.board();
    if (board.turn() !== color[0]) {
      throw new GameError('NOT_YOUR_TURN', 'No es tu turno');
    }
    const flagged = game.clock.flagged(now);
    if (flagged) return game.finishByTimeout(flagged, now);

    let san: string;
    try {
      san = board.move(move).san;
    } catch {
      throw new GameError('ILLEGAL_MOVE', 'Jugada ilegal');
    }

    // La primera jugada de las blancas no se cronometra; desde ahí corre el reloj.
    const plies = board.history().length;
    const clock =
      plies === 1
        ? game.clock.start('black', now)
        : game.clock.press(color, now);
    // Mover sin aceptar rechaza la oferta del rival; la oferta propia sigue en pie.
    const drawOfferBy =
      game.snapshot.drawOfferBy === opposite(color)
        ? null
        : game.snapshot.drawOfferBy;

    const moved = game.with({
      pgn: board.pgn(),
      clock: clock.state,
      drawOfferBy,
    });
    const moveEvent: GameEvent = {
      type: 'MoveMade',
      gameId: game.id,
      san,
      fen: board.fen(),
      whiteMs: clock.remaining('white', now),
      blackMs: clock.remaining('black', now),
    };

    const end = endOfGame(board, color);
    if (!end) return { game: moved, events: [moveEvent] };
    const finished = moved.finish(end.result, end.termination, now);
    return { game: finished.game, events: [moveEvent, ...finished.events] };
  },

  resign(game, color, now) {
    return game.finish(winnerResult(opposite(color)), 'resignation', now);
  },

  abort(game, _color, now) {
    // Se puede abortar mientras alguno de los dos no haya jugado.
    if (game.plies >= 2) {
      throw new GameError(
        'CANNOT_ABORT',
        'Ya jugaron los dos: hay que rendirse o pedir tablas',
      );
    }
    return game.finish(null, 'aborted', now);
  },

  offerDraw(game, color, now) {
    if (game.snapshot.drawOfferBy === opposite(color)) {
      return game.finish('1/2-1/2', 'agreement', now);
    }
    if (game.snapshot.drawOfferBy === color) return { game, events: [] };
    return {
      game: game.with({ drawOfferBy: color }),
      events: [{ type: 'DrawOffered', gameId: game.id, by: color }],
    };
  },

  acceptDraw(game, color, now) {
    if (game.snapshot.drawOfferBy !== opposite(color)) {
      throw new GameError(
        'NO_DRAW_OFFER',
        'No hay una oferta de tablas del rival',
      );
    }
    return game.finish('1/2-1/2', 'agreement', now);
  },

  declineDraw(game, color) {
    if (game.snapshot.drawOfferBy !== opposite(color)) {
      throw new GameError(
        'NO_DRAW_OFFER',
        'No hay una oferta de tablas del rival',
      );
    }
    return {
      game: game.with({ drawOfferBy: null }),
      events: [{ type: 'DrawDeclined', gameId: game.id }],
    };
  },

  checkTimeout(game, now) {
    const flagged = game.clock.flagged(now);
    return flagged ? game.finishByTimeout(flagged, now) : { game, events: [] };
  },
};

const over = (): never => {
  throw new GameError('GAME_OVER', 'La partida ya terminó');
};

const finished: GameState = {
  accept: over,
  decline: over,
  move: over,
  resign: over,
  abort: over,
  offerDraw: over,
  acceptDraw: over,
  declineDraw: over,
  checkTimeout: (game) => ({ game, events: [] }),
};

const STATES: Record<GameStatus, GameState> = {
  pending,
  in_progress: inProgress,
  finished,
};

/** Fin de partida por las reglas, justo después de que `mover` jugó. */
function endOfGame(
  board: Chess,
  mover: Color,
): { result: Result; termination: Termination } | null {
  if (board.isCheckmate())
    return { result: winnerResult(mover), termination: 'checkmate' };
  if (board.isStalemate())
    return { result: '1/2-1/2', termination: 'stalemate' };
  if (board.isInsufficientMaterial()) {
    return { result: '1/2-1/2', termination: 'insufficient_material' };
  }
  if (board.isThreefoldRepetition())
    return { result: '1/2-1/2', termination: 'repetition' };
  if (board.isDrawByFiftyMoves())
    return { result: '1/2-1/2', termination: 'fifty_moves' };
  return null;
}

/**
 * Sin rey y una sola pieza menor (o solo el rey) no se puede dar mate.
 * shortcut: no detecta posiciones raras donde igual hay mate posible (p. ej. con peones del rival).
 */
function canMate(board: Chess, color: Color): boolean {
  const pieces = board
    .board()
    .flat()
    .filter((sq) => sq !== null && sq.color === color[0] && sq.type !== 'k');
  if (pieces.length === 0) return false;
  return !(
    pieces.length === 1 &&
    (pieces[0]?.type === 'n' || pieces[0]?.type === 'b')
  );
}

/** Partida de ajedrez. Inmutable: cada comando devuelve una partida nueva y sus eventos. */
export class Game {
  private constructor(
    readonly snapshot: GameSnapshot,
    private readonly control: TimeControl,
  ) {}

  /** Un miembro desafía a otro. La partida empieza cuando el rival acepta. */
  static challenge(input: {
    id: string;
    clubId: string;
    whiteId: string;
    blackId: string;
    challengerId: string;
    timeControl: TimeControl;
  }): Game {
    if (
      input.challengerId !== input.whiteId &&
      input.challengerId !== input.blackId
    ) {
      throw new GameError(
        'NOT_A_PLAYER',
        'Quien desafía tiene que jugar la partida',
      );
    }
    if (input.whiteId === input.blackId) {
      throw new GameError('SAME_PLAYER', 'No se puede jugar contra uno mismo');
    }
    return new Game(
      {
        id: input.id,
        clubId: input.clubId,
        whiteId: input.whiteId,
        blackId: input.blackId,
        challengerId: input.challengerId,
        timeControl: {
          kind: input.timeControl.kind,
          initialMs: input.timeControl.initialMs,
          incrementMs: input.timeControl.incrementMs,
        },
        pgn: '',
        clock: Clock.initial(input.timeControl).state,
        drawOfferBy: null,
        status: 'pending',
        result: null,
        termination: null,
      },
      input.timeControl,
    );
  }

  static restore(snapshot: GameSnapshot): Game {
    const { kind, initialMs, incrementMs } = snapshot.timeControl;
    return new Game(
      snapshot,
      timeControl(initialMs / 60_000, incrementMs / 1000, kind),
    );
  }

  get id(): string {
    return this.snapshot.id;
  }

  get clock(): Clock {
    return Clock.restore(this.snapshot.clock, this.control);
  }

  get plies(): number {
    return this.board().history().length;
  }

  get fen(): string {
    return this.board().fen();
  }

  colorOf(userId: string): Color | null {
    if (userId === this.snapshot.whiteId) return 'white';
    if (userId === this.snapshot.blackId) return 'black';
    return null;
  }

  accept(userId: string): Outcome {
    return this.state.accept(this, this.player(userId));
  }

  decline(userId: string, now: number): Outcome {
    return this.state.decline(this, this.player(userId), now);
  }

  move(userId: string, move: MoveInput, now: number): Outcome {
    return this.state.move(this, this.player(userId), move, now);
  }

  resign(userId: string, now: number): Outcome {
    return this.state.resign(this, this.player(userId), now);
  }

  abort(userId: string, now: number): Outcome {
    return this.state.abort(this, this.player(userId), now);
  }

  offerDraw(userId: string, now: number): Outcome {
    return this.state.offerDraw(this, this.player(userId), now);
  }

  acceptDraw(userId: string, now: number): Outcome {
    return this.state.acceptDraw(this, this.player(userId), now);
  }

  declineDraw(userId: string): Outcome {
    return this.state.declineDraw(this, this.player(userId));
  }

  /** Lo llama el servidor cuando vence un reloj, aunque nadie haya jugado. */
  checkTimeout(now: number): Outcome {
    return this.state.checkTimeout(this, now);
  }

  /** @internal Lo usan los estados. */
  board(): Chess {
    const board = new Chess();
    if (this.snapshot.pgn) board.loadPgn(this.snapshot.pgn);
    return board;
  }

  /** @internal */
  with(changes: Partial<GameSnapshot>): Game {
    return new Game({ ...this.snapshot, ...changes }, this.control);
  }

  /** @internal */
  finish(
    result: Result | null,
    termination: Termination,
    now: number,
  ): Outcome {
    const game = this.with({
      status: 'finished',
      result,
      termination,
      drawOfferBy: null,
      clock: this.clock.stop(now).state,
    });
    const { id, clubId, whiteId, blackId } = this.snapshot;
    return {
      game,
      events: [
        {
          type: 'GameFinished',
          gameId: id,
          clubId,
          whiteId,
          blackId,
          result,
          termination,
        },
      ],
    };
  }

  /** @internal Si al ganador no le alcanza el material para dar mate, son tablas. */
  finishByTimeout(flagged: Color, now: number): Outcome {
    const winner = opposite(flagged);
    return canMate(this.board(), winner)
      ? this.finish(winnerResult(winner), 'timeout', now)
      : this.finish('1/2-1/2', 'insufficient_material', now);
  }

  private get state(): GameState {
    return STATES[this.snapshot.status];
  }

  private player(userId: string): Color {
    const color = this.colorOf(userId);
    if (!color) throw new GameError('NOT_A_PLAYER', 'No juegas esta partida');
    return color;
  }
}
