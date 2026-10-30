import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppSocketAdapter } from './common/socket.adapter';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

/** Lo comparten main.ts y los tests, para que prueben la misma app. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api');
  // No anunciar el framework en cada respuesta.
  app.disable('x-powered-by');
  app.use(cookieParser());
  // req.ip toma la IP del cliente saltando esta cantidad de proxies (ver TRUST_PROXY en env.ts).
  app.set('trust proxy', env.TRUST_PROXY);
  app.useWebSocketAdapter(new AppSocketAdapter(app, env.APP_DOMAIN));
}
