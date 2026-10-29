import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Clave del rate limit: la IP y, si el body trae email (login, registro), también el email.
 * Así un atacante que prueba claves contra una cuenta no bloquea el login de otras
 * personas que salen por la misma IP (una oficina, un colegio, un proxy).
 */
export function throttleKey(ip: string | undefined, body: unknown): string {
  const email = (body as { email?: unknown } | undefined)?.email;
  const suffix =
    typeof email === 'string' ? `:${email.trim().toLowerCase()}` : '';
  return `${ip ?? 'unknown'}${suffix}`;
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    return throttleKey(req['ip'] as string | undefined, req['body']);
  }
}
