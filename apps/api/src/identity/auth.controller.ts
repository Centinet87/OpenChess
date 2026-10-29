import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ZodPipe } from '../common/zod.pipe';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { TenantPrisma } from '../infrastructure/prisma.module';
import { AuthGuard } from './auth.guard';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './auth.schemas';
import { AuthService } from './auth.service';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from './cookies';

// Login y registro: 5 intentos por minuto por IP.
const STRICT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: TenantPrisma,
    private readonly cls: ClsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @Throttle(STRICT)
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    setSessionCookies(res, await this.auth.register(body), this.env);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(STRICT)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    setSessionCookies(res, await this.auth.login(body), this.env);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    try {
      setSessionCookies(
        res,
        await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]),
        this.env,
      );
      return { ok: true };
    } catch (error) {
      clearSessionCookies(res, this.env);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(): Promise<{ id: string; email: string; displayName: string }> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: this.cls.get('userId') },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) throw new NotFoundException();
    return user;
  }
}
