import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  // Ante la señal de apagado de un deploy: deja de aceptar conexiones, termina
  // los envíos de email pendientes y cierra la BD (los onModuleDestroy).
  app.enableShutdownHooks();
  const port = app.get<Env>(ENV).PORT;
  await app.listen(port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    // Function keeps TypeScript and bundlers from rewriting or bundling the import
    const load = new Function('s', 'return import(s)') as (
      s: string,
    ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
    const readySignal = await load('@nx/js/ready-signal').catch(
      (error: unknown) => {
        // @nx/js isn't installed
        if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND')
          return null;
        throw error;
      },
    );
    readySignal?.emitReadySignal(app.getHttpServer());
  }
  Logger.log(`API escuchando en http://localhost:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
