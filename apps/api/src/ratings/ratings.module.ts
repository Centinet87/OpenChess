import { Module } from '@nestjs/common';
import { Glicko2System, RatingsUseCases } from '@openchess/ratings';
import { GamesModule } from '../games/games.module';
import { AuthModule } from '../app/auth/auth.module';
import { LinkedAccountsModule } from '../linked-accounts/linked-accounts.module';
import { PrismaFideSeeds } from './prisma-fide-seeds';
import { PrismaRatingsRepository } from './prisma-ratings.repository';
import { RatingsController } from './ratings.controller';
import { RatingsListener } from './ratings.listener';

/** Ranking Glicko-2 por club. Se entera de las partidas por eventos: las del club y las importadas. */
@Module({
  imports: [AuthModule, GamesModule, LinkedAccountsModule],
  controllers: [RatingsController],
  providers: [
    PrismaRatingsRepository,
    PrismaFideSeeds,
    RatingsListener,
    {
      provide: RatingsUseCases,
      inject: [PrismaRatingsRepository, PrismaFideSeeds],
      useFactory: (repo: PrismaRatingsRepository, seeds: PrismaFideSeeds) =>
        new RatingsUseCases(repo, new Glicko2System(), seeds),
    },
  ],
})
export class RatingsModule {}
