import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../../application/auth.service';
import { ACCESS_COOKIE } from './cookies';

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
    private readonly auth: AuthService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string') throw new UnauthorizedException();

    try {
      const { sub } = await this.auth.verifyAccessToken(token);
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
