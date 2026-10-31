import { Injectable, Logger } from '@nestjs/common';
import {
  ImportedGames,
  type ImportedGameListener,
} from '../../application/events/imported-games.events';
import type { ImportedGameSnapshot } from '../../domain/entities/external-game';

/**
 * Sujeto del patrón Observer para las partidas importadas que cuentan para el
 * ranking. El ranking se suscribe sin que linked-accounts sepa que existe.
 */
@Injectable()
export class ImportedGamesHub extends ImportedGames {
  private readonly logger = new Logger(ImportedGamesHub.name);
  private readonly listeners = new Set<ImportedGameListener>();

  subscribe(listener: ImportedGameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(game: ImportedGameSnapshot): void {
    for (const listener of this.listeners) {
      try {
        listener(game);
      } catch (error) {
        this.logger.error(
          `Falló un suscriptor de la partida importada ${game.id}`,
          error,
        );
      }
    }
  }
}
