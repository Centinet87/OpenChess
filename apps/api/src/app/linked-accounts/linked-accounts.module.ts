import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuthModule } from '../auth/auth.module';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { ClubLinkedAccountsController } from './api/controllers/club-linked-accounts.controller';
import { FideController } from './api/controllers/fide.controller';
import { LichessOAuthController } from './api/controllers/lichess-oauth.controller';
import { LinkedAccountsController } from './api/controllers/linked-accounts.controller';
import { LinkErrorFilter } from './api/filters/link-error.filter';
import { FIDE_COMMAND_HANDLERS } from './api/handlers/fide-command.handlers';
import { FIDE_QUERY_HANDLERS } from './api/handlers/fide-query.handlers';
import { LINKED_ACCOUNTS_COMMAND_HANDLERS } from './api/handlers/linked-accounts-command.handlers';
import { LINKED_ACCOUNTS_QUERY_HANDLERS } from './api/handlers/linked-accounts-query.handlers';
import { ImportedGames } from './application/events/imported-games.events';
import { LICHESS_OAUTH } from './application/repositories/lichess-oauth';
import {
  type ChessPlatform,
  type FideDirectory,
} from './application/repositories/linked-accounts.ports';
import { FideUseCases } from './application/use-cases/fide.use-cases';
import { LinkedAccountsUseCases } from './application/use-cases/linked-accounts.use-cases';
import { type Platform } from './domain/entities/platform';
import { ImportedGamesHub } from './infrastructure/events/imported-games.hub';
import { ChessComClient } from './infrastructure/platforms/chesscom';
import { FideClient } from './infrastructure/platforms/fide';
import { LichessClient } from './infrastructure/platforms/lichess';
import { PrismaFideLinksRepository } from './infrastructure/repositories/prisma-fide-links.repository';
import {
  PrismaImportedGamesRepository,
  PrismaLinkedAccountsRepository,
} from './infrastructure/repositories/prisma-linked-accounts.repository';

/** Las plataformas externas; los tests las cambian por dobles. */
export const CHESS_PLATFORMS = Symbol('CHESS_PLATFORMS');
export const FIDE_DIRECTORY = Symbol('FIDE_DIRECTORY');

/** Chess.com pide identificarse con un User-Agent que diga cómo contactarnos. */
const userAgent = (env: Env) => `OpenChess (+${env.PUBLIC_URL})`;

/** Cuentas de Lichess y Chess.com, importación de sus partidas y Elo FIDE de los miembros. */
@Module({
  imports: [AuthModule],
  controllers: [
    LinkedAccountsController,
    LichessOAuthController,
    ClubLinkedAccountsController,
    FideController,
  ],
  providers: [
    { provide: ImportedGames, useExisting: ImportedGamesHub },
    ...FIDE_QUERY_HANDLERS,
    ...FIDE_COMMAND_HANDLERS,
    ...LINKED_ACCOUNTS_QUERY_HANDLERS,
    ...LINKED_ACCOUNTS_COMMAND_HANDLERS,
    PrismaLinkedAccountsRepository,
    PrismaImportedGamesRepository,
    PrismaFideLinksRepository,
    ImportedGamesHub,
    { provide: APP_FILTER, useClass: LinkErrorFilter },
    {
      provide: LichessClient,
      inject: [ENV],
      useFactory: (env: Env) =>
        new LichessClient({
          baseUrl: env.LICHESS_URL,
          clientId: env.LICHESS_CLIENT_ID,
          redirectUri: `${env.PUBLIC_URL}/api/accounts/lichess/callback`,
          userAgent: userAgent(env),
        }),
    },
    { provide: LICHESS_OAUTH, useExisting: LichessClient },
    {
      provide: CHESS_PLATFORMS,
      inject: [LichessClient, ENV],
      useFactory: (
        lichess: LichessClient,
        env: Env,
      ): Record<Platform, ChessPlatform> => ({
        lichess,
        chesscom: new ChessComClient({
          baseUrl: env.CHESSCOM_API_URL,
          userAgent: userAgent(env),
        }),
      }),
    },
    {
      provide: LinkedAccountsUseCases,
      inject: [
        PrismaLinkedAccountsRepository,
        PrismaImportedGamesRepository,
        CHESS_PLATFORMS,
        ImportedGamesHub,
      ],
      useFactory: (
        accounts: PrismaLinkedAccountsRepository,
        games: PrismaImportedGamesRepository,
        platforms: Record<Platform, ChessPlatform>,
        hub: ImportedGamesHub,
      ) =>
        new LinkedAccountsUseCases({
          accounts,
          games,
          platforms,
          publisher: hub,
          newId: randomUUID,
          newCode: () => `openchess-${randomBytes(4).toString('hex')}`,
          now: () => new Date(),
        }),
    },
    {
      provide: FIDE_DIRECTORY,
      inject: [ENV],
      useFactory: (env: Env): FideDirectory =>
        new FideClient({ baseUrl: env.FIDE_URL, userAgent: userAgent(env) }),
    },
    {
      provide: FideUseCases,
      inject: [PrismaFideLinksRepository, FIDE_DIRECTORY],
      useFactory: (
        links: PrismaFideLinksRepository,
        directory: FideDirectory,
      ) => new FideUseCases({ links, directory, now: () => new Date() }),
    },
  ],
  exports: [ImportedGames],
})
export class LinkedAccountsModule {}
