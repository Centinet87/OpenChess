import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { ConfigModule } from '../config/config.module';
import { ClubsModule } from '../clubs/clubs.module';
import { GamesModule } from '../games/games.module';
import { AppThrottlerGuard } from '../common/throttler.guard';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../infrastructure/prisma.module';
import { TenantMiddleware } from '../tenant/tenant.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // shortcut: el conteo vive en memoria, así que con varias instancias cada una cuenta por separado. Pasar a Redis al escalar.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ConfigModule,
    PrismaModule,
    IdentityModule,
    ClubsModule,
    GamesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
