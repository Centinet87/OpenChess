import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetMembershipClubQuery,
  GetMembershipRoleQuery,
  IsClubMemberQuery,
} from '../../application/queries/membership.queries';
import { MembershipUseCases } from '../../application/use-cases/membership.use-cases';
import type { RoleGrant } from '../../domain/entities/role';

@QueryHandler(GetMembershipRoleQuery)
export class GetMembershipRoleHandler implements IQueryHandler<
  GetMembershipRoleQuery,
  RoleGrant | null
> {
  constructor(private readonly useCase: MembershipUseCases) {}
  execute(query: GetMembershipRoleQuery) {
    return this.useCase.role(query.clubId, query.userId);
  }
}

@QueryHandler(GetMembershipClubQuery)
export class GetMembershipClubHandler implements IQueryHandler<
  GetMembershipClubQuery,
  string | null
> {
  constructor(private readonly useCase: MembershipUseCases) {}
  execute(query: GetMembershipClubQuery) {
    return this.useCase.clubId(query.slug, query.userId);
  }
}

@QueryHandler(IsClubMemberQuery)
export class IsClubMemberHandler implements IQueryHandler<
  IsClubMemberQuery,
  boolean
> {
  constructor(private readonly useCase: MembershipUseCases) {}
  execute(query: IsClubMemberQuery) {
    return this.useCase.exists(query.clubId, query.userId);
  }
}

export const MEMBERSHIP_QUERY_HANDLERS = [
  GetMembershipRoleHandler,
  GetMembershipClubHandler,
  IsClubMemberHandler,
];
