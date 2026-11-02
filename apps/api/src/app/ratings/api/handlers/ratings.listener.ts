import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { GameEvents } from '../../../games/application/events/game.events';
import { ImportedGames } from '../../../linked-accounts/application/events/imported-games.events';
import { RecordRatingGameCommand } from '../../application/commands/ratings.commands';
import type { RatedGame } from '../../application/repositories/ratings.ports';
import { type FinishedGame } from '../../application/use-cases/ratings.use-cases';

/**
 * Observer de GameFinished y de las partidas importadas de Lichess o Chess.com:
 * actualiza el ranking del club sin que `games` ni `linked-accounts` sepan que
 * existe. Corre aparte de la jugada, así que un error aquí no la rompe.
 *
 * Limitación: las partidas de un mismo club se cuentan de a una, en orden, con una
 * cola en memoria; así dos partidas que terminan a la vez no pisan el rating del
 * mismo jugador. Con varias instancias, pasar a una cola compartida (BullMQ).
 */
@Injectable()
export class RatingsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RatingsListener.name);
  private readonly queues = new Map<string, Promise<void>>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly commands: CommandBus,
    private readonly hub: GameEvents,
    private readonly imports: ImportedGames,
    private readonly cls: ClsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe.push(
      this.hub.subscribe((_game, events) => {
        for (const event of events) {
          if (event.type === 'GameFinished') this.enqueue(event);
        }
      }),
      this.imports.subscribe((game) => {
        // countsForRanking ya exige los dos miembros y un resultado.
        if (!game.whiteUserId || !game.blackUserId) return;
        this.enqueue({
          gameId: game.id,
          clubId: game.clubId,
          whiteId: game.whiteUserId,
          blackId: game.blackUserId,
          result: game.result,
        });
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe.forEach((off) => off());
    await this.idle();
  }

  /** Espera a que se cuenten las partidas pendientes. */
  async idle(): Promise<void> {
    await Promise.all(this.queues.values());
  }

  private enqueue(event: FinishedGame): void {
    const previous = this.queues.get(event.clubId) ?? Promise.resolve();
    const next = previous.then(() => this.record(event));
    this.queues.set(event.clubId, next);
    void next.then(() => {
      if (this.queues.get(event.clubId) === next)
        this.queues.delete(event.clubId);
    });
  }

  private async record(event: FinishedGame): Promise<void> {
    try {
      await this.cls.run(async () => {
        this.cls.set('clubId', event.clubId);
        await this.commands.execute<RecordRatingGameCommand, RatedGame | null>(
          new RecordRatingGameCommand(event),
        );
      });
    } catch (error) {
      this.logger.error(
        `No se pudo actualizar el ranking con la partida ${event.gameId}`,
        error,
      );
    }
  }
}
