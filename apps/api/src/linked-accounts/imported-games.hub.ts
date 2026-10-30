import { Injectable, Logger } from '@nestjs/common';
import type {
  ImportedGamePublisher,
  ImportedGameSnapshot,
} from '@openchess/linked-accounts';

export type ImportedGameListener = (game: ImportedGameSnapshot) => void;

/**
 * Sujeto del patrón Observer para las partidas importadas que cuentan para el
 * ranking. El ranking se suscribe sin que linked-accounts sepa que existe.
 */
@Injectable()
export class ImportedGamesHub implements ImportedGamePublisher {
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
