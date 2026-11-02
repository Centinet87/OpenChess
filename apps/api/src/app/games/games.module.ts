import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AuthModule } from '../auth/auth.module';
import { GamesController } from './api/controllers/games.controller';
import { GameErrorFilter } from './api/filters/game-errors';
import { GamesGateway } from './api/gateways/games.gateway';
import { GAMES_COMMAND_HANDLERS } from './api/handlers/games-command.handlers';
import { GAMES_QUERY_HANDLERS } from './api/handlers/games-query.handlers';
import { GameEvents } from './application/events/game.events';
import { GamesUseCases } from './application/use-cases/games.use-cases';
import { GameEventsHub } from './infrastructure/events/game-events.hub';
import { PrismaGamesRepository } from './infrastructure/repositories/prisma-games.repository';
import { GameClockScheduler } from './infrastructure/scheduling/game-clock.scheduler';

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [
    { provide: GameEvents, useExisting: GameEventsHub },
    ...GAMES_QUERY_HANDLERS,
    ...GAMES_COMMAND_HANDLERS,
    PrismaGamesRepository,
    GameEventsHub,
    GameClockScheduler,
    GamesGateway,
    { provide: APP_FILTER, useClass: GameErrorFilter },
    {
      provide: GamesUseCases,
      inject: [PrismaGamesRepository, GameEventsHub],
      useFactory: (repo: PrismaGamesRepository, hub: GameEventsHub) =>
        new GamesUseCases({
          games: repo,
          members: repo,
          publisher: hub,
          newId: randomUUID,
          now: Date.now,
          random: Math.random,
        }),
    },
  ],
  exports: [GameEvents],
})
export class GamesModule {}
