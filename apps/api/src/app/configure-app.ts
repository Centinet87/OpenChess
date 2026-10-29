import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/** Lo comparten main.ts y los tests, para que prueben la misma app. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // req.ip toma la IP del cliente saltando esta cantidad de proxies (ver TRUST_PROXY en env.ts).
  app.set('trust proxy', env.TRUST_PROXY);
}
