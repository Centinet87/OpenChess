import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BillingUseCases } from '@openchess/billing';
import { ClubsUseCases } from '@openchess/clubs';
import { BillingModule } from '../billing/billing.module';
import {
  generateOpaqueToken,
  sha256,
} from '../app/auth/infrastructure/security/crypto';
import { AuthModule } from '../app/auth/auth.module';
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
  imports: [AuthModule, BillingModule],
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
      inject: [PrismaClubsRepository, BillingUseCases],
      useFactory: (repo: PrismaClubsRepository, billing: BillingUseCases) =>
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
          limits: { maxMembers: (clubId) => billing.maxMembers(clubId) },
        }),
    },
  ],
})
export class ClubsModule {}
