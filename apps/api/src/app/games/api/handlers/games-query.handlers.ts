import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetGameQuery,
  ListGamesQuery,
} from '../../application/queries/games.queries';
import { GamesUseCases } from '../../application/use-cases/games.use-cases';

@QueryHandler(GetGameQuery)
export class GetGameHandler implements IQueryHandler<
  GetGameQuery,
  Awaited<ReturnType<GamesUseCases['get']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: GetGameQuery) {
    return this.useCase.get(message.gameId);
  }
}

@QueryHandler(ListGamesQuery)
export class ListGamesHandler implements IQueryHandler<
  ListGamesQuery,
  Awaited<ReturnType<GamesUseCases['list']>>
> {
  constructor(private readonly useCase: GamesUseCases) {}
  execute(message: ListGamesQuery) {
    return this.useCase.list(message.clubId, message.statuses);
  }
}

export const GAMES_QUERY_HANDLERS = [GetGameHandler, ListGamesHandler];
