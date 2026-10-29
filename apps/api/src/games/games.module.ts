import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GamesUseCases } from '@openchess/games';
import { IdentityModule } from '../identity/identity.module';
import { GameClockScheduler } from './game-clock.scheduler';
import { GameErrorFilter } from './game-errors';
import { GameEventsHub } from './game-events.hub';
import { GamesController } from './games.controller';
import { GamesGateway } from './games.gateway';
import { PrismaGamesRepository } from './prisma-games.repository';

@Module({
  imports: [IdentityModule],
  controllers: [GamesController],
  providers: [
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
  exports: [GameEventsHub],
})
export class GamesModule {}
