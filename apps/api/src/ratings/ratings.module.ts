import { Module } from '@nestjs/common';
import { Glicko2System, RatingsUseCases } from '@openchess/ratings';
import { GamesModule } from '../games/games.module';
import { IdentityModule } from '../identity/identity.module';
import { PrismaRatingsRepository } from './prisma-ratings.repository';
import { RatingsController } from './ratings.controller';
import { RatingsListener } from './ratings.listener';

/** Ranking Glicko-2 por club. Se entera de las partidas por el evento GameFinished. */
@Module({
  imports: [IdentityModule, GamesModule],
  controllers: [RatingsController],
  providers: [
    PrismaRatingsRepository,
    RatingsListener,
    {
      provide: RatingsUseCases,
      inject: [PrismaRatingsRepository],
      useFactory: (repo: PrismaRatingsRepository) =>
        new RatingsUseCases(repo, new Glicko2System()),
    },
  ],
})
export class RatingsModule {}
