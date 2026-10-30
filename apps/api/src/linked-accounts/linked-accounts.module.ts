import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import {
  FideUseCases,
  LinkedAccountsUseCases,
  type ChessPlatform,
  type FideDirectory,
  type Platform,
} from '@openchess/linked-accounts';
import { ENV } from '../app/config/config.module';
import type { Env } from '../app/config/env';
import { AuthModule } from '../app/auth/auth.module';
import { ChessComClient } from './chesscom';
import { FideClient } from './fide';
import { ImportedGamesHub } from './imported-games.hub';
import { LichessClient } from './lichess';
import { LinkErrorFilter } from './link-error.filter';
import {
  ClubLinkedAccountsController,
  FideController,
  LICHESS_OAUTH,
  LichessOAuthController,
  LinkedAccountsController,
} from './linked-accounts.controller';
import { PrismaFideLinksRepository } from './prisma-fide-links.repository';
import {
  PrismaImportedGamesRepository,
  PrismaLinkedAccountsRepository,
} from './prisma-linked-accounts.repository';

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
  exports: [ImportedGamesHub],
})
export class LinkedAccountsModule {}
