import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetMyClubRoleQuery,
  ListClubMembersQuery,
  ListClubRolesQuery,
  ListMyClubsQuery,
} from '../../application/queries/clubs.queries';
import { ClubsUseCases } from '../../application/use-cases/clubs.use-cases';

@QueryHandler(ListMyClubsQuery)
export class ListMyClubsHandler implements IQueryHandler<
  ListMyClubsQuery,
  Awaited<ReturnType<ClubsUseCases['listMyClubs']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: ListMyClubsQuery) {
    return this.useCase.listMyClubs(message.userId);
  }
}

@QueryHandler(ListClubMembersQuery)
export class ListClubMembersHandler implements IQueryHandler<
  ListClubMembersQuery,
  Awaited<ReturnType<ClubsUseCases['listMembers']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: ListClubMembersQuery) {
    return this.useCase.listMembers(message.clubId);
  }
}

@QueryHandler(ListClubRolesQuery)
export class ListClubRolesHandler implements IQueryHandler<
  ListClubRolesQuery,
  Awaited<ReturnType<ClubsUseCases['listRoles']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: ListClubRolesQuery) {
    return this.useCase.listRoles(message.clubId);
  }
}

@QueryHandler(GetMyClubRoleQuery)
export class GetMyClubRoleHandler implements IQueryHandler<
  GetMyClubRoleQuery,
  Awaited<ReturnType<ClubsUseCases['myRole']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: GetMyClubRoleQuery) {
    return this.useCase.myRole(message.clubId, message.userId);
  }
}

export const CLUBS_QUERY_HANDLERS = [
  ListMyClubsHandler,
  ListClubMembersHandler,
  ListClubRolesHandler,
  GetMyClubRoleHandler,
];
