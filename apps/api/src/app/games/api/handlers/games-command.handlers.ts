import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  AbortGameCommand,
  AcceptGameCommand,
  AcceptGameDrawCommand,
  ChallengeGameCommand,
  CheckGameTimeoutCommand,
  DeclineGameCommand,
  DeclineGameDrawCommand,
  MoveGameCommand,
  OfferGameDrawCommand,
  ResignGameCommand,
} from '../../application/commands/games.commands';
import { GamesUseCases } from '../../application/use-cases/games.use-cases';

@CommandHandler(ChallengeGameCommand)
export class ChallengeGameHandler implements ICommandHandler<
  ChallengeGameCommand,
  Awaited<ReturnType<GamesUseCases['challenge']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: ChallengeGameCommand) {
    return this.useCase.challenge(
      message.clubId,
      message.challengerId,
      message.input,
    );
  }
}

@CommandHandler(AcceptGameCommand)
export class AcceptGameHandler implements ICommandHandler<
  AcceptGameCommand,
  Awaited<ReturnType<GamesUseCases['accept']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: AcceptGameCommand) {
    return this.useCase.accept(message.gameId, message.userId);
  }
}

@CommandHandler(DeclineGameCommand)
export class DeclineGameHandler implements ICommandHandler<
  DeclineGameCommand,
  Awaited<ReturnType<GamesUseCases['decline']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: DeclineGameCommand) {
    return this.useCase.decline(message.gameId, message.userId);
  }
}

@CommandHandler(MoveGameCommand)
export class MoveGameHandler implements ICommandHandler<
  MoveGameCommand,
  Awaited<ReturnType<GamesUseCases['move']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: MoveGameCommand) {
    return this.useCase.move(message.gameId, message.userId, message.move);
  }
}

@CommandHandler(ResignGameCommand)
export class ResignGameHandler implements ICommandHandler<
  ResignGameCommand,
  Awaited<ReturnType<GamesUseCases['resign']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: ResignGameCommand) {
    return this.useCase.resign(message.gameId, message.userId);
  }
}

@CommandHandler(AbortGameCommand)
export class AbortGameHandler implements ICommandHandler<
  AbortGameCommand,
  Awaited<ReturnType<GamesUseCases['abort']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: AbortGameCommand) {
    return this.useCase.abort(message.gameId, message.userId);
  }
}

@CommandHandler(OfferGameDrawCommand)
export class OfferGameDrawHandler implements ICommandHandler<
  OfferGameDrawCommand,
  Awaited<ReturnType<GamesUseCases['offerDraw']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: OfferGameDrawCommand) {
    return this.useCase.offerDraw(message.gameId, message.userId);
  }
}

@CommandHandler(AcceptGameDrawCommand)
export class AcceptGameDrawHandler implements ICommandHandler<
  AcceptGameDrawCommand,
  Awaited<ReturnType<GamesUseCases['acceptDraw']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: AcceptGameDrawCommand) {
    return this.useCase.acceptDraw(message.gameId, message.userId);
  }
}

@CommandHandler(DeclineGameDrawCommand)
export class DeclineGameDrawHandler implements ICommandHandler<
  DeclineGameDrawCommand,
  Awaited<ReturnType<GamesUseCases['declineDraw']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: DeclineGameDrawCommand) {
    return this.useCase.declineDraw(message.gameId, message.userId);
  }
}

@CommandHandler(CheckGameTimeoutCommand)
export class CheckGameTimeoutHandler implements ICommandHandler<
  CheckGameTimeoutCommand,
  Awaited<ReturnType<GamesUseCases['checkTimeout']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: CheckGameTimeoutCommand) {
    return this.useCase.checkTimeout(message.gameId);
  }
}

export const GAMES_COMMAND_HANDLERS = [
  ChallengeGameHandler,
  AcceptGameHandler,
  DeclineGameHandler,
  MoveGameHandler,
  ResignGameHandler,
  AbortGameHandler,
  OfferGameDrawHandler,
  AcceptGameDrawHandler,
  DeclineGameDrawHandler,
  CheckGameTimeoutHandler,
];
