import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ZodPipe } from '../common/zod.pipe';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthGuard } from './auth.guard';
import { AccountEmailsService } from './account-emails.service';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type TokenInput,
} from './auth.schemas';
import { AuthService, type Profile } from './auth.service';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from './cookies';

// Login y registro: 5 intentos por minuto por IP y email (ver AppThrottlerGuard).
const STRICT = { default: { limit: 5, ttl: 60_000 } };

/** cookie-parser convierte en objeto una cookie que empieza con "j:": solo sirve un string. */
function refreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emails: AccountEmailsService,
    private readonly cls: ClsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @Throttle(STRICT)
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const { session, userId } = await this.auth.register(body);
    setSessionCookies(res, session, this.env);
    this.emails.queueVerification(userId);
    return { ok: true };
  }

  /** El link del email de verificación lleva aquí (desde la página /verificar del front). */
  @Post('verify-email')
  @HttpCode(204)
  @Throttle(STRICT)
  async verifyEmail(
    @Body(new ZodPipe(tokenSchema)) body: TokenInput,
  ): Promise<void> {
    await this.emails.verifyEmail(body.token);
  }

  @Post('verification-email')
  @HttpCode(204)
  @Throttle(STRICT)
  @UseGuards(AuthGuard)
  resendVerification(): void {
    this.emails.queueVerification(this.cls.get('userId'));
  }

  /** Responde 204 exista o no la cuenta. */
  @Post('forgot-password')
  @HttpCode(204)
  @Throttle(STRICT)
  forgotPassword(
    @Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): void {
    this.emails.requestPasswordReset(body.email);
  }

  /** Cambia la contraseña con el link del email y cierra todas las sesiones. */
  @Post('reset-password')
  @HttpCode(204)
  @Throttle(STRICT)
  async resetPassword(
    @Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    await this.emails.resetPassword(body.token, body.password);
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
        await this.auth.refresh(refreshCookie(req)),
        this.env,
      );
      return { ok: true };
    } catch (error) {
      // Solo si la sesión ya no sirve: ante una caída de la BD el usuario sigue logueado.
      if (error instanceof UnauthorizedException)
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
    await this.auth.logout(refreshCookie(req));
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(): Promise<Profile> {
    return this.auth.profile(this.cls.get('userId'));
  }
}
