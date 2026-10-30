import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetCurrentUserQuery,
  VerifyAccessTokenQuery,
} from '../../application/queries/auth.queries';
import { GetCurrentUserUseCase } from '../../application/use-cases/get-current-user.use-case';
import { VerifyAccessTokenUseCase } from '../../application/use-cases/verify-access-token.use-case';
import type { AccessTokenPayload } from '../../domain/auth.types';
import type { UserProfile } from '../../domain/entities/user.entity';

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler implements IQueryHandler<
  GetCurrentUserQuery,
  UserProfile
> {
  constructor(private readonly useCase: GetCurrentUserUseCase) {}

  execute(query: GetCurrentUserQuery): Promise<UserProfile> {
    return this.useCase.execute(query.userId);
  }
}

@QueryHandler(VerifyAccessTokenQuery)
export class VerifyAccessTokenHandler implements IQueryHandler<
  VerifyAccessTokenQuery,
  AccessTokenPayload
> {
  constructor(private readonly useCase: VerifyAccessTokenUseCase) {}

  execute(query: VerifyAccessTokenQuery): Promise<AccessTokenPayload> {
    return this.useCase.execute(query.accessToken);
  }
}

export const AUTH_QUERY_HANDLERS = [
  GetCurrentUserHandler,
  VerifyAccessTokenHandler,
];
