import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetFideQuery,
  ListFideQuery,
} from '../../application/queries/fide.queries';
import { FideUseCases } from '../../application/use-cases/fide.use-cases';

@QueryHandler(GetFideQuery)
export class GetFideHandler implements IQueryHandler<
  GetFideQuery,
  Awaited<ReturnType<FideUseCases['get']>>
> {
  constructor(private readonly useCase: FideUseCases) {}
  execute(message: GetFideQuery) {
    return this.useCase.get(message.clubId, message.memberId);
  }
}

@QueryHandler(ListFideQuery)
export class ListFideHandler implements IQueryHandler<
  ListFideQuery,
  Awaited<ReturnType<FideUseCases['list']>>
> {
  constructor(private readonly useCase: FideUseCases) {}
  execute(message: ListFideQuery) {
    return this.useCase.list(message.clubId);
  }
}

export const FIDE_QUERY_HANDLERS = [GetFideHandler, ListFideHandler];
