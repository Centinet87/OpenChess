import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Game, GamesUseCases, type GameSnapshot } from '@openchess/games';
import { ClsService } from 'nestjs-cls';
import { GameEventsHub } from './game-events.hub';

/** Margen para no disparar un poco antes de que el reloj llegue a cero. */
const SLACK_MS = 50;

/**
 * Cierra por tiempo las partidas aunque nadie mande una jugada: agenda un timer
 * para el momento exacto en que se acaba el reloj que corre.
 *
 * shortcut: los timers viven en memoria de esta instancia. Si el proceso se
 * reinicia se pierden, aunque la partida igual se cierra en la próxima jugada o
 * al unirse alguien (checkTimeout). Con varias instancias, pasar a una cola (BullMQ).
 */
@Injectable()
export class GameClockScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameClockScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private unsubscribe?: () => void;

  constructor(
    private readonly hub: GameEventsHub,
    private readonly games: GamesUseCases,
    private readonly cls: ClsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.hub.subscribe((game) => this.schedule(game));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  schedule(game: GameSnapshot): void {
    this.cancel(game.id);
    const running = game.clock.running;
    if (game.status !== 'in_progress' || !running) return;

    const remaining = Game.restore(game).clock.remaining(running, Date.now());
    const timer = setTimeout(() => void this.fire(game), remaining + SLACK_MS);
    timer.unref();
    this.timers.set(game.id, timer);
  }

  private cancel(gameId: string): void {
    clearTimeout(this.timers.get(gameId));
    this.timers.delete(gameId);
  }

  private async fire(game: GameSnapshot): Promise<void> {
    this.timers.delete(game.id);
    try {
      await this.cls.run(async () => {
        this.cls.set('clubId', game.clubId);
        await this.games.checkTimeout(game.id);
      });
    } catch (error) {
      this.logger.error(
        `No se pudo cerrar por tiempo la partida ${game.id}`,
        error,
      );
    }
  }
}
