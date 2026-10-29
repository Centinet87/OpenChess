import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE } from './cookies';

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
    } catch {
      throw new UnauthorizedException();
    }
  }
}
