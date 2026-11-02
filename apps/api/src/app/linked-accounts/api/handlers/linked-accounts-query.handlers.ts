import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetImportedGameQuery,
  GetVerifiedAccountsQuery,
  ListImportedGamesQuery,
  ListLinkedAccountsQuery,
} from '../../application/queries/linked-accounts.queries';
import { LinkedAccountsUseCases } from '../../application/use-cases/linked-accounts.use-cases';

@QueryHandler(ListLinkedAccountsQuery)
export class ListLinkedAccountsHandler implements IQueryHandler<
  ListLinkedAccountsQuery,
  Awaited<ReturnType<LinkedAccountsUseCases['list']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: ListLinkedAccountsQuery) {
    return this.useCase.list(message.userId);
  }
}

@QueryHandler(GetVerifiedAccountsQuery)
export class GetVerifiedAccountsHandler implements IQueryHandler<
  GetVerifiedAccountsQuery,
  Awaited<ReturnType<LinkedAccountsUseCases['verifiedOf']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: GetVerifiedAccountsQuery) {
    return this.useCase.verifiedOf(message.userId);
  }
}

@QueryHandler(ListImportedGamesQuery)
export class ListImportedGamesHandler implements IQueryHandler<
  ListImportedGamesQuery,
  Awaited<ReturnType<LinkedAccountsUseCases['listImported']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: ListImportedGamesQuery) {
    return this.useCase.listImported(message.clubId, message.userId);
  }
}

@QueryHandler(GetImportedGameQuery)
export class GetImportedGameHandler implements IQueryHandler<
  GetImportedGameQuery,
  Awaited<ReturnType<LinkedAccountsUseCases['findImported']>>
> {
  constructor(private readonly useCase: LinkedAccountsUseCases) {}
  execute(message: GetImportedGameQuery) {
    return this.useCase.findImported(message.clubId, message.id);
  }
}

export const LINKED_ACCOUNTS_QUERY_HANDLERS = [
  ListLinkedAccountsHandler,
  GetVerifiedAccountsHandler,
  ListImportedGamesHandler,
  GetImportedGameHandler,
];
