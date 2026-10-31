import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { QueryBus } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { GetMemberLimitQuery } from '../billing/application/queries/billing.queries';
import { CLUBS_COMMAND_HANDLERS } from './api/handlers/clubs-command.handlers';
import { CLUBS_QUERY_HANDLERS } from './api/handlers/clubs-query.handlers';
import { MEMBERSHIP_QUERY_HANDLERS } from './api/handlers/membership-query.handlers';
import { MembershipUseCases } from './application/use-cases/membership.use-cases';
import { PrismaMembershipRepository } from './infrastructure/repositories/prisma-membership.repository';

import { AuthModule } from '../auth/auth.module';
import { generateOpaqueToken, sha256 } from '../infrastructure/security/crypto';
import { BillingModule } from '../billing/billing.module';
import { AcceptInvitationController } from './api/controllers/accept-invitation.controller';
import { ClubController } from './api/controllers/club.controller';
import { ClubsController } from './api/controllers/clubs.controller';
import { RolesController } from './api/controllers/roles.controller';
import { ClubErrorFilter } from './api/filters/club-error.filter';
import { ClubMemberGuard } from './api/guards/club-member.guard';
import { ClubsUseCases } from './application/use-cases/clubs.use-cases';
import { PrismaClubsRepository } from './infrastructure/repositories/prisma-clubs.repository';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [
    ClubsController,
    ClubController,
    RolesController,
    AcceptInvitationController,
  ],
  providers: [
    ...MEMBERSHIP_QUERY_HANDLERS,
    PrismaMembershipRepository,
    {
      provide: MembershipUseCases,
      inject: [PrismaMembershipRepository],
      useFactory: (repository: PrismaMembershipRepository) =>
        new MembershipUseCases(repository),
    },
    ...CLUBS_QUERY_HANDLERS,
    ...CLUBS_COMMAND_HANDLERS,
    PrismaClubsRepository,
    ClubMemberGuard,
    { provide: APP_FILTER, useClass: ClubErrorFilter },
    {
      provide: ClubsUseCases,
      inject: [PrismaClubsRepository, QueryBus],
      useFactory: (repo: PrismaClubsRepository, queries: QueryBus) =>
        new ClubsUseCases({
          clubs: repo,
          roles: repo,
          invitations: repo,
          tokens: {
            issue: () => {
              const token = generateOpaqueToken();
              return { token, hash: sha256(token) };
            },
            hash: sha256,
          },
          clock: { now: () => new Date() },
          newId: randomUUID,
          limits: {
            maxMembers: (clubId) =>
              queries.execute<GetMemberLimitQuery, number | null>(
                new GetMemberLimitQuery(clubId),
              ),
          },
        }),
    },
  ],
})
export class ClubsModule {}
