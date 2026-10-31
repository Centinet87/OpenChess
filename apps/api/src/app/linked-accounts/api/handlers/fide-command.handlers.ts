import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  LinkFideCommand,
  RefreshFideCommand,
  UnlinkFideCommand,
} from '../../application/commands/fide.commands';
import { FideUseCases } from '../../application/use-cases/fide.use-cases';

@CommandHandler(LinkFideCommand)
export class LinkFideHandler implements ICommandHandler<
  LinkFideCommand,
  Awaited<ReturnType<FideUseCases['link']>>
> {
  constructor(private readonly useCase: FideUseCases) {}
  execute(message: LinkFideCommand) {
    return this.useCase.link(
      message.clubId,
      message.admin,
      message.memberId,
      message.fideId,
    );
  }
}

@CommandHandler(UnlinkFideCommand)
export class UnlinkFideHandler implements ICommandHandler<
  UnlinkFideCommand,
  Awaited<ReturnType<FideUseCases['unlink']>>
> {
  constructor(private readonly useCase: FideUseCases) {}
  execute(message: UnlinkFideCommand) {
    return this.useCase.unlink(message.clubId, message.admin, message.memberId);
  }
}

@CommandHandler(RefreshFideCommand)
export class RefreshFideHandler implements ICommandHandler<
  RefreshFideCommand,
  Awaited<ReturnType<FideUseCases['refresh']>>
> {
  constructor(private readonly useCase: FideUseCases) {}
  execute(message: RefreshFideCommand) {
    return this.useCase.refresh(message.clubId, message.memberId);
  }
}

export const FIDE_COMMAND_HANDLERS = [
  LinkFideHandler,
  UnlinkFideHandler,
  RefreshFideHandler,
];
