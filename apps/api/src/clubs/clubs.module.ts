import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ClubsUseCases } from '@openchess/clubs';
import { generateOpaqueToken, sha256 } from '../identity/crypto';
import { IdentityModule } from '../identity/identity.module';
import { ClubErrorFilter } from './club-error.filter';
import { ClubMemberGuard } from './club-member.guard';
import {
  AcceptInvitationController,
  ClubController,
  ClubsController,
  RolesController,
} from './clubs.controller';
import { PrismaClubsRepository } from './prisma-clubs.repository';

@Module({
  imports: [IdentityModule],
  controllers: [
    ClubsController,
    ClubController,
    RolesController,
    AcceptInvitationController,
  ],
  providers: [
    PrismaClubsRepository,
    ClubMemberGuard,
    { provide: APP_FILTER, useClass: ClubErrorFilter },
    {
      provide: ClubsUseCases,
      inject: [PrismaClubsRepository],
      useFactory: (repo: PrismaClubsRepository) =>
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
        }),
    },
  ],
})
export class ClubsModule {}
