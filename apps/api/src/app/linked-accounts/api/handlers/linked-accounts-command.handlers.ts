import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ImportGamesCommand,
  LinkVerifiedAccountCommand,
  RefreshLinkedAccountCommand,
  StartAccountVerificationCommand,
  UnlinkAccountCommand,
  VerifyLinkedAccountCommand,
} from '../../application/commands/linked-accounts.commands';
import { LinkedAccountsUseCases } from '../../application/use-cases/linked-accounts.use-cases';

@CommandHandler(LinkVerifiedAccountCommand)
export class LinkVerifiedAccountHandler implements ICommandHandler<
  LinkVerifiedAccountCommand,
  Awaited<ReturnType<LinkedAccountsUseCases['linkVerified']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: LinkVerifiedAccountCommand) {
    return this.useCase.linkVerified(
      message.userId,
      message.platform,
      message.username,
    );
  }
}

@CommandHandler(StartAccountVerificationCommand)
export class StartAccountVerificationHandler implements ICommandHandler<
  StartAccountVerificationCommand,
  Awaited<ReturnType<LinkedAccountsUseCases['startVerification']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: StartAccountVerificationCommand) {
    return this.useCase.startVerification(
      message.userId,
      message.platform,
      message.username,
    );
  }
}

@CommandHandler(VerifyLinkedAccountCommand)
export class VerifyLinkedAccountHandler implements ICommandHandler<
  VerifyLinkedAccountCommand,
  Awaited<ReturnType<LinkedAccountsUseCases['verify']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: VerifyLinkedAccountCommand) {
    return this.useCase.verify(message.userId, message.platform);
  }
}

@CommandHandler(UnlinkAccountCommand)
export class UnlinkAccountHandler implements ICommandHandler<
  UnlinkAccountCommand,
  Awaited<ReturnType<LinkedAccountsUseCases['unlink']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: UnlinkAccountCommand) {
    return this.useCase.unlink(message.userId, message.platform);
  }
}

@CommandHandler(RefreshLinkedAccountCommand)
export class RefreshLinkedAccountHandler implements ICommandHandler<
  RefreshLinkedAccountCommand,
  Awaited<ReturnType<LinkedAccountsUseCases['refresh']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: RefreshLinkedAccountCommand) {
    return this.useCase.refresh(message.userId, message.platform);
  }
}

@CommandHandler(ImportGamesCommand)
export class ImportGamesHandler implements ICommandHandler<
  ImportGamesCommand,
  Awaited<ReturnType<LinkedAccountsUseCases['importGames']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: ImportGamesCommand) {
    return this.useCase.importGames(
      message.clubId,
      message.userId,
      message.platform,
    );
  }
}

export const LINKED_ACCOUNTS_COMMAND_HANDLERS = [
  LinkVerifiedAccountHandler,
  StartAccountVerificationHandler,
  VerifyLinkedAccountHandler,
  UnlinkAccountHandler,
  RefreshLinkedAccountHandler,
  ImportGamesHandler,
];
