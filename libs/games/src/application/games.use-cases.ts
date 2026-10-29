import { GameError } from '../domain/errors.js';
import {
  Game,
  type GameSnapshot,
  type GameStatus,
  type MoveInput,
  type Outcome,
} from '../domain/game.js';
import { parseTimeControl } from '../domain/time-control.js';
import type { GamesDeps } from './ports.js';

export type ColorChoice = 'white' | 'black' | 'random';

/** Si dos comandos chocan (una jugada y el vencimiento del reloj), se reintenta con la versión nueva. */
const MAX_ATTEMPTS = 3;
const LIST_LIMIT = 50;

export class GamesUseCases {
  constructor(private readonly deps: GamesDeps) {}

  async challenge(
    clubId: string,
    challengerId: string,
    input: { opponentId: string; timeControl: string; color: ColorChoice },
  ): Promise<GameSnapshot> {
    const control = parseTimeControl(input.timeControl);
    if (!(await this.deps.members.isMember(clubId, input.opponentId))) {
      throw new GameError(
        'OPPONENT_NOT_MEMBER',
        'El rival no es miembro del club o su rol no le permite jugar',
      );
    }
    const challengerIsWhite =
      input.color === 'random'
        ? this.deps.random() < 0.5
        : input.color === 'white';

    const game = Game.challenge({
      id: this.deps.newId(),
      clubId,
      challengerId,
      whiteId: challengerIsWhite ? challengerId : input.opponentId,
      blackId: challengerIsWhite ? input.opponentId : challengerId,
      timeControl: control,
    });
    await this.deps.games.insert(game.snapshot);
    return game.snapshot;
  }

  async get(gameId: string): Promise<GameSnapshot> {
    return (await this.load(gameId)).snapshot;
  }

  list(
    clubId: string,
    statuses: readonly GameStatus[],
  ): Promise<GameSnapshot[]> {
    return this.deps.games.list(clubId, statuses, LIST_LIMIT);
  }

  accept(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g) => g.accept(userId));
  }

  decline(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.decline(userId, now));
  }

  move(gameId: string, userId: string, move: MoveInput): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.move(userId, move, now));
  }

  resign(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.resign(userId, now));
  }

  abort(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.abort(userId, now));
  }

  offerDraw(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.offerDraw(userId, now));
  }

  acceptDraw(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.acceptDraw(userId, now));
  }

  declineDraw(gameId: string, userId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g) => g.declineDraw(userId));
  }

  /** Lo llama el reloj del servidor. No hace nada si nadie se quedó sin tiempo. */
  checkTimeout(gameId: string): Promise<GameSnapshot> {
    return this.run(gameId, (g, now) => g.checkTimeout(now));
  }

  private async load(gameId: string) {
    const stored = await this.deps.games.find(gameId);
    if (!stored) throw new GameError('GAME_NOT_FOUND', 'Partida no encontrada');
    return stored;
  }

  /** Carga, aplica el comando, guarda con control de versión y publica los eventos. */
  private async run(
    gameId: string,
    command: (game: Game, now: number) => Outcome,
  ): Promise<GameSnapshot> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const stored = await this.load(gameId);
      const { game, events } = command(
        Game.restore(stored.snapshot),
        this.deps.now(),
      );
      if (events.length === 0 && game.snapshot === stored.snapshot)
        return game.snapshot;

      if (await this.deps.games.update(game.snapshot, stored.version)) {
        this.deps.publisher.publish(game.snapshot, events);
        return game.snapshot;
      }
    }
    throw new GameError(
      'CONFLICT',
      'La partida cambió mientras jugabas; vuelve a intentarlo',
    );
  }
}
