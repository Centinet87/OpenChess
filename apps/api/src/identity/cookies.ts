import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';
import { REFRESH_TTL_MS, type Session } from './auth.service';

export const ACCESS_COOKIE = 'oc_at';
export const REFRESH_COOKIE = 'oc_rt';

const ACCESS_TTL_MS = 15 * 60 * 1000;
// El refresh solo viaja a las rutas de auth, no en cada request.
const REFRESH_PATH = '/api/auth';

function baseOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN,
  };
}

export function setSessionCookies(
  res: Response,
  session: Session,
  env: Env,
): void {
  const options = baseOptions(env);
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...options,
    path: '/',
    maxAge: ACCESS_TTL_MS,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...options,
    path: REFRESH_PATH,
    maxAge: REFRESH_TTL_MS,
  });
}

export function clearSessionCookies(res: Response, env: Env): void {
  const options = baseOptions(env);
  res.clearCookie(ACCESS_COOKIE, { ...options, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...options, path: REFRESH_PATH });
}
