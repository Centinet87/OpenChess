import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Lo comparten main.ts y los tests, para que prueben la misma app. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Detrás de un proxy (Next en Vercel, Fly.io): req.ip toma la IP real del cliente para el rate limit.
  app.set('trust proxy', 1);
}
