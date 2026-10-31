import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { AuthModule } from './auth/auth.module';
import { ClubsModule } from './clubs/clubs.module';
import {
  AppThrottlerGuard,
  EMAIL_THROTTLER,
  USER_THROTTLER,
} from './common/throttler.guard';
import { ConfigModule } from './config/config.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/prisma.module';
import { LinkedAccountsModule } from './linked-accounts/linked-accounts.module';
import { RatingsModule } from './ratings/ratings.module';
import { TenantMiddleware } from './tenant/api/middleware/tenant.middleware';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // Limitación: el conteo vive en memoria, así que con varias instancias cada una cuenta por separado. Pasar a Redis al escalar.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      EMAIL_THROTTLER,
      USER_THROTTLER,
    ]),
    ConfigModule,
    HealthModule,
    PrismaModule,
    TenantModule,
    AuthModule,
    ClubsModule,
    GamesModule,
    RatingsModule,
    LinkedAccountsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
