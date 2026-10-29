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
} from './clubs.controller';
import { PrismaClubsRepository } from './prisma-clubs.repository';

@Module({
  imports: [IdentityModule],
  controllers: [ClubsController, ClubController, AcceptInvitationController],
  providers: [
    PrismaClubsRepository,
    ClubMemberGuard,
    { provide: APP_FILTER, useClass: ClubErrorFilter },
    {
      provide: ClubsUseCases,
      inject: [PrismaClubsRepository],
      useFactory: (repo: PrismaClubsRepository) =>
        new ClubsUseCases(
          repo,
          repo,
          {
            issue: () => {
              const token = generateOpaqueToken();
              return { token, hash: sha256(token) };
            },
            hash: sha256,
          },
          { now: () => new Date() },
        ),
    },
  ],
})
export class ClubsModule {}
