import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetCurrentUserQuery,
  VerifyAccessTokenQuery,
  ExportAccountQuery,
} from '../../application/queries/auth.queries';
import { GetCurrentUserUseCase } from '../../application/use-cases/get-current-user.use-case';
import { VerifyAccessTokenUseCase } from '../../application/use-cases/verify-access-token.use-case';
import type { AccessTokenPayload } from '../../domain/auth.types';
import type { UserProfile } from '../../domain/entities/user.entity';
import { AccountOperations } from '../../application/repositories/account.operations';
import type { AccountData } from '../../domain/entities/account-data.entity';

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

@QueryHandler(ExportAccountQuery)
export class ExportAccountHandler implements IQueryHandler<
  ExportAccountQuery,
  AccountData
> {
  constructor(private readonly account: AccountOperations) {}
  execute(query: ExportAccountQuery): Promise<AccountData> {
    return this.account.export(query.userId);
  }
}

export const AUTH_QUERY_HANDLERS = [
  GetCurrentUserHandler,
  VerifyAccessTokenHandler,
  ExportAccountHandler,
];
