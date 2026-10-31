import type { GameEvent, GameSnapshot } from '../../domain/entities/game';
import type { GameEventPublisher } from '../repositories/games.ports';

export type GameEventListener = (
  game: GameSnapshot,
  events: readonly GameEvent[],
) => void;

export abstract class GameEvents implements GameEventPublisher {
  abstract publish(game: GameSnapshot, events: readonly GameEvent[]): void;
  abstract subscribe(listener: GameEventListener): () => void;
}
