import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { QueryBus } from '@nestjs/cqrs';
import { VerifyAccessTokenQuery } from '../../application/queries/auth.queries';
import type { AccessTokenPayload } from '../../domain/auth.types';
import { ACCESS_COOKIE } from '../cookies/session.cookies';

// Errores que lanza jsonwebtoken (vía @nestjs/jwt) cuando el token no sirve.
const JWT_ERRORS = new Set([
  'JsonWebTokenError',
  'TokenExpiredError',
  'NotBeforeError',
]);

function isJwtError(error: unknown): boolean {
  return error instanceof Error && JWT_ERRORS.has(error.name);
}

/** Exige un access token válido y deja el userId en el contexto (lo usa RLS). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly queries: QueryBus,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string') throw new UnauthorizedException();

    try {
      const { sub } = await this.queries.execute<
        VerifyAccessTokenQuery,
        AccessTokenPayload
      >(new VerifyAccessTokenQuery(token));
      this.cls.set('userId', sub);
      return true;
    } catch (error) {
      // Token vencido o inválido. Cualquier otro error (p. ej. un secreto mal
      // configurado) se deja pasar como 500 para que quede en el log.
      if (isJwtError(error)) throw new UnauthorizedException();
      throw error;
    }
  }
}
