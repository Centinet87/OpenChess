import { Injectable, Logger } from '@nestjs/common';
import {
  GameEvents,
  type GameEventListener,
} from '../../application/events/game.events';
import type { GameEvent, GameSnapshot } from '../../domain/entities/game';

/**
 * Sujeto del patrón Observer. Los casos de uso publican aquí; el gateway, el
 * reloj del servidor y (en la Fase 3) el ranking se suscriben.
 */
@Injectable()
export class GameEventsHub extends GameEvents {
  private readonly logger = new Logger(GameEventsHub.name);
  private readonly listeners = new Set<GameEventListener>();

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(game: GameSnapshot, events: readonly GameEvent[]): void {
    for (const listener of this.listeners) {
      // Un suscriptor que falla no puede romper la jugada ni a los demás suscriptores.
      try {
        listener(game, events);
      } catch (error) {
        this.logger.error(
          `Falló un suscriptor de la partida ${game.id}`,
          error,
        );
      }
    }
  }
}
