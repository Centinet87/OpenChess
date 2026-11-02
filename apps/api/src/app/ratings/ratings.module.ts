import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { LinkedAccountsModule } from '../linked-accounts/linked-accounts.module';
import { RatingsController } from './api/controllers/ratings.controller';
import { RATINGS_COMMAND_HANDLERS } from './api/handlers/ratings-command.handlers';
import { RATINGS_QUERY_HANDLERS } from './api/handlers/ratings-query.handlers';
import { RatingsListener } from './api/handlers/ratings.listener';
import { RatingsUseCases } from './application/use-cases/ratings.use-cases';
import { Glicko2System } from './domain/services/rating-system';
import { PrismaFideSeeds } from './infrastructure/repositories/prisma-fide-seeds';
import { PrismaRatingsRepository } from './infrastructure/repositories/prisma-ratings.repository';

/** Ranking Glicko-2 por club. Se entera de las partidas por eventos: las del club y las importadas. */
@Module({
  imports: [AuthModule, GamesModule, LinkedAccountsModule],
  controllers: [RatingsController],
  providers: [
    ...RATINGS_QUERY_HANDLERS,
    ...RATINGS_COMMAND_HANDLERS,
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
