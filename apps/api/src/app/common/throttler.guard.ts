import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerOptions } from '@nestjs/throttler';
import { ACCESS_COOKIE } from '../auth/infrastructure/http/cookies';

/** El email del body (login, registro, recuperar la contraseña), normalizado. */
export function bodyEmail(body: unknown): string | undefined {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : undefined;
}

/**
 * Clave del rate limit: la IP y, si el body trae email (login, registro), también el email.
 * Así un atacante que prueba claves contra una cuenta no bloquea el login de otras
 * personas que salen por la misma IP (una oficina, un colegio, un proxy).
 */
export function throttleKey(ip: string | undefined, body: unknown): string {
  const email = bodyEmail(body);
  return `${ip ?? 'unknown'}${email === undefined ? '' : `:${email}`}`;
}

/**
 * Límite por cuenta, sin importar la IP. La API también recibe requests
 * directas (sin pasar por Vercel), y en esas la IP sale de X-Forwarded-For, que
 * pone el cliente. Frena probar claves contra una cuenta o llenarle a alguien la
 * casilla de emails de recuperación cambiando de IP. Se cuenta por ruta.
 */
export const EMAIL_THROTTLER: ThrottlerOptions = {
  name: 'email',
  ttl: 15 * 60_000,
  limit: 10,
  getTracker: (req) => `email:${bodyEmail(req['body'])}`,
  skipIf: (context: ExecutionContext) =>
    bodyEmail(context.switchToHttp().getRequest<{ body?: unknown }>().body) ===
    undefined,
};

/**
 * El usuario del access token, sin verificar la firma: solo sirve para contar.
 * Un token inventado igual responde 401 después, en AuthGuard.
 */
export function tokenSubject(req: {
  cookies?: Record<string, unknown>;
}): string | undefined {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string') return undefined;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    const sub = (payload as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Límite por usuario, sin importar la IP (ver EMAIL_THROTTLER): con sesión,
 * cambiar de IP no da más intentos. El tope general es holgado; las rutas caras
 * o delicadas lo bajan con perIpAndUser.
 */
export const USER_THROTTLER: ThrottlerOptions = {
  name: 'user',
  ttl: 60_000,
  limit: 300,
  getTracker: (req) => `user:${tokenSubject(req)}`,
  skipIf: (context: ExecutionContext) =>
    tokenSubject(
      context
        .switchToHttp()
        .getRequest<{ cookies?: Record<string, unknown> }>(),
    ) === undefined,
};

/** El mismo límite por IP y por usuario: para @Throttle en rutas caras o delicadas. */
export function perIpAndUser(limit: number, ttl = 60_000) {
  return { default: { limit, ttl }, user: { limit, ttl } };
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    return throttleKey(req['ip'] as string | undefined, req['body']);
  }
}
