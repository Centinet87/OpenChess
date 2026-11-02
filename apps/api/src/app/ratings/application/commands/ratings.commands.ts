import type { FinishedGame } from '../use-cases/ratings.use-cases';

export class RecordRatingGameCommand {
  constructor(readonly game: FinishedGame) {}
}
