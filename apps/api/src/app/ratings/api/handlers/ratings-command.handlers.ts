import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RecordRatingGameCommand } from '../../application/commands/ratings.commands';
import { RatingsUseCases } from '../../application/use-cases/ratings.use-cases';

@CommandHandler(RecordRatingGameCommand)
export class RecordRatingGameHandler implements ICommandHandler<
  RecordRatingGameCommand,
  Awaited<ReturnType<RatingsUseCases['recordGame']>>
> {
  constructor(private readonly useCase: RatingsUseCases) {}
  execute(message: RecordRatingGameCommand) {
    return this.useCase.recordGame(message.game);
  }
}

export const RATINGS_COMMAND_HANDLERS = [RecordRatingGameHandler];
