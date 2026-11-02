import type { ImportedGameSnapshot } from '../../domain/entities/external-game';
import type { ImportedGamePublisher } from '../repositories/linked-accounts.ports';

export type ImportedGameListener = (game: ImportedGameSnapshot) => void;

export abstract class ImportedGames implements ImportedGamePublisher {
  abstract publish(game: ImportedGameSnapshot): void;
  abstract subscribe(listener: ImportedGameListener): () => void;
}
