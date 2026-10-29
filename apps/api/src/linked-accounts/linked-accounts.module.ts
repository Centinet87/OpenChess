import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import {
  LinkedAccountsUseCases,
  type ChessPlatform,
  type Platform,
} from '@openchess/linked-accounts';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { IdentityModule } from '../identity/identity.module';
import { ChessComClient } from './chesscom';
import { ImportedGamesHub } from './imported-games.hub';
import { LichessClient } from './lichess';
import { LinkErrorFilter } from './link-error.filter';
import {
  ClubLinkedAccountsController,
  LICHESS_OAUTH,
  LichessOAuthController,
  LinkedAccountsController,
} from './linked-accounts.controller';
import {
  PrismaImportedGamesRepository,
  PrismaLinkedAccountsRepository,
} from './prisma-linked-accounts.repository';

/** Las plataformas externas; los tests las cambian por dobles. */
export const CHESS_PLATFORMS = Symbol('CHESS_PLATFORMS');

/** Chess.com pide identificarse con un User-Agent que diga cómo contactarnos. */
const userAgent = (env: Env) => `OpenChess (+${env.PUBLIC_URL})`;

/** Cuentas de Lichess y Chess.com, e importación de sus partidas a los clubes. */
@Module({
  imports: [IdentityModule],
  controllers: [
    LinkedAccountsController,
    LichessOAuthController,
    ClubLinkedAccountsController,
  ],
  providers: [
    PrismaLinkedAccountsRepository,
    PrismaImportedGamesRepository,
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
  ],
  exports: [ImportedGamesHub],
})
export class LinkedAccountsModule {}
