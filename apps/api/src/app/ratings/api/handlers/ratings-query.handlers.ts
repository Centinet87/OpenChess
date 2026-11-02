import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetRatingProfileQuery,
  GetStandingsQuery,
} from '../../application/queries/ratings.queries';
import { RatingsUseCases } from '../../application/use-cases/ratings.use-cases';

@QueryHandler(GetStandingsQuery)
export class GetStandingsHandler implements IQueryHandler<
  GetStandingsQuery,
  Awaited<ReturnType<RatingsUseCases['standings']>>
> {
  constructor(private readonly useCase: RatingsUseCases) {}
  execute(message: GetStandingsQuery) {
    return this.useCase.standings(message.clubId);
  }
}

@QueryHandler(GetRatingProfileQuery)
export class GetRatingProfileHandler implements IQueryHandler<
  GetRatingProfileQuery,
  Awaited<ReturnType<RatingsUseCases['profile']>>
> {
  constructor(private readonly useCase: RatingsUseCases) {}
  execute(message: GetRatingProfileQuery) {
    return this.useCase.profile(message.clubId, message.userId);
  }
}

export const RATINGS_QUERY_HANDLERS = [
  GetStandingsHandler,
  GetRatingProfileHandler,
];
